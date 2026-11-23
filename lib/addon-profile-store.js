import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Redis } from "@upstash/redis";
import { getAniListRedisCredentials } from "./catalog-rate-limiter.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WINDOW_SECONDS = 600;

export function normalizeProfileId(value) {
  return typeof value === "string" && UUID_V4.test(value) ? value.toLowerCase() : null;
}

export function createLocalProfileStore(directory) {
  const attempts = new Map();
  function profileFile(id) {
    if (!normalizeProfileId(id) || id !== id.toLowerCase()) throw new Error("Invalid profile ID");
    return join(directory, id + ".json");
  }
  return {
    async get(id) {
      try {
        return JSON.parse(await readFile(profileFile(id), "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async put(id, record, { create = false } = {}) {
      const file = profileFile(id);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = join(directory, randomUUID() + ".tmp");
      try {
        await writeFile(temporary, JSON.stringify(record), { flag: "wx", mode: 0o600 });
        if (create) await link(temporary, file);
        else await rename(temporary, file);
      } catch (error) {
        if (create && error.code === "EEXIST") return false;
        throw error;
      } finally {
        await unlink(temporary).catch(() => {});
      }
      return true;
    },
    async attempt(key, max) {
      const now = Date.now();
      const previous = attempts.get(key);
      const state = previous?.end > now ? previous : { count: 0, end: now + WINDOW_SECONDS * 1000 };
      attempts.delete(key);
      attempts.set(key, state);
      if (attempts.size > 4096) attempts.delete(attempts.keys().next().value);
      state.count++;
      return state.count <= max ? 0 : Math.ceil((state.end - now) / 1000);
    },
  };
}

const ATTEMPT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
if count <= tonumber(ARGV[2]) then return 0 end
return math.max(redis.call("TTL", KEYS[1]), 1)
`;

export function createHostedProfileStore(
  credentials = getAniListRedisCredentials(),
  { environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "production" } = {},
) {
  if (!credentials) return null;
  const redis = new Redis({
    ...credentials,
    enableTelemetry: false,
    retry: false,
    signal: () => AbortSignal.timeout(2000),
  });
  const prefix = `anibloom:profile:v1:${environment}:`;
  return {
    get(id) { return redis.get(prefix + id); },
    async put(id, record, { create = false } = {}) {
      return (await redis.set(prefix + id, record, create ? { nx: true } : { xx: true })) === "OK";
    },
    attempt(key, max) {
      return redis.eval(ATTEMPT_SCRIPT, [prefix + "limit:" + key], [WINDOW_SECONDS, max]);
    },
  };
}
