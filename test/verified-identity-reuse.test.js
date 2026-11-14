import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeCatalogPage, configureCatalogPipeline } from "../api/catalog-source.js";
import { setCatalogRuntimeCacheForTests } from "../lib/catalog-runtime-cache.js";

function row() {
  return { id: 999991, idMal: 999992, format: "TV", title: { english: "Verified example" }, startDate: { year: 2026 }, relations: { edges: [] } };
}

function dependencies(resolveMappings) {
  const empty = async () => new Map();
  return {
    resolveMappings, resolveFribbMappings: empty, resolveExternalMappings: () => new Map(),
    resolveAnimapMappings: empty, resolveIdMapperMappings: empty, resolveTMDBMappings: empty,
    resolveAnimeMapperMappings: empty, resolveAnimeMapperRelatedProviderIds: empty,
    resolveCanonicalSeriesMappings: empty, resolveAniBridgeMappings: empty,
    resolveTsvMappings: empty, resolveImdbMappings: empty, validateImdbMappings: empty,
    resolveSecondaryMappings: empty, resolveAlternativeMappings: empty,
    allowProductionIdentityCache: true,
  };
}

test("a verified mapping is reused without changing catalog IDs, and changed evidence invalidates it", async () => {
  const cache = new Map();
  setCatalogRuntimeCacheForTests({ async get(key) { return structuredClone(cache.get(key)); }, async set(key, value) { cache.set(key, structuredClone(value)); } });
  configureCatalogPipeline({ optimized: true });
  let calls = 0;
  const options = dependencies(async ids => {
    calls++;
    return new Map(ids.map(id => [id, [{ source: "animeapi", anilistId: id, type: "TV", imdbIds: ["tt1234567"] }]]));
  });
  try {
    const first = await canonicalizeCatalogPage([row()], options);
    const repeat = await canonicalizeCatalogPage([row()], options);
    assert.equal(first[0].id, "tt1234567");
    assert.deepEqual(repeat, first);
    assert.equal(calls, 1);
    await canonicalizeCatalogPage([{ ...row(), startDate: { year: 2027 } }], options);
    assert.equal(calls, 2);
  } finally { configureCatalogPipeline(); setCatalogRuntimeCacheForTests(null); }
});

test("unresolved fallbacks are not stored as verified identities", async () => {
  const cache = new Map();
  setCatalogRuntimeCacheForTests({ async get(key) { return cache.get(key); }, async set(key, value) { cache.set(key, value); } });
  configureCatalogPipeline({ optimized: true });
  let calls = 0;
  const options = dependencies(async () => { calls++; return new Map(); });
  try {
    await canonicalizeCatalogPage([row()], options);
    const afterFirst = calls;
    await canonicalizeCatalogPage([row()], options);
    assert.ok(calls > afterFirst);
    assert.equal([...cache.keys()].filter(key => key.startsWith("verified-identity:")).length, 0);
  } finally { configureCatalogPipeline(); setCatalogRuntimeCacheForTests(null); }
});

test("provisional canonical TMDB roots can improve to a verified current IMDb identity", async () => {
  const cache = new Map();
  setCatalogRuntimeCacheForTests({ async get(key) { return structuredClone(cache.get(key)); }, async set(key, value) { cache.set(key, structuredClone(value)); } });
  configureCatalogPipeline({ optimized: true });
  let verifiedCurrent = false;
  const options = dependencies(async ids => verifiedCurrent
    ? new Map(ids.filter(id => id === 999991).map(id => [id, [{ source: "animeapi", anilistId: id, type: "TV", imdbIds: ["tt1234567"] }]]))
    : new Map());
  options.resolveCanonicalSeriesMappings = async () => verifiedCurrent ? new Map() : new Map([[999991, {
    canonicalTitle: "Franchise root", canonicalMalId: 999993, canonicalExternal: { tmdb: 1234 }, canonicalAnilistId: 999994,
  }]]);
  const media = { ...row(), relations: { edges: [{ relationType: "PREQUEL", node: { id: 999994, title: { english: "Franchise root" } } }] } };
  try {
    assert.equal((await canonicalizeCatalogPage([structuredClone(media)], options))[0].id, "tmdb:1234");
    assert.equal([...cache.keys()].filter(key => key.startsWith("verified-identity:")).length, 0);
    verifiedCurrent = true;
    assert.equal((await canonicalizeCatalogPage([structuredClone(media)], options))[0].id, "tt1234567");
  } finally { configureCatalogPipeline(); setCatalogRuntimeCacheForTests(null); }
});
