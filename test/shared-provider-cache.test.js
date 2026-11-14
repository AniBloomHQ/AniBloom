import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setCatalogRuntimeCacheForTests } from "../lib/catalog-runtime-cache.js";
import { configureSharedProviderCaching, SHARED_PROVIDER_TTL_MS } from "../lib/shared-provider-cache.js";
import { clearAnimeMapperCache, resolveAniListMappingsByAnimeMapper, resolveAniListRelatedProviderIdsByAnimeMapper, resolveAniListCanonicalSeriesByAnimeMapper } from "../lib/anime-mapper-mapping.js";
import { clearKitsuMappingCache, resolveAniListKitsuMappings } from "../lib/kitsu-fallback.js";
import { getProviderCandidates, selectProviderIdentity } from "../lib/provider-identity.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let shared;
beforeEach(() => {
  shared = new Map();
  configureSharedProviderCaching(true);
  clearAnimeMapperCache(); clearKitsuMappingCache();
  setCatalogRuntimeCacheForTests({
    get: async key => structuredClone(shared.get(key)),
    set: async (key, value) => { shared.set(key, structuredClone(value)); },
  });
});
afterEach(() => {
  configureSharedProviderCaching(false);
  clearAnimeMapperCache(); clearKitsuMappingCache();
  setCatalogRuntimeCacheForTests(null);
});

const row = { id: 1002, idMal: 2002, format: "TV", title: { english: "Example Series Season 2" }, startDate: { year: 2026 } };
const response = value => new Response(JSON.stringify(value), { status: 200 });
const primary = (tmdb = 1234) => ({ mappings: { mal: 2002, anilist: 1002, tmdb }, type: "TV", title: { english: row.title.english }, year: 2026 });
const fallback = { id: 1002, idMal: 2002, currentFallbackId: "mal:2002" };
function mapping(site, externalId, kitsuId) {
  return { type: "mappings", attributes: { externalSite: site, externalId }, relationships: { item: { data: { type: "anime", id: String(kitsuId) } } } };
}
function kitsuResponse(url, ids) {
  const query = new URL(url).searchParams;
  const data = ids.map(id => mapping(query.get("filter[externalSite]"), query.get("filter[externalId]"), id));
  return response({ data, meta: { count: data.length } });
}

test("shared Anime Mapper facts preserve direct, relation protection and canonical decisions across process-cache resets", async () => {
  let calls = 0;
  const child = { ...primary(), sequence: [{ malId: 2001, format: "TV", relationType: "PREQUEL", seasonYear: 2020 }] };
  const parent = { mappings: { mal: 2001, anilist: 1001, tmdb: 1234 }, type: "TV", title: { english: "Example Series" }, year: 2020, sequence: [] };
  const options = { baseUrl: "https://mapper.test", fetchImpl: async url => { calls++; return response(url.endsWith("2001.json") ? parent : child); } };
  async function run() {
    return [await resolveAniListMappingsByAnimeMapper([row], options),
      await resolveAniListRelatedProviderIdsByAnimeMapper([row], options),
      await resolveAniListCanonicalSeriesByAnimeMapper([row], options)];
  }
  const before = await run();
  assert.equal(before[2].get(row.id).canonicalAnilistId, 1001);
  assert.equal(calls, 2);
  clearAnimeMapperCache();
  const after = await run();
  assert.deepEqual(after, before);
  assert.equal(calls, 2, "all three paths should use the shared source records");
});

test("a shared raw record cannot override changed AniList identity or movie/TV checks", async () => {
  const options = { fetchImpl: async () => response({ ...primary(), type: "Movie", mappings: { mal: 2002, anilist: 1002, tmdb: 1591447, traktType: "movies" } }) };
  await resolveAniListMappingsByAnimeMapper([row], options);
  clearAnimeMapperCache();
  const fromShared = await resolveAniListMappingsByAnimeMapper([row], { fetchImpl: async () => { throw new Error("unexpected network"); } });
  const records = fromShared.get(row.id);
  assert.equal(records[0].tmdbTvId, null);
  assert.equal(selectProviderIdentity({ ...row, anilistId: row.id }, getProviderCandidates(row, records)), null);
  const changed = await resolveAniListMappingsByAnimeMapper([{ ...row, id: 9999 }], options);
  assert.equal(changed.size, 0);
});

test("expired shared records are refreshed without extending lifetime during promotion", async () => {
  let now = 1000, calls = 0;
  const options = { now: () => now, fetchImpl: async () => response(primary(++calls)) };
  await resolveAniListMappingsByAnimeMapper([row], options);
  const expiry = [...shared.values()][0].expiresAt;
  clearAnimeMapperCache(); now += 1000;
  await resolveAniListMappingsByAnimeMapper([row], options);
  assert.equal(calls, 1);
  assert.equal([...shared.values()][0].expiresAt, expiry);
  now = expiry + 1;
  const refreshed = await resolveAniListMappingsByAnimeMapper([row], options);
  assert.equal(calls, 2);
  assert.equal(refreshed.get(row.id)[0].tmdbTvId, 2);
});

test("Anime Mapper shared records are isolated by source URL and reject a mismatched MAL ID", async () => {
  const first = await resolveAniListMappingsByAnimeMapper([row], { baseUrl: "https://one.test", fetchImpl: async () => response(primary(1)) });
  const second = await resolveAniListMappingsByAnimeMapper([row], { baseUrl: "https://two.test", fetchImpl: async () => response(primary(2)) });
  assert.equal(first.get(row.id)[0].tmdbTvId, 1); assert.equal(second.get(row.id)[0].tmdbTvId, 2);
  clearAnimeMapperCache(); shared.clear();
  const invalid = await resolveAniListMappingsByAnimeMapper([row], { fetchImpl: async () => response({ ...primary(), mappings: { mal: 9999, anilist: row.id, tmdb: 3 } }) });
  assert.equal(invalid.size, 0); assert.equal(shared.size, 0);
});

test("provider outages and malformed or identity-empty records never become shared positive entries", async () => {
  for (const payload of [null, [], { mappings: {} }]) {
    clearAnimeMapperCache();
    await resolveAniListMappingsByAnimeMapper([row], { fetchImpl: async () => response(payload) });
    assert.equal(shared.size, 0);
  }
  clearAnimeMapperCache();
  await resolveAniListMappingsByAnimeMapper([row], { fetchImpl: async () => new Response("Unavailable", { status: 503 }) });
  assert.equal(shared.size, 0);
  clearAnimeMapperCache();
  const recovered = await resolveAniListMappingsByAnimeMapper([row], { fetchImpl: async () => response(primary()) });
  assert.equal(recovered.get(row.id)[0].tmdbTvId, 1234);
});

test("corrupt shared Anime Mapper entries fail open to the original provider", async () => {
  const options = { fetchImpl: async () => response(primary()) };
  await resolveAniListMappingsByAnimeMapper([row], options);
  for (const entry of shared.values()) entry.value = { mappings: { mal: 9999 } };
  clearAnimeMapperCache();
  const recovered = await resolveAniListMappingsByAnimeMapper([row], options);
  assert.equal(recovered.get(row.id)[0].tmdbTvId, 1234);
});

test("Kitsu shares only unambiguous positive external mappings and retains source preference", async () => {
  let calls = 0;
  const options = { fetchImpl: async url => { calls++; return kitsuResponse(url, [9001]); } };
  const first = await resolveAniListKitsuMappings([fallback], options);
  clearKitsuMappingCache();
  const second = await resolveAniListKitsuMappings([fallback], options);
  assert.deepEqual(second, first); assert.equal(second.get(1002), "9001"); assert.equal(calls, 1);
  const otherSite = await resolveAniListKitsuMappings([{ id: 2002, currentFallbackId: "anilist:2002" }], {
    fetchImpl: async url => { calls++; return kitsuResponse(url, [9002]); },
  });
  assert.equal(otherSite.get(2002), "9002"); assert.equal(calls, 2);
});

test("Kitsu shared promotion retains expiry and expired mappings can change", async () => {
  await resolveAniListKitsuMappings([fallback], { fetchImpl: async url => kitsuResponse(url, [9001]) });
  const entry = [...shared.values()][0]; const expiry = entry.expiresAt;
  assert.ok(expiry <= Date.now() + SHARED_PROVIDER_TTL_MS);
  clearKitsuMappingCache();
  await resolveAniListKitsuMappings([fallback], { fetchImpl: async () => { throw new Error("unexpected network"); } });
  assert.equal(entry.expiresAt, expiry);
  entry.expiresAt = 0; clearKitsuMappingCache();
  const refreshed = await resolveAniListKitsuMappings([fallback], { fetchImpl: async url => kitsuResponse(url, [9002]) });
  assert.equal(refreshed.get(1002), "9002");
});

test("empty, ambiguous and failed Kitsu lookups are not shared across restarts", async () => {
  for (const ids of [[], [9001, 9002]]) {
    clearKitsuMappingCache();
    await resolveAniListKitsuMappings([fallback], { fetchImpl: async url => kitsuResponse(url, ids) });
    assert.equal(shared.size, 0);
  }
  clearKitsuMappingCache();
  await resolveAniListKitsuMappings([fallback], { fetchImpl: async () => new Response("Unavailable", { status: 503 }) });
  assert.equal(shared.size, 0);
});

test("a cached secondary Kitsu result cannot hide recovery of the preferred source", async () => {
  let preferredRecovered = false;
  const options = { fetchImpl: async url => {
    const preferred = new URL(url).searchParams.get("filter[externalSite]") === "myanimelist/anime";
    return preferred && !preferredRecovered ? new Response("Unavailable", { status: 503 }) : kitsuResponse(url, [preferred ? 9002 : 9001]);
  } };
  assert.equal((await resolveAniListKitsuMappings([fallback], options)).get(1002), "9001");
  clearKitsuMappingCache(); preferredRecovered = true;
  assert.equal((await resolveAniListKitsuMappings([fallback], options)).get(1002), "9002");
});

test("shared cache outages fail open and caching remains explicitly opt-in", async () => {
  setCatalogRuntimeCacheForTests({ get: async () => { throw new Error("offline"); }, set: async () => { throw new Error("offline"); } });
  assert.equal((await resolveAniListMappingsByAnimeMapper([row], { fetchImpl: async () => response(primary()) })).get(row.id)[0].tmdbTvId, 1234);
  assert.equal((await resolveAniListKitsuMappings([fallback], { fetchImpl: async url => kitsuResponse(url, [9001]) })).get(1002), "9001");
  clearAnimeMapperCache(); clearKitsuMappingCache(); configureSharedProviderCaching(false);
  let reads = 0, writes = 0;
  setCatalogRuntimeCacheForTests({ get: async () => { reads++; }, set: async () => { writes++; } });
  await resolveAniListMappingsByAnimeMapper([row], { fetchImpl: async () => response(primary()) });
  await resolveAniListKitsuMappings([fallback], { fetchImpl: async url => kitsuResponse(url, [9001]) });
  assert.equal(reads, 0); assert.equal(writes, 0);
});

test("Anime Mapper and Kitsu positives survive an actual new Node process without changing IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "anibloom-shared-provider-"));
  const moduleUrl = file => new URL(`../lib/${file}.js`, import.meta.url).href;
  const source = `
    import { createLocalCatalogCache } from ${JSON.stringify(moduleUrl("local-catalog-cache"))};
    import { configureLocalCatalogCache } from ${JSON.stringify(moduleUrl("catalog-runtime-cache"))};
    import { configureSharedProviderCaching } from ${JSON.stringify(moduleUrl("shared-provider-cache"))};
    import { resolveAniListMappingsByAnimeMapper } from ${JSON.stringify(moduleUrl("anime-mapper-mapping"))};
    import { resolveAniListKitsuMappings } from ${JSON.stringify(moduleUrl("kitsu-fallback"))};
    const cache = await createLocalCatalogCache({ file: process.argv[1] });
    configureLocalCatalogCache(cache); configureSharedProviderCaching(true);
    let requests = 0;
    const mapper = await resolveAniListMappingsByAnimeMapper([${JSON.stringify(row)}], {
      fetchImpl: async () => { requests++; return Response.json(${JSON.stringify(primary())}); },
    });
    const kitsu = await resolveAniListKitsuMappings([${JSON.stringify(fallback)}], {
      fetchImpl: async url => { requests++; return Response.json({ data: [{
        attributes: { externalSite: 'myanimelist/anime', externalId: '2002' },
        relationships: { item: { data: { type: 'anime', id: '9001' } } },
      }], meta: { count: 1 } }); },
    });
    await cache.flush();
    console.log(JSON.stringify({ requests, mapper: [...mapper], kitsu: [...kitsu] }));
  `;
  const run = async () => JSON.parse((await promisify(execFile)(process.execPath,
    ["--input-type=module", "-e", source, join(directory, "cache.json")])).stdout);
  try {
    const before = await run(), after = await run();
    assert.equal(before.requests, 2); assert.equal(after.requests, 0);
    assert.deepEqual(after.mapper, before.mapper); assert.deepEqual(after.kitsu, before.kitsu);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
