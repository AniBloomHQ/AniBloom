import test from "node:test";
import assert from "node:assert/strict";
import { cacheProviderLookup } from "../lib/catalog-provider-cache.js";
import { setCatalogRuntimeCacheForTests } from "../lib/catalog-runtime-cache.js";
import { resolveAniListMappingsByAniBridge, clearAniBridgeCache } from "../lib/anibridge-mapping.js";

test("successful bulk-dataset misses are briefly reused without becoming verified identities", async () => {
  const cache = new Map();
  setCatalogRuntimeCacheForTests({ get: async key => cache.get(key), set: async (key, value) => cache.set(key, value) });
  let calls = 0;
  const rows = [{ id: 1 }];
  try {
    const lookup = cacheProviderLookup("bulk", async () => { calls++; return new Map(); }, rows, { cacheEmpty: true });
    await lookup(rows); await lookup(rows);
    assert.equal(calls, 1);
    assert.equal([...cache.keys()].some(key => key.startsWith("verified-identity:")), false);
    for (const entry of cache.values()) entry.expiresAt = 0;
    await lookup(rows);
    assert.equal(calls, 2);
  } finally { setCatalogRuntimeCacheForTests(null); }
});

test("failed provider lookups are retried and never cached as empty successes", async () => {
  const cache = new Map();
  setCatalogRuntimeCacheForTests({ get: async key => cache.get(key), set: async (key, value) => cache.set(key, value) });
  let calls = 0;
  try {
    const lookup = cacheProviderLookup("bulk", async () => { calls++; throw new Error("temporary failure"); }, [{ id: 1 }], { cacheEmpty: true });
    await assert.rejects(lookup([1]), /temporary failure/);
    await assert.rejects(lookup([1]), /temporary failure/);
    assert.equal(calls, 2);
    assert.equal(cache.size, 0);
  } finally { setCatalogRuntimeCacheForTests(null); }
});

test("primary mapper empty responses retain their recovery behavior", async () => {
  const cache = new Map();
  setCatalogRuntimeCacheForTests({ get: async key => cache.get(key), set: async (key, value) => cache.set(key, value) });
  let calls = 0;
  try {
    const lookup = cacheProviderLookup("arm", async () => { calls++; return new Map(); }, [{ id: 1 }]);
    await lookup([1]); await lookup([1]);
    assert.equal(calls, 2);
  } finally { setCatalogRuntimeCacheForTests(null); }
});

test("an AniBridge outage cooldown cannot be mistaken for a confirmed missing mapping", async () => {
  const cache = new Map();
  setCatalogRuntimeCacheForTests({ get: async key => cache.get(key), set: async (key, value) => cache.set(key, value) });
  clearAniBridgeCache();
  let calls = 0;
  const rows = [{ id: 1, format: "TV", title: { english: "Example" } }];
  const resolve = targets => resolveAniListMappingsByAniBridge(targets, {
    fetchImpl: async () => { calls++; return new Response("Unavailable", { status: 503 }); }, now: () => 1000,
  });
  try {
    const lookup = cacheProviderLookup("anibridge", resolve, rows, { cacheEmpty: true });
    await assert.rejects(lookup(rows), /503/);
    await assert.rejects(lookup(rows), /503/);
    assert.equal(calls, 1, "the existing source cooldown still avoids repeated failed downloads");
    assert.equal(cache.size, 0, "a cooldown error must not persist as a successful no-match result");
  } finally { clearAniBridgeCache(); setCatalogRuntimeCacheForTests(null); }
});
