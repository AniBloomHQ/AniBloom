import { createServer } from "node:http";
import { Worker } from "node:worker_threads";
import { getSeasonInfo } from "../api/catalog-source.js";
import { catalogResponseCacheKey } from "../lib/catalog-runtime-cache.js";

// Isolated fake HTTP/Redis/AniList/provider service. All outbound calls from
// catalog workers are intercepted and rewritten to this local mock server.
export async function runCatalogFanoutScenario({ stale = false, warm = false, lockUnavailable = false, cacheWriteFailure = false } = {}) {
  const cache = new Map();
  const locks = new Map();
  let catalogReads = 0;
  let catalogWrites = 0;
  let anilistCalls = 0;
  let armCalls = 0;
  const providerTargets = [];
  const pendingCatalogReads = [];
  const writeWaiters = [];

  const sendJson = (res, body, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = async req => {
    let body = "";
    for await (const chunk of req) body += chunk;
    return body ? JSON.parse(body) : {};
  };
  const signalWrites = () => {
    for (let index = writeWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = writeWaiters[index];
      if (catalogWrites >= waiter.count) {
        writeWaiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.res.writeHead(200).end("ok");
      }
    }
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/cache/get") {
      const key = url.searchParams.get("key");
      if (key?.startsWith("catalog-response:") && catalogReads < 2) {
        catalogReads += 1;
        pendingCatalogReads.push({ key, res });
        if (catalogReads === 2) {
          for (const item of pendingCatalogReads.splice(0)) {
            sendJson(item.res, { value: stale ? cache.get(item.key) : null });
          }
        }
        return;
      }
      sendJson(res, { value: cache.get(key) ?? null });
      return;
    }
    if (url.pathname === "/cache/set" && req.method === "POST") {
      const { key, value, cacheWriteFailure: failWrite } = await readBody(req);
      if (failWrite && key.startsWith("catalog-response:")) {
        sendJson(res, { error: "mocked cache write failure" }, 503);
        return;
      }
      cache.set(key, value);
      if (key.startsWith("catalog-response:")) {
        catalogWrites += 1;
        signalWrites();
      }
      sendJson(res, { ok: true });
      return;
    }
    if (url.pathname === "/lock/set" && req.method === "POST") {
      const { key, token, leaseMs, lockUnavailable: failLock } = await readBody(req);
      if (failLock) {
        sendJson(res, { error: "mocked lock service unavailable" }, 503);
        return;
      }
      const current = locks.get(key);
      if (current && current.expiresAt > Date.now()) {
        sendJson(res, { result: null });
        return;
      }
      locks.set(key, { token, expiresAt: Date.now() + leaseMs });
      sendJson(res, { result: "OK" });
      return;
    }
    if (url.pathname === "/lock/renew" && req.method === "POST") {
      const { key, token, leaseMs } = await readBody(req);
      const current = locks.get(key);
      const renewed = current?.token === token;
      if (renewed) current.expiresAt = Date.now() + leaseMs;
      sendJson(res, { result: renewed ? 1 : 0 });
      return;
    }
    if (url.pathname === "/lock/release" && req.method === "POST") {
      const { key, token } = await readBody(req);
      const current = locks.get(key);
      const released = current?.token === token;
      if (released) locks.delete(key);
      sendJson(res, { result: released ? 1 : 0 });
      return;
    }
    if (url.pathname === "/upstream/anilist" && req.method === "POST") {
      anilistCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 100));
      sendJson(res, {
        data: {
          Page: {
            media: [{
              id: 123,
              idMal: 456,
              title: { romaji: "Catalog Fanout Movie", english: "Catalog Fanout Movie", native: null },
              synonyms: [],
              coverImage: { large: null },
              status: "FINISHED",
              format: "MOVIE",
              isAdult: false,
              countryOfOrigin: "JP",
              startDate: { year: 2026, month: 1, day: 1 },
              endDate: { year: 2026 },
              genres: ["Animation"],
              relations: { edges: [] },
            }],
          },
        },
      });
      return;
    }
    if (url.pathname === "/upstream/arm" && req.method === "POST") {
      armCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 100));
      sendJson(res, [{ anilist: 123, media: "MOVIE", imdb: "tt1234567", myanimelist: 456, title: "Catalog Fanout Movie", year: 2026 }]);
      return;
    }
    if (url.pathname === "/upstream/provider" && req.method === "POST") {
      const { url: target, method } = await readBody(req);
      providerTargets.push({ url: target, method });
      sendJson(res, { error: "mocked provider response unavailable" }, 404);
      return;
    }
    if (url.pathname === "/wait-for-catalog-writes") {
      const count = Number(url.searchParams.get("count")) || 1;
      if (catalogWrites >= count) {
        res.writeHead(200).end("ok");
        return;
      }
      const timer = setTimeout(() => {
        const index = writeWaiters.findIndex(item => item.res === res);
        if (index >= 0) writeWaiters.splice(index, 1);
        res.writeHead(504).end("timeout");
      }, 8_000);
      writeWaiters.push({ count, res, timer });
      return;
    }
    res.writeHead(404).end();
  });

  const seasonInfo = getSeasonInfo(new Date());
  const catalogKey = catalogResponseCacheKey({
    id: "current_season_movies",
    seasonInfo,
    skip: 0,
    search: "",
  });
  if (stale || warm) {
    cache.set(catalogKey, {
      metas: [{ id: "mal:456", type: "movie" }],
      cachedAt: Date.now() - 3_600_000,
      freshUntil: warm ? Date.now() + 60_000 : Date.now() - 1,
    });
  }

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const workerUrl = new URL("./catalog-refresh-worker.mjs", import.meta.url);
  const workers = [0, 1].map(() => new Worker(workerUrl, { workerData: { baseUrl, mode: stale ? "stale" : "cold", lockUnavailable, cacheWriteFailure } }));
  const startedAt = Date.now();

  try {
    const results = await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", code => {
        if (code !== 0) reject(new Error(`worker exited with code ${code}`));
      });
    })));
    const providerCountsByHost = {};
    for (const target of providerTargets) {
      const host = new URL(target.url).hostname;
      providerCountsByHost[host] = (providerCountsByHost[host] || 0) + 1;
    }
    return {
      results,
      catalogReads,
      catalogWrites,
      anilistCalls,
      armCalls,
      providerTargets,
      providerCountsByHost,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
    await new Promise(resolve => server.close(resolve));
  }
}
