import { catalogCacheKey, getCatalogRuntimeCache, setCatalogRuntimeCache } from "./catalog-runtime-cache.js";

// Advance whenever provider precedence, validation, or canonical-series rules change.
export const VERIFIED_IDENTITY_SCHEMA = 3;
const TTL_SECONDS = 6 * 60 * 60;

export function verifiedIdentityCacheKey(row) {
  return catalogCacheKey("verified-identity", {
    version: VERIFIED_IDENTITY_SCHEMA,
    id: Number(row.id), idMal: row.idMal ?? row.malId ?? null, format: row.format, type: row.type,
    title: row.title, synonyms: row.synonyms, startDate: row.startDate,
    endDate: row.endDate, status: row.status, countryOfOrigin: row.countryOfOrigin,
    externalLinks: row.externalLinks, relations: row.relations,
  });
}

export async function getVerifiedIdentity(row, key = verifiedIdentityCacheKey(row)) {
  const cached = await getCatalogRuntimeCache(key);
  if (cached?.version !== VERIFIED_IDENTITY_SCHEMA || cached.anilistId !== Number(row.id)
    || !Number.isFinite(cached.verifiedAt) || Date.now() - cached.verifiedAt >= TTL_SECONDS * 1000
    || !Array.isArray(cached.records) || !cached.records.length) return null;
  if (Array.isArray(cached.relatedProviderIds)) row.relatedProviderIds = cached.relatedProviderIds;
  if (Array.isArray(cached.relatedProviderTitles)) row.relatedProviderTitles = cached.relatedProviderTitles;
  return cached.records;
}

export async function setVerifiedIdentity(row, records, key = verifiedIdentityCacheKey(row)) {
  return setCatalogRuntimeCache(key, {
    version: VERIFIED_IDENTITY_SCHEMA, anilistId: Number(row.id), verifiedAt: Date.now(), records,
    relatedProviderIds: row.relatedProviderIds || [], relatedProviderTitles: row.relatedProviderTitles || [],
  }, TTL_SECONDS);
}
