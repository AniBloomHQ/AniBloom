import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalCatalogCache } from "../lib/local-catalog-cache.js";
import { queryAnime, clearAniListRateLimitState } from "../lib/catalog-anilist.js";
import { setCatalogRuntimeCacheForTests } from "../lib/catalog-runtime-cache.js";
import { verifiedIdentityCacheKey } from "../lib/verified-identity-cache.js";

test("shared AniList hits promote to usable process-memory entries", async () => {
  let reads = 0;
  setCatalogRuntimeCacheForTests({ async get() { reads++; return { Page: { media: [{ id: 123 }] } }; } });
  clearAniListRateLimitState();
  try {
    const filter = { season: { season: "FALL", year: 2026 }, sort: ["ID"] };
    await queryAnime(filter, 1);
    await queryAnime(filter, 1);
    assert.equal(reads, 1, "a second identical request should use the promoted memory entry");
  } finally { setCatalogRuntimeCacheForTests(null); clearAniListRateLimitState(); }
});

test("local cache expires entries, isolates mutations, and evicts least recently used entries", async () => {
  let now = 1000;
  const cache = await createLocalCatalogCache({ maxEntries: 2, now: () => now });
  await cache.set("a", { id: 1 }, { ttl: 2 });
  const value = await cache.get("a"); value.id = 99;
  assert.equal((await cache.get("a")).id, 1);
  await cache.set("b", {}, { ttl: 10 });
  await cache.get("a");
  await cache.set("c", {}, { ttl: 10 });
  assert.equal(await cache.get("b"), undefined);
  now = 3001;
  assert.equal(await cache.get("a"), undefined);
});

test("local prepared catalogs and verified IDs survive restart without persisting raw AniList responses", async () => {
  const directory = await mkdtemp(join(tmpdir(), "anibloom-cache-"));
  const file = join(directory, "cache.json");
  let now = 1000;
  try {
    const cache = await createLocalCatalogCache({ file, now: () => now });
    await cache.set("catalog-response:sample", { metas: [{ id: "tt1234567" }] }, { ttl: 60 });
    await cache.set("verified-identity:sample", { verified: true }, { ttl: 60 });
    await cache.set("anilist-response:sample", { raw: true }, { ttl: 60 });
    await cache.flush();
    assert.doesNotMatch(await readFile(file, "utf8"), /anilist-response|"raw"/);
    const restarted = await createLocalCatalogCache({ file, now: () => now });
    assert.equal((await restarted.get("catalog-response:sample")).metas[0].id, "tt1234567");
    assert.deepEqual(await restarted.get("verified-identity:sample"), { verified: true });
    now = 61001;
    const expired = await createLocalCatalogCache({ file, now: () => now });
    assert.equal(await expired.get("catalog-response:sample"), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("identity cache keys change when title, media format or franchise evidence changes", () => {
  const row = { id: 1, title: { english: "Example" }, format: "TV", relations: { edges: [] } };
  const key = verifiedIdentityCacheKey(row);
  assert.notEqual(verifiedIdentityCacheKey({ ...row, format: "MOVIE" }), key);
  assert.notEqual(verifiedIdentityCacheKey({ ...row, title: { english: "Example Season 2" } }), key);
  assert.notEqual(verifiedIdentityCacheKey({ ...row, relations: { edges: [{ relationType: "PREQUEL", node: { id: 2 } }] } }), key);
  assert.doesNotMatch(key, /Example/);
});
