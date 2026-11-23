import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import manifest from "../api/resolver-manifest.js";
import catalog from "../api/catalog-source.js";
import { configureCatalogPipeline } from "../api/catalog-source.js";
import preview from "../api/catalog-preview.js";
import { configureLocalCatalogCache } from "../lib/catalog-runtime-cache.js";
import { createLocalCatalogCache } from "../lib/local-catalog-cache.js";
import { ADDON_VERSION } from "../api/version.js";
import { BASE_URL } from "../api/config.js";
import { createAddonProfileHandler, matchProfileRoute } from "../api/addon-profile.js";
import { createHostedProfileStore, createLocalProfileStore } from "../lib/addon-profile-store.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 3000);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function responseAdapter(nodeResponse) {
  return {
    status(code) {
      nodeResponse.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      nodeResponse.setHeader(name, value);
    },
    send(body) {
      nodeResponse.end(body);
    },
    json(body) {
      nodeResponse.setHeader("Content-Type", "application/json; charset=utf-8");
      nodeResponse.end(JSON.stringify(body));
    },
  };
}

async function serveAsset(pathname, response) {
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice("/assets/".length));
  } catch {
    return false;
  }
  const assetsRoot = resolve(root, "assets");
  const filePath = resolve(assetsRoot, relative);
  if (filePath !== assetsRoot && !filePath.startsWith(assetsRoot + sep)) return false;
  try {
    const body = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader("Content-Type", mimeTypes[extname(filePath)] || "application/octet-stream");
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

async function servePrivacyPage(response) {
  try {
    const body = await readFile(resolve(root, "privacy.html"));
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

export function createPreviewServer({
  profileOrigin = process.env.ANIBLOOM_PUBLIC_ORIGIN ? BASE_URL : `http://localhost:${port}`,
  profileStore = createLocalProfileStore(resolve(root, process.env.ANIBLOOM_LOCAL_PROFILE_DIR || ".cache/addon-profiles")),
} = {}) {
  const profileHandler = createAddonProfileHandler({ store: profileStore, origin: profileOrigin });
  return createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/assets/") && await serveAsset(url.pathname, response)) return;
  if (url.pathname === "/privacy.html" && await servePrivacyPage(response)) return;

  const req = { method: request.method, url: url.toString(), query: Object.fromEntries(url.searchParams) };
  const res = responseAdapter(response);
  try {
    if (matchProfileRoute(url)) {
      const method = request.method || "GET";
      const body = method === "POST" ? { body: request, duplex: "half" } : {};
      const headers = new Headers(request.headers);
      headers.set("x-forwarded-for", request.socket.remoteAddress || "");
      const result = await profileHandler(new Request(url, { method, headers, ...body }));
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text());
      return;
    }
    if (url.pathname === "/") {
      const { default: home } = await import(`../api/home-selector.js?preview=${Date.now()}`);
      return home(req, res);
    }
    if (/^\/(?:(?:romaji|native)\/)?(?:extended\/)?(?:ranked\/)?(?:(?:betterposters|postersplus)\/)?manifest\.json$/.test(url.pathname)) return manifest(req, res);
    if (url.pathname === "/version") return res.json({ version: ADDON_VERSION });
    if (url.pathname === "/api/catalog-preview" || /^\/(?:(?:romaji|native)\/)?preview\//.test(url.pathname)) {
      const result = await preview.fetch(new Request(url, { method: request.method, headers: request.headers }));
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text());
      return;
    }
    if (/^\/(?:(?:romaji|native)\/)?(?:extended\/)?(?:ranked\/)?(?:(?:betterposters|postersplus)\/)?catalog\//.test(url.pathname)) {
      const webResponse = await catalog.fetch(new Request(url, {
        method: request.method,
        headers: request.headers,
      }));
      response.statusCode = webResponse.status;
      for (const [header, value] of webResponse.headers) response.setHeader(header, value);
      response.end(await webResponse.text());
      return;
    }
    response.statusCode = 404;
    response.end("Not found");
  } catch (error) {
    console.error("[dev-server] request failed", error);
    response.statusCode = 500;
    response.end("Internal server error");
  }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const pilotUrl = process.env.ANIBLOOM_PROFILE_PILOT_REDIS_REST_URL;
  const pilotToken = process.env.ANIBLOOM_PROFILE_PILOT_REDIS_REST_TOKEN;
  const redisPilot = Boolean(pilotUrl || pilotToken);
  if (redisPilot && (!pilotUrl || !pilotToken)) {
    throw new Error("The Redis pilot requires both ANIBLOOM_PROFILE_PILOT_REDIS_REST_URL and ANIBLOOM_PROFILE_PILOT_REDIS_REST_TOKEN.");
  }
  const cacheFile = process.env.ANIBLOOM_LOCAL_CACHE_FILE
    ? resolve(root, process.env.ANIBLOOM_LOCAL_CACHE_FILE)
    : resolve(root, ".cache", "catalog-cache.json");
  const cache = await createLocalCatalogCache({ file: cacheFile });
  configureLocalCatalogCache(cache);
  configureCatalogPipeline({ optimized: true });
  const profileStore = redisPilot
    ? createHostedProfileStore({ url: pilotUrl, token: pilotToken }, { environment: "pilot" })
    : undefined;
  const server = createPreviewServer({ profileStore });
  server.listen(port, redisPilot ? "127.0.0.1" : "0.0.0.0", () => {
    console.log(`AniBloom preview server listening on http://localhost:${port}`);
  });
  const stop = async () => {
    await cache.flush().catch(() => {});
    server.close(() => process.exit(0));
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
