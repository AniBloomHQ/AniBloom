import test from "node:test";
import assert from "node:assert/strict";
import { collectValidatedCatalogPage } from "../lib/catalog-pagination.js";
import { buildRollingCatalog } from "../api/catalog-source.js";
import { MAX_SCHEDULE_PAGES } from "../lib/catalog-config.js";

test("busy rolling paging reports possible budget truncation without making a ninth upstream call",async()=>{
  const pages=[];
  const status=[];
  const metas=await collectValidatedCatalogPage({
    skip:0,pageSize:2,maxPages:MAX_SCHEDULE_PAGES,
    fetchPage:async page=>{pages.push(page);return [{id:"duplicated"},{id:"duplicated"}]},
    canonicalizePage:async rows=>rows,
    onComplete:async info=>status.push(info),
  });
  assert.deepEqual(pages,[1,2,3,4,5,6,7,8]);
  assert.deepEqual(metas.map(m=>m.id),["duplicated"]);
  assert.equal(status.length,1);
  assert.equal(status[0].budgetExhausted,true);
  assert.equal(status[0].pagesFetched,8);
  assert.equal(status[0].targetReached,false);
});

test("short upstream page and complete valid result do not trigger false budget warnings",async()=>{
  for(const scenario of ["short-page","complete"]){
    const status=[];const pages=[];
    const metas=await collectValidatedCatalogPage({
      skip:0,pageSize:2,maxPages:8,
      fetchPage:async page=>{pages.push(page);return scenario==="short-page"?[{id:"a"}]:[{id:"a"},{id:"b"}]},
      canonicalizePage:async rows=>rows,
      onComplete:info=>status.push(info),
    });
    assert.equal(pages.length,1);
    assert.equal(status.length,1);
    assert.equal(status[0].budgetExhausted,false);
    assert.equal(status[0].pagesFetched,1);
    assert.deepEqual(metas.map(m=>m.id),scenario==="short-page"?["a"]:["a","b"]);
  }
});

test("rolling completeness warning is diagnostic-only and does not mutate public catalog metas",async()=>{
  const now=new Date("2026-11-13T00:00:00Z"), stages={},pages=[];
  const start=Math.floor(now.getTime()/1000)+3600;
  const make=(page,ix)=>({id:page*100+ix,airingAt:start+page*10+ix,episode:1,
    media:{id:900,page,format:"TV",isAdult:false,idMal:1234,title:{english:"Example",romaji:"Example",native:"例"},startDate:{year:2026},endDate:{year:null}}});
  const result=await buildRollingCatalog("upcoming_3_days",now,0,"",{
    pageSize:2,maxPages:2,diagnostics:stages,
    fetchPage:async(_start,_end,_future,page)=>{pages.push(page);return [make(page,1),make(page,2)]},
    resolveMappings:async()=>new Map(),
    resolveFribbMappings:async()=>new Map(),
    resolveExternalMappings:async()=>new Map(),
    resolveAnimapMappings:async()=>new Map(),
    resolveIdMapperMappings:async()=>new Map(),
    resolveTMDBMappings:async()=>new Map(),
    resolveAnimeMapperMappings:async()=>new Map(),
    resolveAnimeMapperRelatedProviderIds:async()=>new Map(),
    resolveCanonicalSeriesMappings:async()=>new Map(),
    resolveAniBridgeMappings:async()=>new Map(),
    resolveTsvMappings:async()=>new Map(),
    resolveImdbMappings:async()=>new Map(),
    validateImdbMappings:async()=>new Map(),
    resolveSecondaryMappings:async()=>new Map(),
    resolveAlternativeMappings:async()=>new Map(),
  });
  assert.deepEqual(pages,[1,2]);
  assert.equal(stages.rollingScheduleBudgetExhausted,1);
  assert.equal(stages.rollingSchedulePages,2);
  assert.ok(Array.isArray(result));
  assert.equal(result.length,1);
  assert.ok(!Object.prototype.hasOwnProperty.call(result[0],"budgetExhausted"));
});
