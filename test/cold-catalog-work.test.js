import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeCatalogPage, configureCatalogPipeline, buildRollingCatalog } from "../api/catalog-source.js";
import { createFallbackPrefetch } from "../lib/catalog-prefetch.js";

const empty = async () => new Map();
const media = () => ({ id: 9001, idMal: 9002, format: "TV", title: { english: "Example Season 2" },
  startDate: { year: 2026 }, relations: { edges: [{ relationType: "PREQUEL", node: { id: 8001, title: { english: "Example" } } }] } });
function options({ tmdb = 1234, currentImdb = null, canonicalImdb = "tt8001", onRoot = () => {} } = {}) {
  return {
    resolveMappings: async () => currentImdb ? new Map([[9001, [{ source: "animeapi", anilistId: 9001, type: "TV", imdbIds: [currentImdb], title: "Example Season 2", year: 2026 }]]]) : new Map(),
    resolveFribbMappings: empty, resolveExternalMappings: () => new Map(), resolveAnimapMappings: empty,
    resolveIdMapperMappings: empty, resolveTMDBMappings: empty, resolveAnimeMapperMappings: empty,
    resolveAnimeMapperRelatedProviderIds: empty, resolveAniBridgeMappings: empty, resolveTsvMappings: empty,
    validateImdbMappings: empty, resolveSecondaryMappings: empty, resolveAlternativeMappings: empty,
    resolveCanonicalSeriesMappings: async () => new Map([[9001, { canonicalTitle: "Example", canonicalAnilistId: 8001,
      canonicalMalId: 8002, canonicalType: "TV", canonicalYear: 2020, canonicalExternal: { tmdb } }]]),
    resolveImdbMappings: async rows => {
      const roots = rows.filter(row => row.id === 9001 && row.title.english === "Example");
      if (roots.length) onRoot(roots);
      return new Map(roots.map(row => [row.id, [{ source: "imdb-search", anilistId: row.id, type: "TV",
        imdbIds: [canonicalImdb], title: "Example", year: 2020 }]]));
    },
  };
}

test("non-winning canonical IMDb searches are omitted without changing published metadata", async () => {
  let rootCalls = 0;
  const dependencies = options({ onRoot: () => { rootCalls++; } });
  try {
    configureCatalogPipeline({ optimized: false });
    const before = await canonicalizeCatalogPage([media()], dependencies);
    assert.equal(rootCalls, 1);
    configureCatalogPipeline({ optimized: true }); rootCalls = 0;
    const after = await canonicalizeCatalogPage([media()], dependencies);
    assert.equal(rootCalls, 0); assert.deepEqual(after, before);
    assert.equal(after[0].id, "tmdb:1234");
  } finally { configureCatalogPipeline(); }
});

test("canonical IMDb remains necessary for missing TMDB roots and current-identity conflicts", async () => {
  for (const scenario of [
    { tmdb: null, expected: "tt8001" },
    { currentImdb: "tt9001", expected: "tt9001" },
    { currentImdb: "tt8001", expected: "tmdb:1234" },
  ]) {
    let rootCalls = 0;
    const dependencies = options({ ...scenario, onRoot: () => { rootCalls++; } });
    try {
      configureCatalogPipeline({ optimized: false });
      const before = await canonicalizeCatalogPage([media()], dependencies);
      configureCatalogPipeline({ optimized: true }); rootCalls = 0;
      const after = await canonicalizeCatalogPage([media()], dependencies);
      assert.equal(rootCalls, 1); assert.deepEqual(after, before); assert.equal(after[0].id, scenario.expected);
    } finally { configureCatalogPipeline(); }
  }
});

test("an early fallback lookup overlaps canonical work but cannot replace a later provider match", { timeout: 2000 }, async () => {
  let started;
  const fallbackStarted = new Promise(resolve => { started = resolve; });
  const dependencies = options();
  const canonical = dependencies.resolveCanonicalSeriesMappings;
  dependencies.resolveCanonicalSeriesMappings = async rows => { await fallbackStarted; return canonical(rows); };
  dependencies.enableKitsuFallback = true;
  let calls = 0;
  dependencies.resolveKitsuMappings = async () => { calls++; started(); return new Map([[9001, "7001"]]); };
  try {
    configureCatalogPipeline({ optimized: true });
    const result = await canonicalizeCatalogPage([media()], dependencies);
    assert.equal(result[0].id, "tmdb:1234"); assert.equal(calls, 1);
    assert.equal(result[0].extra.identityFallback, undefined);
  } finally { configureCatalogPipeline(); }
});

test("an early successful fallback is reused only when the final fallback still matches", async () => {
  let calls = 0;
  const lookup = createFallbackPrefetch(async targets => { calls++; return new Map(targets.map(row => [row.id, "7001"])); });
  const targets = [{ id: 1, idMal: 2, currentFallbackId: "mal:2" }];
  lookup.start(targets);
  assert.equal((await lookup.resolve(targets)).get(1), "7001"); assert.equal(calls, 1);
  await lookup.resolve([{ id: 1, idMal: 3, currentFallbackId: "mal:3" }]);
  assert.equal(calls, 2, "changed source preference must run the late resolver");
});

test("seasonal and rolling catalogs keep the same late Kitsu fallback metadata", async () => {
  const date = new Date("2026-11-15T12:00:00Z");
  for (const rolling of [false, true]) {
    let calls = 0;
    const dependencies = options();
    dependencies.resolveCanonicalSeriesMappings = empty;
    dependencies.enableKitsuFallback = true;
    dependencies.resolveKitsuMappings = async () => { calls++; return new Map([[9001, "7001"]]); };
    dependencies.fetchPage = async () => [{ media: { ...media(), isAdult: false }, airingAt: date.getTime() / 1000 + 3600, episode: 1 }];
    dependencies.maxPages = 1;
    const run = () => rolling
      ? buildRollingCatalog("upcoming_3_days", date, 0, "", dependencies)
      : canonicalizeCatalogPage([media()], dependencies);
    try {
      configureCatalogPipeline({ optimized: false });
      const before = await run();
      configureCatalogPipeline({ optimized: true }); calls = 0;
      const after = await run();
      assert.deepEqual(after, before); assert.equal(after[0].id, "kitsu:7001"); assert.equal(calls, 1);
    } finally { configureCatalogPipeline(); }
  }
});

test("failed and empty early lookups remain eligible for the normal late retry", async () => {
  for (const fail of [false, true]) {
    let calls = 0;
    const lookup = createFallbackPrefetch(async () => {
      calls++;
      if (calls === 1) { if (fail) throw new Error("temporary failure"); return new Map(); }
      return new Map([[1, "7001"]]);
    });
    const targets = [{ id: 1, currentFallbackId: "anilist:1" }];
    lookup.start(targets);
    assert.equal((await lookup.resolve(targets)).get(1), "7001"); assert.equal(calls, 2);
  }
});

test("early IMDb searches overlap mapping fallbacks and still search newly resolved rows", { timeout: 2000 }, async () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    id: 9200 + index, format: "TV", title: { english: `Example ${index}` },
  }));
  const dependencies = options();
  let markStarted = () => {};
  let imdbStarted = Promise.resolve();
  const searched = [];
  const records = (ids, source) => new Map(ids.map(id => [id, [{
    source, anilistId: id, type: "TV", imdbIds: [`tt${id}`],
  }]]));
  dependencies.resolveMappings = async ids => records(ids.filter(id => id < 9209), "animeapi");
  dependencies.resolveCanonicalSeriesMappings = empty;
  dependencies.resolveAnimapMappings = async ids => {
    await imdbStarted;
    return records(ids, "animeapi");
  };
  dependencies.resolveImdbMappings = async requested => {
    searched.push(...requested.map(row => row.id));
    markStarted();
    return records(requested.map(row => row.id), "imdb-search");
  };
  try {
    configureCatalogPipeline({ optimized: false });
    const before = await canonicalizeCatalogPage(structuredClone(rows), dependencies);
    imdbStarted = new Promise(resolve => { markStarted = resolve; });
    searched.length = 0;
    configureCatalogPipeline({ optimized: true });
    const after = await canonicalizeCatalogPage(structuredClone(rows), dependencies);
    assert.deepEqual(after, before);
    assert.deepEqual(searched, rows.map(row => row.id));
    assert.deepEqual(after.map(meta => meta.id), rows.map(row => `tt${row.id}`));
  } finally { configureCatalogPipeline(); }
});

test("Kitsu can start before secondary lookup while the stronger match still wins", { timeout: 2000 }, async () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    id: 9400 + index, idMal: 9500 + index, format: "TV", title: { english: `Example ${index}` },
  }));
  const dependencies = options();
  const map = (ids) => new Map(ids.map(id => [id, [{ source: "animeapi", anilistId: id, type: "TV", imdbIds: [`tt${id}`] }]]));
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  dependencies.resolveMappings = async ids => map(ids.filter(id => id < 9409));
  dependencies.resolveCanonicalSeriesMappings = empty;
  dependencies.enableKitsuFallback = true;
  dependencies.resolveKitsuMappings = async targets => {
    assert.deepEqual(targets.map(row => row.id), [9409]);
    markStarted();
    return new Map([[9409, "7001"]]);
  };
  dependencies.resolveSecondaryMappings = async ids => { await started; return map(ids); };
  try {
    configureCatalogPipeline({ optimized: true });
    const result = await canonicalizeCatalogPage(rows, dependencies);
    assert.deepEqual(result.map(meta => meta.id), rows.map(row => `tt${row.id}`));
  } finally { configureCatalogPipeline(); }
});
