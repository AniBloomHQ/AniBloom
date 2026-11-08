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

test("homepage shows both opt-in P1 airing catalog cards in a separate optional section", () => {
  const html = renderHomepage();
  const marker = '<section class="optional-catalogs" aria-labelledby="optional-catalogs-heading">';
  assert.ok(html.includes(marker), "extended catalogs must be discoverable on the homepage");

  const optional = html.split(marker)[1]?.split("</section>")[0];
  assert.ok(optional, "optional catalog section must be explicitly bounded");
  assert.match(optional, /<h3 id="optional-catalogs-heading">Optional extended catalogs<\/h3>/);
  assert.match(optional, /opt.in/i);
  assert.match(optional, /extra requests/i);
  assert.match(optional, /<div class="catalog-grid optional-catalog-grid">/);
  assert.equal((optional.match(/class="catalog-card catalog-card-optional"/g) || []).length, 2);
  assert.deepEqual(
    [...optional.matchAll(/<strong>([^<]+)<\/strong>/g)].map(([, title]) => title),
    ["Airing Today", "Upcoming — 7 days"],
  );
  assert.match(optional, /href="https:\/\/anibloom\.vercel\.app\/extended\/catalog\/series\/airing_today\.json"/);
  assert.match(optional, /href="https:\/\/anibloom\.vercel\.app\/extended\/catalog\/series\/upcoming_7_days\.json"/);
  assert.match(optional, /data-icon="calendar-today"/);
  assert.match(optional, /data-icon="calendar-week"/);
  assert.doesNotMatch(optional, /href="https:\/\/anibloom\.vercel\.app\/catalog\/series\/(airing_today|upcoming_7_days)\.json"/);
});

test("homepage preserves original eight cards and separate opt-in install controls", () => {
  const html = renderHomepage();
  const mainGrid = html.split('<div class="catalog-grid">')[1]?.split("</div>")[0];
  assert.ok(mainGrid);
  assert.equal((mainGrid.match(/class="catalog-card"/g) || []).length, 8);
  assert.equal((html.match(/class="catalog-card catalog-card-optional"/g) || []).length, 2);
  assert.match(html, /id="extended-catalogs"/);
  assert.match(html, /id="ranked-catalogs"/);
  assert.match(html, /extended\?\.checked/);
  assert.match(html, /ranked\?\.checked/);
});

test("homepage card previews do not expand standard manifest catalogs or enable extra fetches", () => {
  const seasons = {
    ongoing: { season: "FALL", year: 2026 },
    previous: { season: "SUMMER", year: 2026 },
    upcoming: { season: "WINTER", year: 2027 },
  };
  const standard = buildManifest(seasons);
  const extended = buildManifest(seasons, "english", { includeExtended: true });
  const ranked = buildManifest(seasons, "english", { includeTop: true });
  const both = buildManifest(seasons, "english", { includeExtended: true, includeTop: true });
  assert.deepEqual([standard, extended, ranked, both].map(m => m.catalogs.length), [8, 10, 9, 11]);
  assert.deepEqual(extended.catalogs.slice(-2).map(c => c.id), ["airing_today", "upcoming_7_days"]);
  assert.equal(standard.catalogs.some(c => ["airing_today", "upcoming_7_days"].includes(c.id)), false);
  const html = renderHomepage();
  assert.doesNotMatch(html, /fetch\(\s*["'`]\/extended\/catalog/);
});

test("optional catalog cards retain responsive grid layout and accessible icon/style behavior", () => {
  const css = readFileSync(new URL("../assets/anibloom.css", import.meta.url), "utf8");
  const html = renderHomepage();
  assert.match(css, /\.optional-catalogs\{/);
  assert.match(css, /\.optional-catalogs h3\{/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?\.catalog-grid\{grid-template-columns:1fr/);
  assert.match(html, /aria-labelledby="optional-catalogs-heading"/);
  assert.match(html, /aria-label="Open Airing Today catalog"/);
  assert.match(html, /aria-label="Open Upcoming — 7 days catalog"/);
});
