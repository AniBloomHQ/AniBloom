import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("PR CI runs actual local headless Chrome homepage verification without production probes", () => {
  const workflow=readFileSync(new URL("../.github/workflows/pr-ci.yml",import.meta.url),"utf8");
  const script=readFileSync(new URL("../scripts/browser-home-smoke.mjs",import.meta.url),"utf8");
  assert.match(workflow,/node scripts\/browser-home-smoke\.mjs/);
  assert.match(script,/createPreviewServer/);
  assert.match(script,/--headless/);
  assert.match(script,/--dump-dom/);
  assert.match(script,/--window-size=/);
  assert.match(script,/title-preference/);
  assert.match(script,/top_season/);
  assert.match(script,/catalog-icon/);
  assert.doesNotMatch(script,/anibloom\.vercel\.app\/catalog\//);
});
