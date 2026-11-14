import test from "node:test";
import assert from "node:assert/strict";
import * as zlib from "node:zlib";
import { resolveAniListMappingsByAniBridge, clearAniBridgeCache } from "../lib/anibridge-mapping.js";

const rows = [{ id: 1, format: "TV", title: { english: "Example" } }];
const payload = { "anilist:1": { "imdb_show:tt1234567:s1": {} } };

test("compressed mapping data produces exactly the same records as JSON", { skip: typeof zlib.zstdCompressSync !== "function" }, async () => {
  try {
    clearAniBridgeCache();
    const original = await resolveAniListMappingsByAniBridge(rows, { fetchImpl: async () => Response.json(payload) });
    clearAniBridgeCache();
    const urls = [];
    const compressed = await resolveAniListMappingsByAniBridge(rows, {
      preferCompressed: true,
      fetchImpl: async url => { urls.push(url); return new Response(zlib.zstdCompressSync(Buffer.from(JSON.stringify(payload)))); },
    });
    assert.deepEqual(compressed, original);
    assert.equal(compressed.get(1)[0].imdbIds[0], "tt1234567");
    assert.equal(urls.length, 1);
    assert.ok(urls[0].endsWith("mappings.json.zst"));
  } finally { clearAniBridgeCache(); }
});

test("an unavailable compressed asset falls back to the original complete JSON", async () => {
  const urls = [];
  try {
    clearAniBridgeCache();
    const result = await resolveAniListMappingsByAniBridge(rows, {
      preferCompressed: true,
      fetchImpl: async url => { urls.push(url); return url.endsWith(".zst") ? new Response("Unavailable", { status: 503 }) : Response.json(payload); },
    });
    assert.ok(result instanceof Map);
    assert.ok(urls.at(-1).endsWith("mappings.min.json"));
  } finally { clearAniBridgeCache(); }
});
