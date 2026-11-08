import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogDefinitions, buildCatalogMediaVariables } from "../lib/catalog-config.js";
import { buildManifest } from "../api/resolver-manifest.js";
import {
  getCatalogFilter, fetchValidatedSeasonCatalogPage,
} from "../api/catalog-source.js";
import { normalizeCatalogRequestOptions } from "../lib/catalog-request-guard.js";
import { catalogResponseCacheKey } from "../lib/catalog-runtime-cache.js";
import { normalizePosterPreference, projectCatalogPosters } from "../lib/catalog-poster-providers.js";

const seasons = {
  ongoing: { season: "FALL", year: 2026 },
  previous: { season: "SUMMER", year: 2026 },
  upcoming: { season: "WINTER", year: 2027 },
};

test("Top Season is opt-in, never silently enlarges existing default or extended manifests", () => {
  const defaultList = catalogDefinitions(seasons);
  const extended = catalogDefinitions(seasons, "english", { includeExtended: true });
  assert.equal(defaultList.length, 8);
  assert.equal(extended.length, 10);
  assert.equal(defaultList.some(c => c.id === "top_season"), false);
  assert.equal(extended.some(c => c.id === "top_season"), false);

  for (const mode of ["english", "romaji", "native"]) {
    const ranked = buildManifest(seasons, mode, { includeTop: true });
    const both = buildManifest(seasons, mode, { includeTop: true, includeExtended: true });
    assert.deepEqual(ranked.catalogs.slice(0, 8).map(c => c.id), defaultList.map(c => c.id));
    assert.equal(ranked.catalogs.length, 9);
    assert.equal(both.catalogs.length, 11);
    assert.equal(ranked.catalogs.at(-1).id, "top_season");
    assert.equal(ranked.catalogs.at(-1).type, "series");
    assert.match(ranked.catalogs.at(-1).name, mode === "native" ? /人気/ : /Top Anime/);
  }
});

test("Top Season ranks at upstream AniList query level before pagination, using one bounded page", async () => {
  const filter = getCatalogFilter("top_season", seasons);
  assert.deepEqual(filter.season, seasons.ongoing);
  assert.deepEqual(filter.formats, ["TV", "TV_SHORT", "ONA", "OVA", "SPECIAL"]);
  assert.deepEqual(filter.sort, ["POPULARITY_DESC", "SCORE_DESC", "ID"]);
  const vars = buildCatalogMediaVariables(filter, 2, "");
  assert.deepEqual(vars.sort, filter.sort);
  assert.equal(vars.page, 2);

  const calls = [];
  const metas = await fetchValidatedSeasonCatalogPage({
    filter, skip: 50,
    fetchPage: async (requestedFilter, page) => {
      calls.push({ requestedFilter, page });
      return [{ id: 99 }, { id: 23 }, { id: 7 }];
    },
    canonicalizePage: async rows => rows.map(x => ({ id: "anilist:" + x.id })),
  });
  assert.deepEqual(calls, [{ requestedFilter: filter, page: 2 }]);
  assert.deepEqual(metas.map(x => x.id), ["anilist:99", "anilist:23", "anilist:7"]);
  assert.equal(metas.length, 3);
});

test("optional artwork preference is in the manifest while unfiltered values stay unchanged", () => {
  const list = catalogDefinitions(seasons);
  for (const catalog of list) {
    const field = catalog.extra.find(e => e.name === "artwork");
    assert.ok(field, catalog.id);
    assert.equal(field.isRequired, false);
    assert.deepEqual(field.options, ["AniList", "BetterPosters", "PostersPlus"]);
  }
  assert.deepEqual(normalizeCatalogRequestOptions({}), { ok: true, skip: 0, search: "" });
  assert.deepEqual(normalizeCatalogRequestOptions({ artwork: "  BetterPosters  " }), {
    ok: true, skip: 0, search: "", artwork: "betterposters",
  });
  assert.deepEqual(normalizeCatalogRequestOptions({ artwork: "PostersPlus" }), {
    ok: true, skip: 0, search: "", artwork: "postersplus",
  });
  for (const artwork of ["../../metadata", "https://evil.example/", ["AniList"], "posterplus"]) {
    assert.deepEqual(normalizeCatalogRequestOptions({ artwork }), {
      ok: false, error: "Invalid artwork preference", code: "INVALID_ARTWORK",
    });
  }
});

test("public poster URLs are deterministic and require authoritative provider IDs", () => {
  const original = [
    { id: "tt1234567", type: "series", poster: "https://s4.anilist.co/cover.jpg", extra: { anilistId: 11 } },
    { id: "mal:22", type: "series", poster: "https://s4.anilist.co/cover2.jpg", extra: { anilistId: 22 } },
    { id: "tmdb:33", type: "movie", poster: "https://s4.anilist.co/cover3.jpg", extra: { anilistId: 33 } },
    { id: "tt1234567-unsafe", type: "series", poster: "https://s4.anilist.co/cover4.jpg", extra: {} },
  ];
  const copy = structuredClone(original);
  assert.equal(normalizePosterPreference("unknown"), "anilist");
  assert.equal(projectCatalogPosters(original, "anilist"), original);
  const better = projectCatalogPosters(original, "betterposters");
  assert.equal(better[0].poster, "https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg");
  assert.deepEqual(better.slice(1), original.slice(1));
  const plus = projectCatalogPosters(original, "postersplus", { postersPlusBaseUrl: "https://posters.example.com" });
  assert.equal(plus[0].poster, "https://posters.example.com/poster?anilist_id=11&type=series");
  assert.equal(plus[1].poster, "https://posters.example.com/poster?anilist_id=22&type=series");
  assert.equal(plus[2].poster, "https://posters.example.com/poster?anilist_id=33&type=movie");
  assert.equal(plus[3].poster, original[3].poster);
  assert.deepEqual(original, copy, "cached source metas must never be mutated");
});

test("invalid and credential-bearing PostersPlus endpoints safely fall back to AniList", () => {
  const metas = [{ id: "mal:1", type: "series", poster: "https://anilist.example/1.jpg", extra: { anilistId: 1 } }];
  for (const base of [
    "", "http://posters.example.com", "https://user:pass@posters.example.com",
    "https://posters.example.com/?access_key=fake", "https://posters.example.com/path",
    "https://localhost", "https://127.0.0.1", "https://posters.example.com#frag",
  ]) {
    assert.deepEqual(projectCatalogPosters(metas, "postersplus", { postersPlusBaseUrl: base }), metas, base);
  }
});

test("artwork selection projects after shared response cache and never changes its hashed key", () => {
  const dims = { id: "current_season", seasonInfo: seasons, skip: 0, search: "" };
  const key = catalogResponseCacheKey(dims);
  assert.equal(catalogResponseCacheKey({ ...dims, artwork: "betterposters" }), key);
  assert.equal(catalogResponseCacheKey({ ...dims, artwork: "postersplus" }), key);
  assert.notEqual(catalogResponseCacheKey({ ...dims, id: "top_season" }), key);
  assert.equal(catalogResponseCacheKey({ ...dims, id: "top_season" }), catalogResponseCacheKey({ ...dims, id: "top_season" }));
});

test("ranked manifests and catalog extras have explicit local and Vercel routing", async () => {
  const routes = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).rewrites;
  const { createPreviewServer } = await import("../scripts/dev-server.js");
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  try {
    for (const lang of ["", "/romaji", "/native"]) {
      for (const suffix of ["/ranked", "/extended/ranked"]) {
        const prefix = lang + suffix;
        const url = origin + prefix + "/manifest.json";
        const response = await fetch(url);
        assert.equal(response.status, 200, url);
        assert.equal((await response.json()).catalogs.length, suffix === "/ranked" ? 9 : 11);
        for (const shape of ["/manifest.json", "/catalog/:type/:id.json", "/catalog/:type/:id/:extra*"]) {
          assert.equal(routes.filter(r => r.source === prefix + shape).length, 1, prefix + shape);
        }
      }
    }
    const failed = await fetch(origin + "/ranked/catalog/series/top_season.json?artwork=../../bad");
    assert.equal(failed.status, 400);
    assert.equal((await failed.json()).code, "INVALID_ARTWORK");
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test("cached catalogs reuse one normalized response across poster selections and title variants", async () => {
  const { default: handler, getSeasonInfo } = await import("../api/catalog-source.js");
  const { setCatalogRuntimeCacheForTests } = await import("../lib/catalog-runtime-cache.js");
  const { setCatalogRequestRateLimiterForTests } = await import("../lib/catalog-request-rate-limiter.js");
  const info = getSeasonInfo(new Date());
  const cacheKey = catalogResponseCacheKey({ id: "current_season", seasonInfo: info, skip: 0, search: "" });
  const cached = [{
    id: "tt1234567", type: "series", name: "Default", poster: "https://s4.anilist.co/cover.jpg",
    extra: { anilistId: 11, titleEnglish: "Default", titleRomaji: "Romaji", titleNative: "日本語" },
  }];
  const readKeys = [];
  setCatalogRuntimeCacheForTests({
    async get(k) { readKeys.push(k); return k === cacheKey ? { metas: cached, freshUntil: Date.now() + 60000 } : null; },
    async set() { throw Error("unexpected upstream/cache writes"); },
  });
  setCatalogRequestRateLimiterForTests({ async limit() { return { success: true }; } });
  try {
    for (const [path, expectedPoster, expectedTitle] of [
      ["/catalog/series/current_season.json", cached[0].poster, "Default"],
      ["/catalog/series/current_season.json?artwork=BetterPosters", "https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg", "Default"],
      ["/romaji/catalog/series/current_season.json?artwork=BetterPosters", "https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg", "Romaji"],
    ]) {
      const response = await handler.fetch(new Request("https://example.test" + path));
      assert.equal(response.status, 200, path);
      const body = await response.json();
      assert.equal(body.metas.length, 1);
      assert.equal(body.metas[0].poster, expectedPoster, path);
      assert.equal(body.metas[0].name, expectedTitle, path);
    }
    assert.deepEqual(readKeys, [cacheKey, cacheKey, cacheKey]);
    assert.equal(cached[0].poster, "https://s4.anilist.co/cover.jpg");
  } finally {
    setCatalogRequestRateLimiterForTests(null);
    setCatalogRuntimeCacheForTests(null);
  }
});

test("Top Season does not become reachable on the ordinary unranked path", async () => {
  const { default: handler } = await import("../api/catalog-source.js");
  const response = await handler.fetch(new Request("https://example.test/catalog/series/top_season.json"));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { metas: [] });
});
