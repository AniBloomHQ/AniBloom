import { isIP } from "node:net";

const DEFAULT_PUBLIC_ORIGIN = "https://anibloom.vercel.app";
const INVALID_ORIGIN = "ANIBLOOM_PUBLIC_ORIGIN must be a validated HTTPS origin without credentials, path, query or fragment (private HTTP is development-only).";

function isLocalDevelopmentHost(hostname) {
  const host=String(hostname || "").toLowerCase();
  if (["localhost","127.0.0.1","[::1]"].includes(host) || host.endsWith(".localhost")) return true;
  if (isIP(host) !== 4) return false;
  const parts=host.split(".").map(Number);
  return parts[0] === 10 || parts[0] === 127
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

/** Never use untrusted request Host headers to determine publicly advertised links. */
export function resolvePublicOrigin(value, { allowLocalHttp = false } = {}) {
  if (value === undefined || value === null || value === "") return DEFAULT_PUBLIC_ORIGIN;
  if (typeof value !== "string" || value.length > 512 || /[\s\x00-\x1f\x7f]/.test(value)) {
    throw new Error(INVALID_ORIGIN);
  }
  try {
    const url = new URL(value);
    const validProtocol = url.protocol === "https:"
      || (url.protocol === "http:" && allowLocalHttp && isLocalDevelopmentHost(url.hostname));
    if (!validProtocol || !url.hostname || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) {
      throw new Error(INVALID_ORIGIN);
    }
    return url.origin;
  } catch {
    throw new Error(INVALID_ORIGIN);
  }
}

export const BASE_URL = resolvePublicOrigin(process.env.ANIBLOOM_PUBLIC_ORIGIN, {
  allowLocalHttp: process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production",
});
export const ADDON_DOMAIN = "anibloom.vercel.app";
export const REPOSITORY_URL = "https://github.com/AniBloomHQ/AniBloom";
