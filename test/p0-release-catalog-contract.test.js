import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { catalogDefinitions, getSeasonInfo } from "../lib/catalog-config.js";
import { PRODUCTION_CATALOG_IDS, validateManifest, catalogTypeForId } from "../scripts/validate-production.mjs";
import { compareCatalogSnapshots, DEFAULT_CATALOGS } from "../lib/catalog-snapshot-diff.js";
import { validateSnapshotManifest } from "../scripts/catalog-snapshot-contract.mjs";

const definitions = catalogDefinitions(getSeasonInfo(new Date("2026-11-09T12:00:00Z")));
const manifest = {
  id: "com.marki.nuvio.anime-releases", version: "2.16.0", identityMode: "provider",
  resources: [{ name: "catalog", types: ["series", "movie"] }],
  types: ["series", "movie"],
  catalogs: definitions,
};

test("production validator and diff share current nine-catalog runtime contract", () => {
  const expected = definitions.map(d => d.id);
  assert.equal(expected.length, 9);
  assert.equal(expected.at(-1), "top_season");
  assert.deepEqual(PRODUCTION_CATALOG_IDS, expected);
  assert.deepEqual(DEFAULT_CATALOGS, expected);
  assert.equal(catalogTypeForId("top_season"), "series");
  assert.equal(catalogTypeForId("current_season_movies"), "movie");
  assert.equal(validateManifest(manifest, "2.16.0"), true);
  assert.throws(() => validateManifest(manifest, "2.15.0"), /version/);
  assert.throws(() => validateManifest({ ...manifest, catalogs: definitions.slice(0, -1) }, "2.16.0"), /catalog/);
  assert.throws(() => validateManifest({ ...manifest, catalogs: [...definitions.slice(0, -1), { ...definitions.at(-1), id: "airing_today" }] }, "2.16.0"), /catalog/);
  assert.throws(() => validateManifest({ ...manifest, catalogs: [...definitions.slice(0, -1), { ...definitions.at(-1), type: "movie" }] }, "2.16.0"), /catalog types/);
});

test("manual snapshot contract validates and exports all nine catalog routes from manifest", () => {
  const rows = validateSnapshotManifest(manifest, "2.16.0");
  assert.deepEqual(rows, definitions.map(({id,type}) => ({id,type})));
  const root = mkdtempSync(path.join(tmpdir(), "anibloom-contract-"));
  try {
    const source = path.join(root, "manifest.json"), output = path.join(root, "routes.tsv");
    writeFileSync(source, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, ["scripts/catalog-snapshot-contract.mjs",source,"2.16.0",output], {encoding:"utf8"});
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(output,"utf8").trim().split("\n"), definitions.map(d=>d.type+":"+d.id));
    assert.equal(rows.at(-1).id, "top_season");
  } finally { rmSync(root, {recursive:true,force:true}); }
  for (const invalid of [
    { ...manifest, catalogs: [...definitions, definitions[0]] },
    { ...manifest, catalogs: definitions.map((d,i) => i===0 ? {...d,id:"../../bad"} : d) },
    { ...manifest, catalogs: definitions.map((d,i) => i===0 ? {...d,type:"other"} : d) },
    { ...manifest, catalogs: definitions.map((d,i) => i===0 ? {...d,pageSize:99999} : d) },
    { ...manifest, resources: [{ name:"catalog",types:["series"] }] },
    { ...manifest, catalogs: [] },
  ]) assert.throws(() => validateSnapshotManifest(invalid,"2.16.0"));
});

test("manual snapshot workflow derives all routes and metadata from a checked manifest, with no hardcoded eight IDs", () => {
  const source = readFileSync(new URL("../.github/workflows/catalog-snapshot.yml",import.meta.url),"utf8");
  assert.match(source,/workflow_dispatch:/);
  assert.doesNotMatch(source,/^\s*(?:push|schedule|workflow_run):/m);
  assert.match(source,/node scripts\/catalog-snapshot-contract\.mjs/);
  assert.match(source,/catalog-contract\.tsv/);
  assert.doesNotMatch(source,/for entry in series:current_season/);
  assert.doesNotMatch(source,/expected = \{\s*"current_season"/);
  assert.doesNotMatch(source,/catalogs = \[\s*"current_season"/);
});

test("snapshot comparison reports added and retired catalogs explicitly instead of silently omitting them", () => {
  const before={releaseVersion:"2.15.0",catalogs:{current_season:{metas:[]},previous_3_days:{metas:[{id:"tt100",name:"Retired",type:"series",extra:{anilistId:100}}]}}};
  const after={releaseVersion:"2.16.0",catalogs:{current_season:{metas:[]},top_season:{metas:[{id:"tt200",name:"Top",type:"series",extra:{anilistId:200}}]}}};
  assert.throws(()=>compareCatalogSnapshots(before,after),/Snapshot catalog sets differ/);
  const diff=compareCatalogSnapshots(before,after,{allowCatalogChanges:true});
  assert.deepEqual(diff.catalogSetChanges,{added:["top_season"],removed:["previous_3_days"]});
  assert.equal(diff.catalogs.top_season.summary.added,1);
  assert.equal(diff.catalogs.previous_3_days.summary.removed,1);
});

test("snapshot CLI loads declared catalog IDs and fails closed on missing snapshot files", () => {
  const root=mkdtempSync(path.join(tmpdir(),"anibloom-snapshot-"));
  const before=path.join(root,"before"),after=path.join(root,"after"),output=path.join(root,"out");
  const write=(dir,version,ids)=>{
    mkdirSync(dir,{recursive:true});
    writeFileSync(path.join(dir,"capture-metadata.json"),JSON.stringify({schemaVersion:4,releaseVersion:version,catalogs:ids}));
    for(const id of ids) writeFileSync(path.join(dir,id+".json"),JSON.stringify({metas:id==="top_season"?[{id:"tt200",name:"Top",type:"series",extra:{anilistId:200}}]:[]}));
  };
  try {
    write(before,"2.15.0",["current_season"]);
    write(after,"2.16.0",["current_season","top_season"]);
    const cmd=()=>spawnSync(process.execPath,["scripts/compare-catalog-snapshots.js",before,after,output],{encoding:"utf8"});
    let result=cmd(); assert.equal(result.status,0,result.stderr);
    const diff=JSON.parse(readFileSync(path.join(output,"release-diff.json"),"utf8"));
    assert.deepEqual(diff.catalogSetChanges.added,["top_season"]);
    assert.equal(diff.catalogs.top_season.summary.added,1);
    rmSync(path.join(after,"top_season.json"));
    result=cmd();
    assert.notEqual(result.status,0,"missing declared snapshot file must not be silently treated as empty");
  } finally { rmSync(root,{recursive:true,force:true}); }
});
