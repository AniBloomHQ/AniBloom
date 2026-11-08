import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogDefinitions,
  buildCatalogMediaVariables,
} from "../lib/catalog-config.js";
import { catalogResponseCacheKey } from "../lib/catalog-runtime-cache.js";
import { normalizeCatalogRequestOptions } from "../lib/catalog-request-guard.js";
import { toMetaFromAniList, filterCatalogMetasBySearch, stripCatalogSearchHints } from "../lib/catalog-meta.js";
import { getProviderCandidates } from "../lib/provider-identity.js";
import { toCatalogIdentity } from "../api/catalog-source.js";
import { filterAiringRowsBySearch, getRollingCatalogRange, getCatalogRuntimeCachePolicy } from "../api/catalog-source.js";

const seasons = {
  ongoing: { season: "FALL", year: 2026 },
  previous: { season: "SUMMER", year: 2026 },
  upcoming: { season: "WINTER", year: 2027 },
};

test("seasonal catalogs support bounded optional genre extras without changing rolling contracts", () => {
  const catalogs = catalogDefinitions(seasons);
  const seasonals = catalogs.filter(c => c.id.includes("season"));
  assert.equal(seasonals.length, 6);
  for (const catalog of seasonals) {
    const genre = catalog.extra.find(e => e.name === "genre");
    assert.ok(genre, catalog.id);
    assert.equal(genre.isRequired, false);
    assert.ok(genre.options.includes("Action"));
    assert.ok(genre.options.includes("Sci-Fi"));
    assert.equal(new Set(genre.options).size, genre.options.length);
    assert.deepEqual(catalog.extra.filter(e => e.name !== "genre").map(e => e.name), ["search", "skip"]);
  }
  for (const catalog of catalogs.filter(c => !c.id.includes("season"))) {
    assert.deepEqual(catalog.extra.map(e => e.name), ["search", "skip"]);
  }
});

test("genre validation canonicalizes known values, rejects unsupported values and rolling filters", () => {
  assert.deepEqual(normalizeCatalogRequestOptions({ genre: "  action  " }, { allowGenre: true }), {
    ok: true, skip: 0, search: "", genre: "Action",
  });
  assert.deepEqual(normalizeCatalogRequestOptions({ genre: "not-a-genre" }, { allowGenre: true }), {
    ok: false, error: "Invalid catalog genre", code: "INVALID_GENRE",
  });
  assert.deepEqual(normalizeCatalogRequestOptions({ genre: "Action" }, { allowGenre: false }), {
    ok: false, error: "Genre filtering is not supported for this catalog", code: "UNSUPPORTED_GENRE",
  });
  assert.deepEqual(normalizeCatalogRequestOptions({ genre: ["Action", "Romance"] }, { allowGenre: true }), {
    ok: false, error: "Invalid catalog genre", code: "INVALID_GENRE",
  });
});

test("genre is applied to AniList query inputs and causes cache separation without rotating default keys", () => {
  const filter = { season: seasons.ongoing, sort: ["ID"], formats: ["TV"], genre: "Action" };
  const vars = buildCatalogMediaVariables(filter, 2, "");
  assert.deepEqual(vars.genres, ["Action"]);
  const base = { id: "current_season", seasonInfo: seasons, skip: 0, search: "" };
  assert.notEqual(catalogResponseCacheKey({ ...base, genre: "Action" }), catalogResponseCacheKey({ ...base, genre: "Comedy" }));
  assert.notEqual(catalogResponseCacheKey({ ...base, genre: "Action" }), catalogResponseCacheKey(base));
  assert.equal(catalogResponseCacheKey({ ...base, genre: "" }), catalogResponseCacheKey(base));
});

test("search handles punctuation, accents, non-Latin titles and AniList synonyms without replacing source titles", () => {
  const media = {
    id: 100, title: { english: "Pokémon Horizons", romaji: "Pocket Monsters", native: "ポケットモンスター" },
    synonyms: ["Pocket-Monsters: Liko's Journey", "PokeAni"],
  };
  const meta = toMetaFromAniList(100, media);
  assert.equal(meta.name, "Pokémon Horizons");
  for (const query of ["pokemon", "pocket monsters", "pocket monsters liko", "ポケット", "pokeani"]) {
    assert.equal(filterCatalogMetasBySearch([meta], query).length, 1, query);
    assert.equal(filterAiringRowsBySearch([{ media }], query).length, 1, query);
  }
  assert.equal(filterCatalogMetasBySearch([meta], "totally-unrelated").length, 0);
});

test("upcoming day and 7-day windows preserve strict boundaries and rolling freshness", () => {
  const now = new Date("2026-11-08T15:00:00.000Z"); // 23:00 Asia/Manila
  const today = getRollingCatalogRange("airing_today", now);
  assert.deepEqual(today, {
    start: now.getTime(),
    end: Date.parse("2026-11-08T16:00:00.000Z"),
  });
  const week = getRollingCatalogRange("upcoming_7_days", now);
  assert.deepEqual(week, { start: now.getTime(), end: now.getTime() + 7 * 24 * 60 * 60 * 1000 });
  for (const id of ["airing_today", "upcoming_7_days"]) {
    assert.equal(getCatalogRuntimeCachePolicy(id).freshTtlSeconds, 30);
  }
  const catalogs = catalogDefinitions(seasons);
  for (const id of ["airing_today", "upcoming_7_days"]) {
    const entry = catalogs.find(c => c.id === id);
    assert.equal(entry?.type, "series");
    assert.deepEqual(entry.extra.map(e => e.name), ["search", "skip"]);
  }
});

test("identity candidates never reuse a TMDB television ID for a movie (or vice versa)", () => {
  const mapping = [{
    source: "anime-mapper",
    anilistId: 900,
    title: "Shared Franchise",
    titles: ["Shared Franchise"],
    year: 2026,
    imdbIds: [],
    tmdbTvId: 1212,
    tmdbMovieIds: [3434],
    tvdbId: null,
  }];
  const media = { title: { english: "Shared Franchise" }, startDate: { year: 2026 } };
  const movie = getProviderCandidates({ ...media, format: "MOVIE" }, mapping)
    .filter(candidate => candidate.provider === "tmdb");
  const series = getProviderCandidates({ ...media, format: "TV" }, mapping)
    .filter(candidate => candidate.provider === "tmdb");
  assert.deepEqual(movie.map(candidate => candidate.id), ["3434"]);
  assert.deepEqual(series.map(candidate => candidate.id), ["1212"]);
});

test("identity fallback never fabricates a provider ID and keeps distinct AniList and MAL identities", () => {
  assert.equal(toCatalogIdentity({ extra: { anilistId: 900 } }).id, "anilist:900");
  assert.equal(toCatalogIdentity({ extra: { malId: 901, anilistId: 900 } }).id, "mal:901");
  assert.equal(toCatalogIdentity({ extra: { malId: -1, anilistId: -1 } }), null);
});

test("local server routes extended English/Romaji/Native manifests without changing standard installs", async () => {
  const { createPreviewServer } = await import("../scripts/dev-server.js");
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  try {
    for (const prefix of ["", "/romaji", "/native"]) {
      const standard = await (await fetch(origin + prefix + "/manifest.json")).json();
      const extendedResponse = await fetch(origin + prefix + "/extended/manifest.json");
      assert.equal(extendedResponse.status, 200);
      const extended = await extendedResponse.json();
      assert.equal(standard.catalogs.length, 8);
      assert.equal(extended.catalogs.length, 10);
      assert.deepEqual(extended.catalogs.slice(0, 8).map(x => x.id), standard.catalogs.map(x => x.id));
    }
    const bad = await fetch(origin + "/extended/catalog/series/upcoming_7_days.json?skip=1001");
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).code, "INVALID_SKIP");
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test("Vercel routes every extended variant's manifest and catalog extras", async () => {
  const { readFileSync } = await import("node:fs");
  const rewrites = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).rewrites;
  for (const prefix of ["/extended", "/romaji/extended", "/native/extended"]) {
    for (const suffix of ["/manifest.json", "/catalog/:type/:id.json", "/catalog/:type/:id/:extra*"]) {
      assert.equal(rewrites.filter(route => route.source === prefix + suffix).length, 1, prefix + suffix);
    }
  }
});

test("search retains meaningful Japanese voicing marks while folding Latin accents", () => {
  const voiced = toMetaFromAniList(3, { title: { native: "ブリーチ" } });
  const unvoiced = toMetaFromAniList(4, { title: { native: "フリーチ" } });
  assert.deepEqual(filterCatalogMetasBySearch([voiced, unvoiced], "ブリーチ"), [voiced]);
  assert.equal(filterCatalogMetasBySearch([toMetaFromAniList(5, { title: { english: "Pokémon" } })], "pokemon").length, 1);
});

test("temporary synonym search hints do not increase cached or public catalog metadata", () => {
  const meta = toMetaFromAniList(100, { title: { english: "Main" }, synonyms: ["Alternative", "Second"] });
  assert.deepEqual(filterCatalogMetasBySearch([meta], "alternative"), [meta]);
  const cleaned = stripCatalogSearchHints([meta]);
  assert.equal(Object.hasOwn(cleaned[0].extra, "titleSynonyms"), false);
  assert.deepEqual(meta.extra.titleSynonyms, ["Alternative", "Second"], "original identity mapping remains immutable");
  assert.equal(cleaned[0].name, meta.name);
  assert.equal(cleaned[0].id, meta.id);
});
