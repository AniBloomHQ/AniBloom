// Stateless client-side artwork URL projection. Never proxy or request provider images
// from AniBloom; provider choice must not consume Vercel/AniList request budgets.
const BETTERPOSTERS_BASE = "https://btttr.cc/poster/imdb/poster-default/";
const IMDB_ID = /^tt[0-9]{7,12}$/;

export function normalizePosterPreference(value) {
  const normalized = typeof value === "string" ? value.trim().toLocaleLowerCase("en") : "";
  if (normalized === "betterposters" || normalized === "postersplus") return normalized;
  return "anilist";
}

function normalizePublicPostersPlusBase(value) {
  if (typeof value !== "string" || !value || value.length > 240) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || url.pathname !== "/" || url.port || !url.hostname.includes(".")
      || ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname.toLowerCase())
      || url.hostname.toLowerCase().endsWith(".local") || url.hostname.toLowerCase().endsWith(".internal")) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Poster provider URLs are direct client-side image requests. If a service returns
 * 404/broken image after selection, Nuvio must handle it; AniBloom can only
 * safely fall back to AniList when the provider/identity is unavailable locally.
 */
export function projectCatalogPosters(
  metas,
  preference = "anilist",
  { postersPlusBaseUrl = process.env.POSTERSPLUS_PUBLIC_BASE_URL } = {},
) {
  const provider = normalizePosterPreference(preference);
  if (provider === "anilist" || !Array.isArray(metas)) return metas;
  const base = provider === "postersplus" ? normalizePublicPostersPlusBase(postersPlusBaseUrl) : null;
  if (provider === "postersplus" && !base) return metas;
  return metas.map(meta => {
    let nextPoster = null;
    if (provider === "betterposters" && typeof meta?.id === "string" && IMDB_ID.test(meta.id)) {
      nextPoster = BETTERPOSTERS_BASE + meta.id + ".jpg";
    } else if (provider === "postersplus") {
      const anilistId = meta?.extra?.anilistId;
      const id = Number(anilistId);
      if (Number.isSafeInteger(id) && id > 0 && String(anilistId).trim() === String(id)
        && (meta.type === "series" || meta.type === "movie")) {
        nextPoster = base + "/poster?anilist_id=" + id + "&type=" + meta.type;
      }
    }
    if (!nextPoster || nextPoster === meta.poster) return meta;
    return { ...meta, poster: nextPoster };
  });
}
