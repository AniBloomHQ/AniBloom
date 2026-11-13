import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import homepage from "../api/home-selector.js";
const readme=readFileSync(new URL("../README.md",import.meta.url),"utf8");

test("homepage and README explain why the ninth Top Season catalog may be hidden in clients",()=>{
  let html="";
  homepage({}, { status(){return this},setHeader(){},send(s){html=s} });
  assert.match(html,/Top Anime of the Season/);
  assert.match(html,/(?:ninth|9th).{0,140}(?:Home|row|catalog)/i);
  assert.match(html,/Settings.{0,80}Home/);
  assert.match(readme,/(?:ninth|9th).{0,140}(?:Home|row|catalog)/i);
  assert.match(readme,/Settings.{0,40}Home/);
  assert.equal((html.match(/class="catalog-card catalog-card-optional"/g)||[]).length,1);
  assert.doesNotMatch(html,/fetch\(/);
});
