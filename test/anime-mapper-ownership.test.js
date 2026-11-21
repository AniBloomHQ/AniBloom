import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeCatalogPage, configureCatalogPipeline } from "../api/catalog-source.js";
import { clearAnimeMapperCache } from "../lib/anime-mapper-mapping.js";

const empty = async () => new Map();
const offlineResolvers = {
  resolveFribbMappings: empty, resolveExternalMappings: () => new Map(), resolveAnimapMappings: empty,
  resolveIdMapperMappings: empty, resolveTMDBMappings: empty, resolveAnimeMapperMappings: empty,
  resolveAniBridgeMappings: empty, resolveTsvMappings: empty, resolveSecondaryMappings: empty,
  resolveAlternativeMappings: empty, resolveImdbMappings: empty, validateImdbMappings: empty,
};

function media(id, title) {
  return {
    id, idMal: id + 100, format: "TV", title: { english: title },
    relations: { edges: [
      { relationType: "SIDE_STORY", node: { id: id + 200, title: { english: "Different Related Title" } } },
    ] },
  };
}

test("Anime Mapper ownership keeps a collision check while skipping irrelevant records", async () => {
  const rows = [
    media(10, "IMDb Only Title"),
    media(20, "Single Source Title"),
    media(30, "Already Protected Title"),
    media(40, "Corroborated Title"),
  ];
  const mappings = new Map(rows.map(row => [row.id, [{
    source: "animeapi", anilistId: row.id, type: "TV", title: row.title.english,
    ...(row.id === 10 ? { imdbIds: ["tt10001"] } : { tvdbId: row.id + 400 }),
  }]]));
  mappings.get(40).push({ ...mappings.get(40)[0], source: "anibridge" });
  // ARM already ties this ID to the related title, so Mapper cannot add
  // another collision for it.
  mappings.set(230, [{ source: "arm", anilistId: 230, tvdbId: 430 }]);
  const dependencies = {
    ...offlineResolvers,
    resolveMappings: async ids => new Map(ids.filter(id => mappings.has(id)).map(id => [id, mappings.get(id)])),
    resolveCanonicalSeriesMappings: empty,
  };
  const requests = [];
  const originalFetch = globalThis.fetch;
  const run = async optimized => {
    clearAnimeMapperCache();
    configureCatalogPipeline({ optimized });
    requests.length = 0;
    const metas = await canonicalizeCatalogPage(structuredClone(rows), dependencies);
    return { metas, requests: [...requests].sort((a, b) => a - b) };
  };
  try {
    globalThis.fetch = async input => {
      const url = new URL(input);
      assert.equal(url.hostname, "cdn.jsdelivr.net");
      const mal = Number(url.pathname.match(/\/(\d+)\.json$/)?.[1]);
      requests.push(mal);
      if (mal < 200) return Response.json({
        mappings: { mal, anilist: mal - 100 },
        sequence: [{ relationType: "SIDE_STORY", malId: mal + 200 }],
      });
      return Response.json({ mappings: { mal, anilist: mal - 100, tvdb: mal + 100 } });
    };
    const before = await run(false);
    const after = await run(true);
    assert.deepEqual(before.requests, [110, 120, 130, 140, 310, 320, 330, 340]);
    assert.deepEqual(after.requests, [120, 320]);
    assert.deepEqual(after.metas, before.metas);
    assert.deepEqual(after.metas.map(meta => meta.id), ["tt10001", "mal:120", "mal:130", "tvdb:440"]);
  } finally {
    clearAnimeMapperCache();
    configureCatalogPipeline();
    globalThis.fetch = originalFetch;
  }
});

test("explicit canonical traversal overlaps IMDb while retaining the validated series root", { timeout: 2000 }, async () => {
  const installment = media(10, "Example Series");
  installment.relations.edges = [{ relationType: "PREQUEL", node: { id: 210, idMal: 310, format: "TV" } }];
  const rows = [installment, ...Array.from({ length: 9 }, (_, i) => ({
    id: 500 + i, format: "MOVIE", title: { english: `Example Movie ${i}` },
  }))];
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const dependencies = {
    ...offlineResolvers,
    resolveMappings: async ids => new Map(ids.filter(id => id !== 210).map(id => [id, [{
      source: "animeapi", anilistId: id, type: id === installment.id ? "TV" : "MOVIE", imdbIds: [`tt${100000 + id}`],
    }]])),
    resolveImdbMappings: async () => { await started; return new Map(); },
  };
  const originalFetch = globalThis.fetch;
  const requested = [];
  try {
    clearAnimeMapperCache();
    configureCatalogPipeline({ optimized: true });
    globalThis.fetch = async input => {
      const url = new URL(input);
      assert.equal(url.hostname, "cdn.jsdelivr.net");
      const mal = Number(url.pathname.match(/\/(\d+)\.json$/)?.[1]);
      requested.push(mal);
      if (mal === 110) markStarted();
      return Response.json({
        mappings: { mal, anilist: mal - 100, tmdb: 500 },
        title: { english: "Example Series" }, type: "TV",
        sequence: mal === 110 ? [{ malId: 310, relationType: "PREQUEL", format: "TV" }] : [],
      });
    };
    const metas = await canonicalizeCatalogPage(rows, dependencies);
    assert.deepEqual(requested, [110, 310]);
    assert.equal(metas[0].id, "tmdb:500");
    assert.equal(metas[0].extra.identityCanonicalSeriesAnilistId, 210);
  } finally {
    clearAnimeMapperCache();
    configureCatalogPipeline();
    globalThis.fetch = originalFetch;
  }
});
