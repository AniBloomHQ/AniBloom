import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import home from "../api/home-selector.js";
import { buildManifest } from "../api/resolver-manifest.js";

function renderHomepage() {
  let html = "";
  home({}, {
    status(code) { assert.equal(code, 200); return this; },
    setHeader() {},
    send(body) { html = body; },
  });
  return html;
}

test("homepage contains only the remaining ranked additional catalog card", () => {
  const html = renderHomepage();
  const marker = '<section class="optional-catalogs" aria-labelledby="optional-catalogs-heading">';
  assert.ok(html.includes(marker), "ranked catalog must remain discoverable");
  const additional = html.split(marker)[1]?.split("</section>")[0];
  assert.ok(additional);
  assert.match(additional, /<h3 id="optional-catalogs-heading">More included catalogs<\/h3>/);
  assert.match(additional, /All 9 catalogs/);
  assert.match(additional, /extra requests/);
  assert.equal((additional.match(/class="catalog-card catalog-card-optional"/g) || []).length, 1);
  assert.deepEqual([...additional.matchAll(/<strong>([^<]+)<\/strong>/g)].map(([,label]) => label),
    ["Top Anime of the Season"]);
  assert.match(additional, /href="https:\/\/anibloom\.vercel\.app\/catalog\/series\/top_season\.json"/);
  assert.doesNotMatch(html, /Airing Today|Upcoming — 7 days|airing_today|upcoming_7_days/);
});

test("homepage preserves all eight existing catalog cards and no artwork provider selector", () => {
  const html = renderHomepage();
  const mainGrid = html.split('<div class="catalog-grid">')[1]?.split("</div>")[0];
  assert.ok(mainGrid);
  assert.equal((mainGrid.match(/class="catalog-card"/g) || []).length, 8);
  assert.equal((html.match(/class="catalog-card catalog-card-optional"/g) || []).length, 1);
  assert.doesNotMatch(html, /id="artwork-provider"/);
  assert.doesNotMatch(html, /id="extended-catalogs"/);
  assert.doesNotMatch(html, /id="ranked-catalogs"/);
});

test("homepage advertises the same nine catalogs as every previous manifest variant", () => {
  const seasons = {
    ongoing: { season: "FALL", year: 2026 },
    previous: { season: "SUMMER", year: 2026 },
    upcoming: { season: "WINTER", year: 2027 },
  };
  const standard = buildManifest(seasons);
  const extended = buildManifest(seasons, "english", { includeExtended: true });
  const ranked = buildManifest(seasons, "english", { includeTop: true });
  const combined = buildManifest(seasons, "english", { includeExtended: true, includeTop: true });
  assert.deepEqual([standard, extended, ranked, combined].map(m => m.catalogs.length), [9,9,9,9]);
  assert.deepEqual(extended.catalogs, standard.catalogs);
  assert.equal(standard.catalogs.at(-1).id, "top_season");
  const html = renderHomepage();
  assert.doesNotMatch(html, /fetch\(\s*["'`]\/extended\/catalog/);
});

test("remaining ranked card keeps accessible label and responsive grid styles", () => {
  const css = readFileSync(new URL("../assets/anibloom.css", import.meta.url), "utf8");
  const html = renderHomepage();
  assert.match(css, /\.optional-catalogs\{/);
  assert.match(css, /\.optional-catalogs h3\{/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?\.catalog-grid\{grid-template-columns:1fr/);
  assert.match(html, /aria-labelledby="optional-catalogs-heading"/);
  assert.match(html, /aria-label="Open Top Anime of the Season catalog"/);
});
