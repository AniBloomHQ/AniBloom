import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogDefinitions,
  buildCatalogMediaVariables,
} from "../lib/catalog-config.js";
import { catalogResponseCacheKey } from "../lib/catalog-runtime-cache.js";
import { normalizeCatalogRequestOptions } from "../lib/catalog-request-guard.js";
import { toMetaFromAniList, filterCatalogMetasBySearch } from "../lib/catalog-meta.js";
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
