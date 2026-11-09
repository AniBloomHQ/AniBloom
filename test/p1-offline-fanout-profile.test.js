import assert from "node:assert/strict";
import test from "node:test";
import { runMockedCatalogProfile } from "../scripts/profile-catalog-cache.mjs";

test("offline cold/stale/limiter-outage profile reports actual mocked resolver fan-out", async () => {
  const profile = await runMockedCatalogProfile();
  assert.deepEqual(profile.scenarios.map(s => s.mode), ["cold","stale","lock-unavailable"]);
  for (const mode of ["cold","stale"]) {
    const s = profile.scenarios.find(x=>x.mode===mode);
    assert.equal(s.workerCount,2);
    assert.equal(s.anilistCalls,1);
    assert.equal(s.armCalls,1);
    assert.equal(s.catalogWrites,1);
    assert.equal(s.providerRequests,16);
    assert.ok(s.elapsedMs >= 0);
  }
  const degraded=profile.scenarios.find(s=>s.mode==="lock-unavailable");
  assert.equal(degraded.anilistCalls,2);
  assert.equal(degraded.armCalls,2);
  assert.equal(degraded.providerRequests,32);
  assert.equal(profile.measuredProductionCpu,false);
  assert.doesNotMatch(JSON.stringify(profile), /127\.0\.0\.1|https?:\/\/|tt1234567|secret|token/i);
});
