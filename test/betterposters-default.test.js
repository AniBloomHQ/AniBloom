import test from "node:test";
import assert from "node:assert/strict";
import home from "../api/home-selector.js";
import catalogSource, { getSeasonInfo } from "../api/catalog-source.js";
import { catalogDefinitions } from "../lib/catalog-config.js";
import { normalizeCatalogRequestOptions } from "../lib/catalog-request-guard.js";
import { normalizePosterPreference, projectCatalogPosters } from "../lib/catalog-poster-providers.js";
import { catalogResponseCacheKey, setCatalogRuntimeCacheForTests } from "../lib/catalog-runtime-cache.js";
import { setCatalogRequestRateLimiterForTests } from "../lib/catalog-request-rate-limiter.js";

const SEASONS = {
  ongoing: { season: "FALL", year: 2026 },
  previous: { season: "SUMMER", year: 2026 },
  upcoming: { season: "WINTER", year: 2027 },
};

function renderHome() {
  let html = "";
  home({}, { status(status) { assert.equal(status, 200); return this; }, setHeader() {}, send(body) { html = body; } });
  return html;
}

test("BetterPosters is the default projection with safe original-cover fallback", () => {
  assert.equal(normalizePosterPreference(undefined), "betterposters");
  assert.equal(normalizePosterPreference(""), "betterposters");
  assert.equal(normalizePosterPreference("betterposters"), "betterposters");
  assert.equal(normalizePosterPreference("AniList"), "anilist", "legacy explicit opt-out remains valid");
  const metas = [
    { id:"tt1234567",type:"series",poster:"https://s4.anilist.co/cover.jpg" },
    { id:"mal:11",type:"series",poster:"https://s4.anilist.co/backup.jpg" },
    { id:"tt1234567-untrusted",type:"series",poster:"https://s4.anilist.co/unsafe.jpg" },
  ];
  const result = projectCatalogPosters(metas);
  assert.equal(result[0].poster, "https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg");
  assert.deepEqual(result.slice(1), metas.slice(1));
  assert.deepEqual(projectCatalogPosters(metas, "anilist"), metas);
  assert.equal(metas[0].poster, "https://s4.anilist.co/cover.jpg");
});

test("default manifest advertises 11 catalogs without an unnecessary artwork provider filter", () => {
  const catalogList = catalogDefinitions(SEASONS);
  assert.equal(catalogList.length, 11);
  for (const catalog of catalogList) {
    assert.equal(catalog.extra.some(x => x.name === "artwork"), false, catalog.id);
    assert.deepEqual(catalog.extra.slice(0,2).map(x=>x.name), ["search","skip"], catalog.id);
  }
  assert.deepEqual(normalizeCatalogRequestOptions({}), {ok:true,skip:0,search:""});
  assert.deepEqual(normalizeCatalogRequestOptions({artwork:"AniList"}), {
    ok:true,skip:0,search:"",artwork:"anilist",
  }, "explicit old URL override must remain usable");
});

test("default canonical catalog and language variants use BetterPosters without extra upstream fetches", async () => {
  const seasonInfo = getSeasonInfo(new Date());
  const cacheKey = catalogResponseCacheKey({id:"current_season",seasonInfo,skip:0,search:""});
  const cached = { id:"tt1234567",type:"series",name:"English",poster:"https://s4.anilist.co/cover.jpg",
    extra:{anilistId:11,titleRomaji:"Romaji",titleNative:"日本の題名"} };
  const reads = [];
  setCatalogRuntimeCacheForTests({
    async get(key){ reads.push(key); return key === cacheKey ? {metas:[cached],freshUntil:Date.now()+60000} : null; },
    async set(){ throw Error("unexpected cache write"); },
  });
  setCatalogRequestRateLimiterForTests({async limit(){return{success:true};}});
  try {
    const paths = [
      ["/catalog/series/current_season.json","https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg","English"],
      ["/romaji/catalog/series/current_season.json","https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg","Romaji"],
      ["/native/catalog/series/current_season.json","https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg","日本の題名"],
      ["/betterposters/catalog/series/current_season.json","https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg","English"],
      ["/catalog/series/current_season.json?artwork=AniList","https://s4.anilist.co/cover.jpg","English"],
    ];
    for (const [path,poster,name] of paths) {
      const response = await catalogSource.fetch(new Request("https://anibloom.example"+path));
      assert.equal(response.status,200,path);
      const json=await response.json();
      assert.equal(json.metas[0].poster,poster,path);
      assert.equal(json.metas[0].name,name,path);
    }
    assert.deepEqual(reads,Array(paths.length).fill(cacheKey));
    assert.equal(cached.poster,"https://s4.anilist.co/cover.jpg");
  } finally {
    setCatalogRequestRateLimiterForTests(null);
    setCatalogRuntimeCacheForTests(null);
  }
});

test("homepage offers title styles and automatic BetterPosters without a provider selector", () => {
  const html=renderHome();
  assert.match(html,/BetterPosters/);
  assert.match(html,/automatically/i);
  assert.match(html,/id="title-preference"/);
  assert.doesNotMatch(html,/id="artwork-provider"/);
  assert.doesNotMatch(html,/PostersPlus/);
  assert.doesNotMatch(html,/Catalog artwork source/);
  assert.match(html,/nuvio:\/\/anibloom\.vercel\.app\/manifest\.json/);
  assert.match(html,/const url=origin\+prefix\+"\/manifest.json"/);
  assert.equal((html.match(/class="catalog-card"/g)||[]).length,8);
  assert.equal((html.match(/class="catalog-card catalog-card-optional"/g)||[]).length,3);
});
