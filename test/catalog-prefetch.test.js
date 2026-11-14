import test from "node:test";
import assert from "node:assert/strict";
import { prefetchMappingLookup } from "../lib/catalog-prefetch.js";
import { canonicalizeCatalogPage, configureCatalogPipeline } from "../api/catalog-source.js";

test("bulk prefetch overlaps reads and exposes only the unresolved subset", async () => {
  const started = [];
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const source = name => async () => {
    started.push(name);
    if (started.length === 3) release();
    await barrier;
    return new Map([[1, [{ source: name, id: "first" }]], [2, [{ source: name, id: "second" }]]]);
  };
  const lookups = ["fribb", "anibridge", "tsv"].map(name => prefetchMappingLookup(source(name), [1, 2]));
  const result = await Promise.all(lookups.map(lookup => lookup([{ id: 2 }])));
  assert.equal(started.length, 3);
  for (const records of result) assert.deepEqual([...records.keys()], [2]);
});

test("prefetch preserves failures for the consuming stage", async () => {
  const lookup = prefetchMappingLookup(async () => { throw new Error("temporary outage"); }, [1]);
  await assert.rejects(lookup([1]), /temporary outage/);
});

test("prefetch resolves parent IDs outside the original catalog page", async () => {
  const calls = [];
  const lookup = prefetchMappingLookup(async ids => {
    calls.push(ids);
    return new Map(ids.map(id => [id, [{ source: "fribb", anilistId: id }]]));
  }, [1, 2]);
  const records = await lookup([2, 3]);
  assert.deepEqual([...records.keys()], [2, 3]);
  assert.deepEqual(calls, [[1, 2], [3]]);
});

test("a failed catalog prefetch does not block a fresh parent lookup", async () => {
  const lookup = prefetchMappingLookup(async ids => {
    if (ids.includes(1)) throw new Error("temporary catalog failure");
    return new Map([[3, [{ source: "fribb", anilistId: 3 }]]]);
  }, [1]);
  assert.deepEqual([...await lookup([3])].map(([id]) => id), [3]);
});

test("related-provider reads overlap IMDb verification without changing identity selection", { timeout: 2000 }, async () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: 900001 + i, format: "TV", title: { english: `Example ${i}` },
    relations: { edges: [{ relationType: "PREQUEL", node: { id: 800001 + i, format: "TV", title: { english: `Earlier ${i}` } } }] } }));
  const empty = async () => new Map();
  let markStarted;
  const relatedStarted = new Promise(resolve => { markStarted = resolve; });
  let currentReads = 0;
  let relatedReads = 0;
  const options = {
    resolveMappings: async ids => {
      if (ids[0] < 900000) { relatedReads++; return new Map(); }
      currentReads++;
      return new Map(ids.map(id => [id, [{ source: "animeapi", anilistId: id, type: "TV", imdbIds: [`tt${id}`] }]]));
    },
    resolveFribbMappings: empty, resolveExternalMappings: () => new Map(), resolveAniBridgeMappings: empty,
    resolveTsvMappings: empty, resolveAnimapMappings: empty, resolveIdMapperMappings: empty, resolveTMDBMappings: empty,
    resolveAnimeMapperMappings: empty, resolveAnimeMapperRelatedProviderIds: async () => { markStarted(); return new Map(); },
    resolveCanonicalSeriesMappings: empty,
    resolveImdbMappings: async () => { await relatedStarted; return new Map(); }, validateImdbMappings: empty,
    resolveSecondaryMappings: empty, resolveAlternativeMappings: empty,
  };
  try {
    configureCatalogPipeline({ optimized: true });
    const metas = await canonicalizeCatalogPage(structuredClone(rows), options);
    assert.deepEqual(metas.map(meta => meta.id), rows.map(row => `tt${row.id}`));
    assert.equal(currentReads, 1);
    assert.equal(relatedReads, 1);
  } finally { configureCatalogPipeline(); }
});

test("overlapping bulk reads preserves source precedence and excludes already resolved titles", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: 900001 + i, format: "TV", title: { english: `Example ${i}` }, relations: { edges: [] } }));
  const empty = async () => new Map();
  const records = (source, prefix, selected) => new Map(selected.map(row => [row.id, [{
    source, anilistId: row.id, type: "TV", imdbIds: [`tt${prefix}${row.id}`],
  }]]));
  const options = {
    resolveMappings: empty, resolveFribbMappings: async () => records("animeapi", "1", rows.slice(0, 5)),
    resolveExternalMappings: () => new Map(), resolveAniBridgeMappings: async requested => records("anibridge", "2", requested),
    resolveTsvMappings: async () => records("animeapi-tsv", "3", rows),
    resolveAnimapMappings: empty, resolveIdMapperMappings: empty, resolveTMDBMappings: empty,
    resolveAnimeMapperMappings: empty, resolveAnimeMapperRelatedProviderIds: empty,
    resolveCanonicalSeriesMappings: empty, resolveImdbMappings: empty, validateImdbMappings: empty,
    resolveSecondaryMappings: empty, resolveAlternativeMappings: empty,
  };
  try {
    configureCatalogPipeline({ optimized: false });
    const before = await canonicalizeCatalogPage(structuredClone(rows), options);
    configureCatalogPipeline({ optimized: true });
    const after = await canonicalizeCatalogPage(structuredClone(rows), options);
    assert.deepEqual(after, before);
    assert.deepEqual(after.map(meta => meta.id), rows.map((row, i) => `tt${i < 5 ? "1" : "2"}${row.id}`));
  } finally { configureCatalogPipeline(); }
});
