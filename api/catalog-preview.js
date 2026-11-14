import { getCatalogFilter, getRollingCatalogRange, isEligibleRollingMedia } from "./catalog-source.js";
import { catalogDefinitions, getSeasonInfo } from "../lib/catalog-config.js";
import { queryAnime, queryAiringSchedulePage } from "../lib/catalog-anilist.js";
import { toMetaFromAniList } from "../lib/catalog-meta.js";
import { normalizeTitlePreference, projectCatalogMetas } from "../lib/title-preference.js";
import { projectCatalogPosters } from "../lib/catalog-poster-providers.js";
import { catalogCacheKey, catalogResponseCacheKey, getCatalogRuntimeCache, setCatalogRuntimeCache } from "../lib/catalog-runtime-cache.js";
import { acquireCatalogRequestPermit } from "../lib/catalog-request-rate-limiter.js";
import { withCatalogDeadline } from "../lib/catalog-deadline.js";

/** Display-only samples never invoke provider mapping or advertise playable IDs. */
export function createCatalogPreviewHandler({
  fetchAnime = queryAnime, fetchSchedule = queryAiringSchedulePage,
  getCache = getCatalogRuntimeCache, setCache = setCatalogRuntimeCache,
  acquirePermit = acquireCatalogRequestPermit, now = () => new Date(),
} = {}) {
  const pending = new Map();
  return {
    async fetch(request) {
      const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };
      const send = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
      if (request.method === "OPTIONS") return send({}, 200, { "Access-Control-Allow-Methods": "GET, OPTIONS" });
      if (request.method !== "GET") return send({ error: "Method not allowed" }, 405, { Allow: "GET, OPTIONS" });
      const url = new URL(request.url);
      const match = url.pathname.match(/^\/(?:(romaji|native)\/)?preview\/(series|movie)\/([a-z0-9_]+)\.json$/);
      if (!match && url.pathname !== "/api/catalog-preview") return send({ error: "Unknown preview route" }, 404);
      const id = match?.[3] || url.searchParams.get("id");
      const type = match?.[2] || url.searchParams.get("type");
      const preference = normalizeTitlePreference(match?.[1] || url.searchParams.get("titleMode"));
      const date = now();
      const info = getSeasonInfo(date);
      if (!catalogDefinitions(info).some(catalog => catalog.id === id && catalog.type === type)) return send({ error: "Unknown catalog" }, 404);
      const permit = await acquirePermit(request);
      if (!permit.allowed) return send({ error: "Too many requests" }, 429, { "Retry-After": String(Math.max(1, Math.ceil(permit.retryAfterMs / 1000))) });
      try {
        const completed = await getCache(catalogResponseCacheKey({ id, seasonInfo: info, skip: 0, search: "" }));
        let metas;
        let artworkSource = "anilist";
        if (Array.isArray(completed?.metas)) {
          metas = projectCatalogPosters(completed.metas, "", { titlePreference: preference });
          artworkSource = "catalog";
        } else {
          const key = catalogCacheKey("catalog-preview", { id, info });
          metas = await getCache(key);
          if (!Array.isArray(metas)) {
            if (!pending.has(key)) {
              const build = withCatalogDeadline(async () => {
                const filter = getCatalogFilter(id, info);
                let rows;
                if (filter) rows = await fetchAnime(filter, 1, "", { includeMalId: true });
                else {
                  const range = getRollingCatalogRange(id, date);
                  const future = id === "upcoming_3_days";
                  const schedules = await fetchSchedule(range.start, range.end, future, 1, future ? "TIME" : "TIME_DESC");
                  rows = schedules.filter(row => row.airingAt * 1000 > range.start && row.airingAt * 1000 < range.end && isEligibleRollingMedia(row.media)).map(row => row.media);
                }
                const seen = new Set();
                const sample = [];
                for (const row of rows) {
                  const anilistId = Number(row?.id);
                  if (!Number.isInteger(anilistId) || anilistId <= 0 || seen.has(anilistId)) continue;
                  seen.add(anilistId);
                  sample.push(toMetaFromAniList(anilistId, row));
                  if (sample.length === 12) break;
                }
                await setCache(key, sample, filter ? 60 : 30);
                return sample;
              }, 8_000).finally(() => pending.delete(key));
              pending.set(key, build);
            }
            metas = await pending.get(key);
          }
        }
        const sample = projectCatalogMetas(metas, preference).slice(0, 12).map(meta => ({
          name: meta.name, ...(meta.poster ? { poster: meta.poster } : {}),
          ...(meta.releaseInfo ? { releaseInfo: meta.releaseInfo } : {}),
        }));
        return send({ metas: sample, artworkSource }, 200, { "Cache-Control": "public, max-age=30, s-maxage=30" });
      } catch (error) {
        return send({ error: "Preview temporarily unavailable" }, 503, {
          "Retry-After": String(Math.max(1, Math.min(60, Number(error.retryAfterSeconds) || 5))),
        });
      }
    },
  };
}

export default createCatalogPreviewHandler();
