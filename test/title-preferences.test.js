import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTitlePreference, projectCatalogMetas } from "../lib/title-preference.js";
import { buildManifest } from "../api/resolver-manifest.js";
import catalogSource, { getSeasonInfo } from "../api/catalog-source.js";
import { catalogResponseCacheKey, setCatalogRuntimeCacheForTests } from "../lib/catalog-runtime-cache.js";
import { readFileSync } from "node:fs";

const seasons = {
  ongoing: { season: "FALL", year: 2026 },
  previous: { season: "SUMMER", year: 2026 },
  upcoming: { season: "WINTER", year: 2027 },
};
const rows = [
  { id: "tt1234567", type: "series", name: "Attack on Titan", extra: {
    anilistId: 1, titleEnglish: "Attack on Titan", titleRomaji: "Shingeki no Kyojin", titleNative: "進撃の巨人" } },
  { id: "mal:765", type: "series", name: "Romaji fallback", extra: { titleRomaji: "Romaji fallback" } },
  { id: "anilist:99", type: "series", name: "Untranslated", extra: {} },
];
test("normalizes title preferences, including invalid input", () => {
  for (const value of ["native", "romaji", "english", "garbage", null, ""]) {
    assert.equal(normalizeTitlePreference(value), value === "native" || value === "romaji" ? value : "english");
  }
});
test("projects only display titles, preserving identities and shared cached data", () => {
  const snapshot = structuredClone(rows);
  assert.equal(projectCatalogMetas(rows, "english"), rows);
  assert.deepEqual(projectCatalogMetas(rows, "native").map((m) => m.name), ["進撃の巨人", "Romaji fallback", "Untranslated"]);
  assert.deepEqual(projectCatalogMetas(rows, "romaji").map((m) => m.name), ["Shingeki no Kyojin", "Romaji fallback", "Untranslated"]);
  assert.deepEqual(rows, snapshot);
  for (const mode of ["romaji", "native"]) {
    const projected = projectCatalogMetas(rows, mode);
    assert.deepEqual(projected.map((m) => m.id), rows.map((m) => m.id));
    assert.deepEqual(projected.map((m) => m.extra), rows.map((m) => m.extra));
  }
});
test("personalized manifest preserves catalog details and applies the saved order", () => {
  const english = buildManifest(seasons);
  const profile = buildManifest(seasons, { catalogIds: ["current_season_movies", "top_season"] });
  assert.equal(profile.id, english.id);
  assert.equal(profile.identityMode, english.identityMode);
  assert.deepEqual(profile.resources, english.resources);
  assert.deepEqual(profile.catalogs, [english.catalogs[4], english.catalogs[8]]);
  assert.deepEqual(english.behaviorHints, { configurable: true, configurationRequired: false });
});
test("Vercel rewrites route each fixed variant with no user token", () => {
  const routes = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).rewrites;
  for (const mode of ["native", "romaji"]) {
    for (const source of ["/manifest.json", "/catalog/:type/:id.json", "/catalog/:type/:id/:extra*"]) {
      const route = routes.find((r) => r.source === "/" + mode + source);
      assert.ok(route, "missing " + mode + source);
      assert.ok(route.destination.includes("titleMode=" + mode));
    }
  }
});
test("public catalog URLs and query parameters always project English from the shared cache", async () => {
  const id = "current_season";
  const seasonInfo = getSeasonInfo(new Date());
  const key = catalogResponseCacheKey({id, seasonInfo, skip: 0, search: ""});
  const cached = {metas: rows, cachedAt: Date.now(), freshUntil: Date.now() + 60000};
  setCatalogRuntimeCacheForTests({ async get(k) { return k === key ? cached : null; }, async set() {} });
  try {
    for (const path of [
      "/catalog/series/current_season.json?titleMode=native",
      "/romaji/catalog/series/current_season.json",
      "/native/catalog/series/current_season.json",
    ]) {
      const response = await catalogSource.fetch(new Request("https://anibloom.example" + path));
      assert.equal(response.status, 200, path);
      const payload = await response.json();
      assert.equal(payload.metas[0].name, "Attack on Titan");
      assert.deepEqual(payload.metas.map((m) => m.id), rows.map((m) => m.id));
    }
    assert.equal(cached.metas[0].name, "Attack on Titan");
  } finally { setCatalogRuntimeCacheForTests(null); }
});

test("the local preview server serves English manifests for existing aliases over HTTP", async () => {
  const { createPreviewServer } = await import("../scripts/dev-server.js");
  const server = createPreviewServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const manifests = [];
    for (const path of ["/manifest.json", "/romaji/manifest.json", "/native/manifest.json"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      manifests.push(await response.json());
    }
    assert.deepEqual(manifests[0].catalogs.map((x) => x.name), manifests[1].catalogs.map((x) => x.name));
    assert.deepEqual(manifests[0], manifests[2]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("catalog search and skip survive the variant URL prefix", async () => {
  const now = getSeasonInfo(new Date());
  const cached = {metas: rows.slice(0, 1), cachedAt: Date.now(), freshUntil: Date.now() + 60000};
  const key = catalogResponseCacheKey({id: "current_season", seasonInfo: now, skip: 50, search: "進撃の巨人"});
  setCatalogRuntimeCacheForTests({async get(k) {return k === key ? cached : null;}, async set() {}});
  try {
    for (const mode of ["romaji", "native"]) {
      const url = "https://anibloom.example/" + mode + "/catalog/series/current_season/search=%E9%80%B2%E6%92%83%E3%81%AE%E5%B7%A8%E4%BA%BA&skip=50.json";
      const response = await catalogSource.fetch(new Request(url));
      assert.equal(response.status, 200, mode);
      const body = await response.json();
      assert.equal(body.metas.length, 1);
      assert.equal(body.metas[0].name, "Attack on Titan");
      assert.equal(body.metas[0].id, rows[0].id);
    }
  } finally {setCatalogRuntimeCacheForTests(null);}
});

test("homepage links to profile setup and keeps the default installation link", async () => {
  const {default: home} = await import("../api/home-selector.js");
  let html = "";
  home({}, {status() {return this;}, setHeader() {}, send(s) {html=s;}});
  assert.match(html, /href="\/configure"/);
  assert.doesNotMatch(html, /id="title-preference"/);
  assert.match(html, /nuvio:\/\/anibloom\.vercel\.app\/manifest\.json/);
  assert.doesNotMatch(html, /localStorage|document\.cookie/);
});
