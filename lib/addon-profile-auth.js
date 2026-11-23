import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const SESSION_SECONDS = 30 * 60;
const COOKIE_NAME = "anibloom_profile";

export function validNewPassword(password) {
  return typeof password === "string"
    && [...password].length >= 12 && Buffer.byteLength(password) <= 256;
}

export async function createProfileCredentials(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 32, SCRYPT_OPTIONS);
  return { salt, passwordHash: hash.toString("hex"), sessionKey: randomBytes(32).toString("hex") };
}

export async function checkProfilePassword(password, record) {
  if (!password || Buffer.byteLength(password) > 256) return false;
  const hash = await derive(password, record.salt, 32, SCRYPT_OPTIONS);
  return timingSafeEqual(hash, Buffer.from(record.passwordHash, "hex"));
}

function sign(id, expires, key) {
  return createHmac("sha256", Buffer.from(key, "hex")).update(`${id}.${expires}`).digest();
}

export function makeProfileCookie(id, key, secure) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const token = key ? `${expires}.${sign(id, expires, key).toString("hex")}` : "";
  return `${COOKIE_NAME}=${token}; Path=/${id}/configure; Max-Age=${key ? SESSION_SECONDS : 0}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function isSignedIn(request, id, key) {
  const cookie = request.headers.get("cookie")?.split(";")
    .map(value => value.trim()).find(value => value.startsWith(COOKIE_NAME + "="));
  const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(cookie?.slice(COOKIE_NAME.length + 1) || "");
  if (!match || Number(match[1]) <= Math.floor(Date.now() / 1000)) return false;
  return timingSafeEqual(Buffer.from(match[2], "hex"), sign(id, match[1], key));
}
