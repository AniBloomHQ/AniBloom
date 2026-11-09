import assert from "node:assert/strict";
import test from "node:test";
import { runCatalogFanoutScenario } from "../test-support/catalog-fanout-harness.mjs";

test("separate catalog workers coalesce simultaneous cold misses", async () => {
  const result = await runCatalogFanoutScenario();
  assert.equal(result.results.every(item => item.ok && item.status === 200), true);
  assert.deepEqual(result.results.map(item => item.metas.map(meta => meta.id)), [
    ["mal:456"],
    ["mal:456"],
  ]);
  assert.equal(result.anilistCalls, 1, "the AniList request lock should already coalesce GraphQL misses");
  assert.equal(result.armCalls, 1, "one catalog build should execute across both workers");
  assert.equal(result.catalogWrites, 1, "only the lock owner should write the shared catalog response");
  assert.equal(result.providerTargets.length, 16, "only one build should traverse the mocked provider fallback chain");
  assert.equal(result.providerCountsByHost["kitsu.io"], 2, "the single build should perform two Kitsu fallback lookups");
  assert.equal(result.providerCountsByHost["raw.githubusercontent.com"], 3, "the single build should perform Fribb and AnimeAPI TSV dataset lookups");
  assert.ok(result.durationMs < 5_000);
});

test("warm shared catalog response avoids AniList and all identity provider fan-out", async () => {
  const result=await runCatalogFanoutScenario({warm:true});
  assert.equal(result.results.every(x=>x.ok && x.status===200 && !x.stale),true);
  assert.equal(result.anilistCalls,0);
  assert.equal(result.armCalls,0);
  assert.equal(result.catalogWrites,0);
  assert.equal(result.providerTargets.length,0);
});

test("separate catalog workers coalesce stale background refreshes", async () => {
  const result = await runCatalogFanoutScenario({ stale: true });
  assert.equal(result.results.every(item => item.ok && item.status === 200 && item.stale), true);
  assert.deepEqual(result.results.map(item => item.metas.map(meta => meta.id)), [
    ["mal:456"],
    ["mal:456"],
  ]);
  assert.equal(result.anilistCalls, 1, "the AniList request lock should already coalesce GraphQL misses");
  assert.equal(result.armCalls, 1, "only one instance should refresh a stale catalog");
  assert.equal(result.catalogWrites, 1, "only the lock owner should write the refreshed catalog");
  assert.equal(result.providerTargets.length, 16, "only one refresh should traverse the mocked provider fallback chain");
  assert.equal(result.providerCountsByHost["kitsu.io"], 2, "the single refresh should perform two Kitsu fallback lookups");
  assert.equal(result.providerCountsByHost["raw.githubusercontent.com"], 3, "the single refresh should perform Fribb and AnimeAPI TSV dataset lookups");
  assert.ok(result.durationMs < 5_000);
});

test("catalog refresh lock renews its lease and protects a successor owner", async () => {
  const { acquireCatalogRefreshLock, setAniListRedisClientForTests } = await import("../lib/catalog-rate-limiter.js");
  const locks = new Map();
  const redis = {
    async set(key, token, options) {
      const current = locks.get(key);
      if (current && current.expiresAt > Date.now()) return null;
      locks.set(key, { token, expiresAt: Date.now() + options.px });
      return "OK";
    },
    async eval(script, keys, args) {
      const current = locks.get(keys[0]);
      if (current?.token !== args[0]) return 0;
      if (script.includes("pexpire")) {
        current.expiresAt = Date.now() + Number(args[1]);
        return 1;
      }
      locks.delete(keys[0]);
      return 1;
    },
  };
  setAniListRedisClientForTests(redis);
  try {
    const owner = await acquireCatalogRefreshLock("same-catalog", { leaseMs: 1_000 });
    assert.equal(owner.status, "acquired");
    const key = [...locks.keys()][0];
    const initialExpiry = locks.get(key).expiresAt;
    assert.equal(await owner.renew(5_000), true);
    assert.ok(locks.get(key).expiresAt >= initialExpiry + 3_000);

    locks.set(key, { token: "successor-owner", expiresAt: Date.now() + 5_000 });
    assert.equal(await owner.renew(5_000), false);
    await owner.release();
    assert.equal(locks.get(key)?.token, "successor-owner", "an expired owner must not renew or release a successor's lock");

    setAniListRedisClientForTests({
      async set() { return "OK"; },
      async eval() { throw new Error("Redis unavailable during lease renewal"); },
    });
    const uncertainOwner = await acquireCatalogRefreshLock("redis-outage", { leaseMs: 1_000 });
    assert.equal(uncertainOwner.status, "acquired");
    assert.equal(await uncertainOwner.renew(5_000), null, "a failed renewal must be treated as uncertain, not as confirmed ownership");
    await uncertainOwner.release();
  } finally {
    setAniListRedisClientForTests(null);
  }
});

test("catalog refresh falls open when Redis is unavailable", async () => {
  const result = await runCatalogFanoutScenario({ lockUnavailable: true });
  assert.equal(result.results.every(item => item.ok && item.status === 200), true);
  assert.equal(result.anilistCalls, 2, "the AniList lock also fails open when the shared lock service is unavailable");
  assert.equal(result.armCalls, 2, "both catalog instances build when distributed locking is unavailable");
  assert.equal(result.catalogWrites, 2);
  assert.equal(result.providerTargets.length, 32);
});

test("catalog refresh retries after a shared cache write failure without losing response correctness", async () => {
  const result = await runCatalogFanoutScenario({ cacheWriteFailure: true });
  assert.equal(result.results.every(item => item.ok && item.status === 200), true);
  assert.equal(result.anilistCalls, 1, "AniList response caching remains available independently of catalog response writes");
  assert.equal(result.armCalls, 2, "the second instance retries after the first owner cannot publish the shared catalog");
  assert.equal(result.catalogWrites, 0);
  assert.equal(result.providerTargets.length, 32);
});
