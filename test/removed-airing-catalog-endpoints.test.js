import assert from "node:assert/strict";
import test from "node:test";
import home from "../api/home-selector.js";
import catalogSource, { getRollingCatalogRange } from "../api/catalog-source.js";
import { buildManifest } from "../api/resolver-manifest.js";

const REMOVED = ["airing_today", "upcoming_7_days"];
const EXPECTED = [
  "upcoming_season", "current_season", "previous_season",
  "upcoming_season_movies", "current_season_movies", "previous_season_movies",
  "upcoming_3_days", "previous_3_days", "top_season",
];
const SEASONS = {
  ongoing: { season: "FALL", year: 2026 },
  previous: { season: "SUMMER", year: 2026 },
  upcoming: { season: "WINTER", year: 2027 },
};

test("only nine catalogs are advertised across canonical and historical manifest variants", () => {
  for (const lang of ["english", "romaji", "native"]) {
    for (const legacy of [{}, { includeExtended: true }, { includeTop: true },
      { includeExtended: true, includeTop: true }]) {
      const manifest = buildManifest(SEASONS, lang, legacy);
      assert.deepEqual(manifest.catalogs.map(c => c.id), EXPECTED);
      assert.equal(new Set(manifest.catalogs.map(c => c.id)).size, 9);
      for (const id of REMOVED) assert.ok(!manifest.catalogs.some(c => c.id === id));
    }
  }
});

test("both retired catalog IDs return 404 through canonical, old and language-prefixed routes", async () => {
  const { createPreviewServer } = await import("../scripts/dev-server.js");
  const server = createPreviewServer();
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    for (const language of ["", "/romaji", "/native"]) {
      const manifest = await fetch(base + language + "/manifest.json");
      assert.equal(manifest.status, 200);
      assert.deepEqual((await manifest.json()).catalogs.map(x => x.id), EXPECTED);
      for (const oldPrefix of ["", "/extended", "/ranked", "/extended/ranked",
        "/betterposters", "/postersplus"]) {
        for (const id of REMOVED) {
          const path = language + oldPrefix + "/catalog/series/" + id + ".json";
          for (const suffix of ["", "?skip=1001", "?artwork=invalid"]) {
            const response = await fetch(base + path + suffix);
            assert.equal(response.status, 404, path + suffix);
            assert.deepEqual(await response.json(), { metas: [] });
          }
        }
      }
    }
    const active = await fetch(base + "/catalog/series/upcoming_3_days.json?skip=1001");
    assert.equal(active.status, 400, "existing Upcoming 3 Days endpoint must still be recognized");
    const top = await fetch(base + "/catalog/series/top_season.json?skip=1001");
    assert.equal(top.status, 400, "Top Season endpoint must remain recognized");
  } finally {
    await new Promise((resolve,reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test("direct catalog handler rejects retired IDs before extras validation or upstream work", async () => {
  for (const id of REMOVED) {
    for (const path of [
      "/catalog/series/" + id + ".json",
      "/native/catalog/series/" + id + ".json?skip=1001",
      "/ranked/catalog/series/" + id + ".json?genre=invalid",
      "/betterposters/catalog/series/" + id + ".json",
    ]) {
      const response = await catalogSource.fetch(new Request("https://example.test" + path));
      assert.equal(response.status, 404, path);
      assert.deepEqual(await response.json(), { metas: [] });
    }
    assert.equal(getRollingCatalogRange(id, new Date("2026-11-08T14:00:00Z")), null, id);
  }
});

test("homepage lists nine catalog cards and no retired schedule links or labels", () => {
  let html;
  home({}, { status(status) { assert.equal(status, 200); return this; },
    setHeader() {}, send(value) { html = value; } });
  assert.match(html, /Nine supported catalogs/);
  assert.match(html, /All 9 catalogs are included/);
  assert.equal((html.match(/class="catalog-card"/g) || []).length, 8);
  assert.equal((html.match(/class="catalog-card catalog-card-optional"/g) || []).length, 1);
  assert.match(html, /Top Anime of the Season/);
  assert.doesNotMatch(html, /Airing Today|Upcoming — 7 days|airing_today|upcoming_7_days/);
});
