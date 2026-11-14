import { catalogCacheKey, getCatalogRuntimeCache, setCatalogRuntimeCache } from "./catalog-runtime-cache.js";
import { checkCatalogDeadline } from "./catalog-deadline.js";

export const SHARED_PROVIDER_TTL_MS = 6 * 60 * 60 * 1000;
let enabled = process.env.ANIBLOOM_OPTIMIZED_CATALOGS === "1";

export function configureSharedProviderCaching(value = false) {
  enabled = value === true;
}

export function isSharedProviderCachingEnabled() {
  return enabled;
}

function keyFor(source, identity) {
  return catalogCacheKey("provider-mapping", { version: 2, source, identity });
}

/** Cache source facts, never a final identity decision or an upstream failure. */
export async function getSharedProviderValue(source, identity, validate, now = Date.now()) {
  if (!enabled) return null;
  const entry = await getCatalogRuntimeCache(keyFor(source, identity));
  if (entry?.version !== 1 || !Number.isFinite(entry.expiresAt)
    || entry.expiresAt <= now || entry.expiresAt > now + SHARED_PROVIDER_TTL_MS
    || !validate(entry.value)) return null;
  return entry;
}

export async function setSharedProviderValue(source, identity, value, now = Date.now()) {
  if (!enabled) return false;
  checkCatalogDeadline();
  return setCatalogRuntimeCache(keyFor(source, identity), {
    version: 1, value, expiresAt: now + SHARED_PROVIDER_TTL_MS,
  }, SHARED_PROVIDER_TTL_MS / 1000);
}
