import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import catalogSource, { getSeasonInfo } from "../api/catalog-source.js";
import { buildManifest } from "../api/resolver-manifest.js";
import { catalogResponseCacheKey, setCatalogRuntimeCacheForTests } from "../lib/catalog-runtime-cache.js";
import { setCatalogRequestRateLimiterForTests } from "../lib/catalog-request-rate-limiter.js";
import home from "../api/home-selector.js";

const SEASONS = {
  ongoing: { season: "FALL", year: 2026 },
  previous: { season: "SUMMER", year: 2026 },
  upcoming: { season: "WINTER", year: 2027 },
};
const EXPECTED_IDS = [
  "upcoming_season", "current_season", "previous_season",
  "upcoming_season_movies", "current_season_movies", "previous_season_movies",
  "upcoming_3_days", "previous_3_days", "airing_today",
  "upcoming_7_days", "top_season",
];

function homepage() {
  let html;
  home({}, { status(n) { assert.equal(n, 200); return this; }, setHeader() {},
    send(value) { html = value; } });
  return html;
}

test("canonical English/Romaji/Native manifests advertise all eleven catalogs without duplicate IDs", () => {
  const ordinary = buildManifest(SEASONS);
  assert.deepEqual(ordinary.catalogs.map(c => c.id), EXPECTED_IDS);
  assert.equal(new Set(ordinary.catalogs.map(c => c.id)).size, 11);
  for (const mode of ["english", "romaji", "native"]) {
    for (const legacy of [{}, {includeExtended: true}, {includeTop: true},
      {includeExtended: true, includeTop: true}]) {
      const manifest = buildManifest(SEASONS, mode, legacy);
      assert.deepEqual(manifest.catalogs.map(c => c.id), EXPECTED_IDS, mode + JSON.stringify(legacy));
      assert.deepEqual(manifest.catalogs.map(c => c.type), ordinary.catalogs.map(c => c.type));
      assert.equal(manifest.catalogs.at(-1).type, "series");
      assert.match(manifest.catalogs.at(-1).name, mode === "native" ? /人気/ : /Top Anime/);
      for (const catalog of manifest.catalogs) assert.ok(catalog.extra.find(e => e.name === "artwork"));
    }
  }
});

test("legacy manifest aliases remain addressable and expose the same full catalog set", async () => {
  const { createPreviewServer } = await import("../scripts/dev-server.js");
  const server = createPreviewServer();
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const origin = "http://127.0.0.1:" + server.address().port;
  try {
    for (const lang of ["", "/romaji", "/native"]) {
      const main = await (await fetch(origin + lang + "/manifest.json")).json();
      assert.deepEqual(main.catalogs.map(c => c.id), EXPECTED_IDS);
      for (const legacy of ["/extended", "/ranked", "/extended/ranked"]) {
        const res = await fetch(origin + lang + legacy + "/manifest.json");
        assert.equal(res.status, 200, lang + legacy);
        const manifest = await res.json();
        assert.deepEqual(manifest.catalogs, main.catalogs);
      }
    }
    const invalid = await fetch(origin + "/catalog/series/nonexistent.json");
    assert.equal(invalid.status, 404);
    const top = await fetch(origin + "/catalog/series/top_season.json?skip=1001");
    assert.equal(top.status, 400);
    assert.equal((await top.json()).code, "INVALID_SKIP");
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test("artwork manifest variants route both poster choices with bounded public stateless paths", async () => {
  const routes = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).rewrites;
  const { createPreviewServer } = await import("../scripts/dev-server.js");
  const server = createPreviewServer();
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const origin = "http://127.0.0.1:" + server.address().port;
  try {
    for (const lang of ["", "/romaji", "/native"]) for (const provider of ["betterposters", "postersplus"]) {
      const prefix = lang + "/" + provider;
      for (const shape of ["/manifest.json", "/catalog/:type/:id.json", "/catalog/:type/:id/:extra*"]) {
        const match = routes.filter(r => r.source === prefix + shape);
        assert.equal(match.length, 1, prefix + shape);
        assert.match(match[0].destination, new RegExp("artwork=" + provider));
        if (lang) assert.match(match[0].destination, new RegExp("titleMode=" + lang.slice(1)));
      }
      const response = await fetch(origin + prefix + "/manifest.json");
      assert.equal(response.status, 200, prefix);
      assert.deepEqual((await response.json()).catalogs.map(c => c.id), EXPECTED_IDS);
      const invalid = await fetch(origin + prefix + "/catalog/series/top_season.json?skip=1001");
      assert.equal(invalid.status, 400, prefix);
      const badExtra = await fetch(origin + prefix + "/catalog/series/current_season.json?artwork=invalid");
      assert.equal(badExtra.status, 400, prefix);
    }
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test("artwork manifest routes project posters from the same existing cached identities", async () => {
  const info = getSeasonInfo(new Date());
  const key = catalogResponseCacheKey({id:"current_season",seasonInfo:info,skip:0,search:""});
  const meta = {
    id:"tt1234567",name:"English title",type:"series",
    poster:"https://s4.anilist.co/cover.jpg",
    extra:{anilistId:11,titleRomaji:"Romaji title",titleNative:"日本の名前"},
  };
  const reads = [];
  setCatalogRuntimeCacheForTests({
    async get(k) { reads.push(k); return k === key ? {metas:[meta],freshUntil:Date.now()+60000} : null; },
    async set() { throw Error("no cache writes expected"); },
  });
  setCatalogRequestRateLimiterForTests({async limit(){return{success:true};}});
  const prior=process.env.POSTERSPLUS_PUBLIC_BASE_URL;
  process.env.POSTERSPLUS_PUBLIC_BASE_URL="https://posters.example.org";
  try {
    const cases=[
      ["/catalog/series/current_season.json",meta.poster,"English title"],
      ["/betterposters/catalog/series/current_season.json","https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg","English title"],
      ["/romaji/betterposters/catalog/series/current_season.json","https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg","Romaji title"],
      ["/postersplus/catalog/series/current_season.json","https://posters.example.org/poster?anilist_id=11&type=series","English title"],
      ["/native/postersplus/catalog/series/current_season.json","https://posters.example.org/poster?anilist_id=11&type=series","日本の名前"],
      ["/betterposters/catalog/series/current_season.json?artwork=AniList",meta.poster,"English title"],
    ];
    for (const [path,poster,title] of cases) {
      const response=await catalogSource.fetch(new Request("https://example.test"+path));
      assert.equal(response.status,200,path);
      const payload=await response.json();
      assert.equal(payload.metas[0].poster,poster,path);
      assert.equal(payload.metas[0].name,title,path);
    }
    assert.deepEqual(reads,Array(cases.length).fill(key));
    assert.equal(meta.poster,"https://s4.anilist.co/cover.jpg");
  } finally {
    if (prior===undefined) delete process.env.POSTERSPLUS_PUBLIC_BASE_URL;
    else process.env.POSTERSPLUS_PUBLIC_BASE_URL=prior;
    setCatalogRequestRateLimiterForTests(null);
    setCatalogRuntimeCacheForTests(null);
  }
});

test("homepage exposes all eleven cards and configures artwork at install time without credential URLs", () => {
  const html=homepage();
  const names=[...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map(x=>x[1]);
  assert.deepEqual(names,[
    "Upcoming 3 days","Previous 3 days","Current Season","Current Season Movies",
    "Previous Season","Previous Season Movies","Upcoming Season","Upcoming Season Movies",
    "Airing Today","Upcoming — 7 days","Top Anime of the Season",
  ]);
  assert.match(html,/id="artwork-provider"/);
  assert.match(html,/value="betterposters"/);
  assert.match(html,/value="postersplus"/);
  assert.match(html,/per.catalog/i);
  assert.match(html,/Nuvio/i);
  assert.match(html,/extra requests/i);
  assert.doesNotMatch(html,/id="extended-catalogs"/);
  assert.doesNotMatch(html,/id="ranked-catalogs"/);
  assert.match(html,/artwork\.value/);
  assert.match(html,/\/"betterposters"/);
  assert.match(html,/\/"postersplus"/);
  assert.doesNotMatch(html,/access_key=|api_key=|secret=/i);
});
