import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPreviewServer } from "../scripts/dev-server.js";
import { ADDON_VERSION } from "../api/version.js";

const rules = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url),"utf8")).rewrites;
const CATALOGS = [
  "upcoming_season", "current_season", "previous_season",
  "upcoming_season_movies", "current_season_movies", "previous_season_movies",
  "upcoming_3_days", "previous_3_days", "top_season",
];
const retired=["airing_today", "upcoming_7_days"];
const manifests=rules.filter(rule=>rule.source.endsWith("/manifest.json"));
const catalogRoutes=rules.filter(rule=>rule.source.includes("/catalog/"));

function catalogPath(rule, id, type, extra = "") {
  // Test precisely the publicly advertised Vercel rewrite path, not a
  // shortened hand-picked route list. A new alias must pass this test.
  let path=rule.source.replace(":type",type).replace(":id",id)
    .replace(":search","Test").replace(":skip","1001");
  if(path.includes(":extra*"))path=path.replace(":extra*",extra || "skip=1001");
  else if(!path.includes("skip=1001"))path+="?skip=1001";
  return path;
}
async function withLocalServer(fn) {
  const server=createPreviewServer();
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});
  try{return await fn("http://127.0.0.1:"+server.address().port)}
  finally{await new Promise(resolve=>server.close(resolve))}
}

test("all Vercel manifest and catalog rewrite patterns are unique, with no unsupported public route families", () => {
  assert.equal(new Set(rules.map(rule=>rule.source)).size,rules.length);
  assert.equal(manifests.length,18);
  assert.equal(catalogRoutes.length,37);
  assert.deepEqual(rules.filter(rule=>!rule.source.endsWith("/manifest.json")&&!rule.source.includes("/catalog/")).map(rule=>rule.source),["/"]);
  for(const rule of catalogRoutes){
    assert.match(rule.destination,/\/api\/catalog-source\?/);
    assert.match(rule.source,/\/catalog\/:type\/:id(?:\.json|\/)/);
    if(rule.source.startsWith("/native/")) assert.match(rule.destination,/titleMode=native/);
    if(rule.source.startsWith("/romaji/")) assert.match(rule.destination,/titleMode=romaji/);
  }
  for(const rule of manifests){
    assert.match(rule.destination,/^\/api\/resolver-manifest(?:\?.*)?$/);
    if(rule.source.startsWith("/native/")) assert.match(rule.destination,/titleMode=native/);
    if(rule.source.startsWith("/romaji/")) assert.match(rule.destination,/titleMode=romaji/);
  }
  assert.deepEqual(manifests.map(rule=>rule.source).filter(route=>route.endsWith("/manifest.json")).length,18);
});

test("all Vercel manifest aliases render the same nine-catalog contract with correct title variants", async () => {
  await withLocalServer(async base=>{
    for(const {source} of manifests){
      const response=await fetch(base+source);
      assert.equal(response.status,200,source);
      const manifest=await response.json();
      assert.equal(manifest.version,ADDON_VERSION,source);
      assert.deepEqual(manifest.catalogs.map(row=>row.id),CATALOGS,source);
      assert.equal(manifest.catalogs.find(row=>row.id==="top_season").type,"series",source);
      for(const id of retired)assert.ok(!manifest.catalogs.some(row=>row.id===id),source);
      if(source.startsWith("/native/")){
        assert.match(manifest.catalogs.find(row=>row.id==="top_season").name,/今期/);
      }
    }
  });
});

test("all 37 catalog rewrites route correctly without an upstream call and refuse retired IDs", async () => {
  await withLocalServer(async base=>{
    for(const rule of catalogRoutes){
      for(const [id,type] of [["top_season","series"],["current_season_movies","movie"]]){
        const url=catalogPath(rule,id,type);
        const response=await fetch(base+url);
        assert.equal(response.status,400,rule.source+" -> "+url+" should route to validation before upstream");
      }
      for(const id of retired){
        const url=catalogPath(rule,id,"series");
        const response=await fetch(base+url);
        assert.equal(response.status,404,rule.source+" -> "+url);
        assert.deepEqual(await response.json(),{metas:[]});
      }
    }
  });
});

test("unknown and malformed addon routes fail closed rather than matching a legacy alias", async () => {
  await withLocalServer(async base=>{
    for(const path of ["/other/manifest.json","/romaji/unknown/manifest.json",
      "/catalog/series/airing_today.json","/native/extended/catalog/movie/top_season.json"]){
      const response=await fetch(base+path);
      assert.equal(response.status,404,path);
    }
  });
});
