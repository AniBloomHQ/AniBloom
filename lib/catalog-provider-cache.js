import { catalogCacheKey, getCatalogRuntimeCache, setCatalogRuntimeCache } from "./catalog-runtime-cache.js";
import { checkCatalogDeadline } from "./catalog-deadline.js";
import { verifiedIdentityCacheKey } from "./verified-identity-cache.js";

/** Cache requested records, not full remote datasets. Failed calls never become misses. */
export function cacheProviderLookup(source, resolve, rows, { cacheEmpty = false } = {}) {
  const byId = new Map(rows.map(row => [Number(row.id), row]));
  return async targets => {
    const idOf = target => Number(typeof target === "object" ? target.id ?? target.anilistId : target);
    const unique = [...new Map(targets.map(target => [idOf(target), target])).values()];
    const keyOf = target => catalogCacheKey("provider-mapping", {
      version: 1, source,
      evidence: verifiedIdentityCacheKey(typeof target === "object" ? target : byId.get(idOf(target)) || { id: idOf(target) }),
    });
    const keys = unique.map(keyOf);
    const cached = await Promise.all(keys.map(getCatalogRuntimeCache));
    const result = new Map();
    const missing = unique.filter((target, index) => {
      const hit = cached[index];
      if (!Array.isArray(hit?.records) || !Number.isFinite(hit.expiresAt) || hit.expiresAt <= Date.now()) return true;
      if (hit.records.length) result.set(idOf(target), hit.records);
      return false;
    });
    if (!missing.length) return result;
    const resolved = await resolve(missing);
    checkCatalogDeadline();
    await Promise.all(missing.map(async target => {
      const records = resolved.get(idOf(target)) || [];
      if (records.length) result.set(idOf(target), records);
      if (records.length || cacheEmpty) {
        const ttl = records.length ? 6 * 60 * 60 : 300;
        await setCatalogRuntimeCache(keyOf(target), { records, expiresAt: Date.now() + ttl * 1000 }, ttl);
      }
    }));
    return result;
  };
}
