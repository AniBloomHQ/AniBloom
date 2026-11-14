import test from "node:test";
import assert from "node:assert/strict";
import { createCatalogPreviewHandler } from "../api/catalog-preview.js";

function fixture(options = {}) {
  const cache = new Map();
  let calls = 0;
  const app = createCatalogPreviewHandler({
    now: () => new Date("2026-11-14T12:00:00Z"),
    acquirePermit: async () => ({ allowed: true }),
    getCache: async key => cache.get(key),
    setCache: async (key, value) => cache.set(key, value),
    fetchAnime: async () => {
      calls++;
      return Array.from({ length: 50 }, (_, i) => ({ id: i + 1, title: { english: `Title ${i}`, romaji: `Romaji ${i}` }, coverImage: { large: "https://example.test/poster.jpg" } }));
    },
    ...options,
  });
  return { app, calls: () => calls };
}
const request = path => new Request(`http://localhost${path}`);

test("cold previews use one discovery page and return twelve display-only titles", async () => {
  const { app, calls } = fixture();
  const response = await app.fetch(request("/preview/series/current_season.json"));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls(), 1);
  assert.equal(data.metas.length, 12);
  assert.equal(data.artworkSource, "anilist");
  assert.equal(data.metas[0].poster, "https://example.test/poster.jpg");
  assert.equal(data.metas[0].id, undefined, "a display preview must not advertise unresolved playback IDs");
});

test("the direct serverless endpoint honors title preference without requiring rewrite rules", async () => {
  const { app } = fixture();
  const response = await app.fetch(request("/api/catalog-preview?type=series&id=current_season&titleMode=romaji"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).metas[0].name, "Romaji 0");
  assert.equal((await app.fetch(request("/unknown?type=series&id=current_season"))).status, 404);
});

test("previews coalesce simultaneous requests and share discovery data across title languages", async () => {
  const { app, calls } = fixture();
  const [english, romaji] = await Promise.all([
    app.fetch(request("/preview/series/current_season.json")),
    app.fetch(request("/romaji/preview/series/current_season.json")),
  ]);
  assert.equal((await english.json()).metas[0].name, "Title 0");
  assert.equal((await romaji.json()).metas[0].name, "Romaji 0");
  assert.equal(calls(), 1);
});

test("a prepared catalog preview skips AniList discovery", async () => {
  const { app, calls } = fixture({ getCache: async () => ({ metas: [{ id: "tt1234567", name: "Verified title" }] }) });
  const response = await app.fetch(request("/preview/series/current_season.json"));
  assert.equal((await response.json()).artworkSource, "catalog");
  assert.equal(calls(), 0);
});

test("preview errors remain retryable and do not poison the cache", async () => {
  let fail = true;
  const { app } = fixture({ fetchAnime: async () => { if (fail) throw new Error("upstream unavailable"); return []; } });
  const failed = await app.fetch(request("/preview/series/current_season.json"));
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("retry-after"), "5");
  fail = false;
  const recovered = await app.fetch(request("/preview/series/current_season.json"));
  assert.equal(recovered.status, 200);
  assert.deepEqual((await recovered.json()).metas, []);
});

test("previews validate methods, catalog types and retired IDs before upstream work", async () => {
  const { app, calls } = fixture();
  assert.equal((await app.fetch(new Request("http://localhost/preview/series/current_season.json", { method: "POST" }))).status, 405);
  assert.equal((await app.fetch(request("/preview/movie/current_season.json"))).status, 404);
  assert.equal((await app.fetch(request("/preview/series/airing_today.json"))).status, 404);
  assert.equal(calls(), 0);
});

test("rolling previews fetch one schedule page and filter ineligible or out-of-window entries", async () => {
  let calls = 0;
  const date = new Date("2026-11-14T12:00:00Z");
  const { app } = fixture({
    fetchSchedule: async () => {
      calls++;
      const media = { id: 1, isAdult: false, format: "TV", title: { english: "Airing title" } };
      return [
        { airingAt: date.getTime() / 1000 + 3600, media },
        { airingAt: date.getTime() / 1000 + 3600, media },
        { airingAt: date.getTime() / 1000 - 3600, media: { ...media, id: 2 } },
        { airingAt: date.getTime() / 1000 + 3600, media: { ...media, id: 3, isAdult: true } },
      ];
    },
  });
  const data = await (await app.fetch(request("/preview/series/upcoming_3_days.json"))).json();
  assert.equal(calls, 1);
  assert.equal(data.metas.length, 1);
});
