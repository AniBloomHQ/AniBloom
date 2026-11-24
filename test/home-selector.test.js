import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/home-selector.js";

test("home page serves AniBloom generic product information", () => {
  let html = "";
  const res = { status() { return this; }, setHeader() {}, send(value) { html = value; return value; } };
  handler({}, res);
  assert.match(html, /AniBloom — Anime Discovery for Nuvio/);
  assert.match(html, /Discover anime\.<br>Every season\./);
  assert.doesNotMatch(html, /ARM mapping|identity mapping|TMDB|TVDB|IMDb/i);
});

test("homepage installation buttons point to the setup section", () => {
  let html = "";
  const res = { status() { return this; }, setHeader() {}, send(value) { html = value; return value; } };
  handler({}, res);
  assert.match(html, /class="install-button header-install" href="#install"/);
  assert.match(html, /class="hero-actions"><a class="install-button" href="#install"/);
  assert.match(html, /id="install" aria-labelledby="install-heading"/);
});
