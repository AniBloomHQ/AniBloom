import test from "node:test";
import assert from "node:assert/strict";
import { queryAnime, queryAiringSchedulePage, clearAniListRateLimitState } from "../lib/catalog-anilist.js";
import { setCatalogRuntimeCacheForTests } from "../lib/catalog-runtime-cache.js";

const filter = { season: { season: "FALL", year: 2026 }, sort: ["ID"] };

test("malformed HTTP 200 AniList responses are rejected and never cached as empty catalogs", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  clearAniListRateLimitState();
  globalThis.fetch = async () => { calls++; return calls === 1 ? Response.json({ data: { Page: {} } }) : Response.json({ data: { Page: { media: [{ id: 1 }] } } }); };
  try {
    await assert.rejects(queryAnime(filter, 1), { code: "ANILIST_INVALID_RESPONSE" });
    assert.deepEqual(await queryAnime(filter, 1), [{ id: 1 }]);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; clearAniListRateLimitState(); }
});

test("a genuinely empty page and an empty GraphQL errors list remain valid", async () => {
  const original = globalThis.fetch;
  clearAniListRateLimitState();
  globalThis.fetch = async () => Response.json({ errors: [], data: { Page: { media: [] } } });
  try { assert.deepEqual(await queryAnime(filter, 1), []); }
  finally { globalThis.fetch = original; clearAniListRateLimitState(); }
});

test("null and non-JSON HTTP 200 bodies are rejected as invalid responses", async () => {
  const original = globalThis.fetch;
  clearAniListRateLimitState();
  const bodies = ["null", "[]", "not JSON"];
  globalThis.fetch = async () => new Response(bodies.shift(), { status: 200 });
  try {
    for (let i = 0; i < 3; i++) await assert.rejects(queryAnime(filter, 1), { code: "ANILIST_INVALID_RESPONSE" });
  } finally { globalThis.fetch = original; clearAniListRateLimitState(); }
});

test("schedule responses require the schedule array rather than a media array", async () => {
  const original = globalThis.fetch;
  clearAniListRateLimitState();
  globalThis.fetch = async () => Response.json({ data: { Page: { media: [] } } });
  try { await assert.rejects(queryAiringSchedulePage(Date.now(), Date.now() + 100000, true, 1), { code: "ANILIST_INVALID_RESPONSE" }); }
  finally { globalThis.fetch = original; clearAniListRateLimitState(); }
});

test("invalid older shared-cache entries cannot suppress a fresh AniList request", async () => {
  const original = globalThis.fetch;
  clearAniListRateLimitState();
  setCatalogRuntimeCacheForTests({ get: async () => ({ Page: {} }), set: async () => {} });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ data: { Page: { media: [{ id: 2 }] } } }); };
  try { assert.deepEqual(await queryAnime(filter, 1), [{ id: 2 }]); assert.equal(calls, 1); }
  finally { globalThis.fetch = original; clearAniListRateLimitState(); setCatalogRuntimeCacheForTests(null); }
});
