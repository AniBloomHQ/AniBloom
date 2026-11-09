import assert from "node:assert/strict";
import test from "node:test";
import homepage from "../api/home-selector.js";

function renderHomepage() {
  let html = "";
  homepage({}, {
    status(code) { assert.equal(code, 200); return this; },
    setHeader() {},
    send(body) { html = body; },
  });
  return html;
}

function catalogCards(html) {
  return [...html.matchAll(/<a class="catalog-card(?: catalog-card-optional)?"[^>]*>[\s\S]*?<\/a>/g)]
    .map(([card]) => card);
}

test("every homepage catalog card has a visible, nonempty decorative SVG icon", () => {
  const cards = catalogCards(renderHomepage());
  assert.equal(cards.length, 9, "eight standard catalogs plus Top Anime");

  for (const card of cards) {
    const label = card.match(/aria-label="([^"]+)"/)?.[1] || "unnamed catalog";
    const match = card.match(/<span class="catalog-icon" data-icon="([^"]+)" aria-hidden="true">(<svg[\s\S]*?<\/svg>)<\/span>/);
    assert.ok(match, label + " must contain an accessible decorative SVG");
    assert.match(match[2], /<svg viewBox="0 0 48 48" aria-hidden="true"/, label);
    assert.match(match[2], /<(?:path|rect|circle|polygon|polyline|ellipse)\b/, label + " needs drawn geometry");
    assert.doesNotMatch(match[2], /\b(?:undefined|null)\b/, label + " must not render missing paths");
  }
});

test("Top Anime of the Season uses a distinctive trophy icon instead of the calendar fallback", () => {
  const card = catalogCards(renderHomepage())
    .find(card => card.includes('aria-label="Open Top Anime of the Season catalog"'));
  assert.ok(card, "Top Anime card is present");
  assert.match(card, /class="catalog-icon" data-icon="trophy" aria-hidden="true"/);
  const icon = card.match(/<span class="catalog-icon"[^>]*>(<svg[\s\S]*?<\/svg>)<\/span>/)?.[1];
  assert.ok(icon);
  assert.ok((icon.match(/<(?:path|circle|rect)\b/g) || []).length >= 3, "trophy and star emblem has multiple shapes");
  assert.doesNotMatch(icon, /undefined/);
  assert.match(card, /href="https:\/\/anibloom\.vercel\.app\/catalog\/series\/top_season\.json"/);
});
