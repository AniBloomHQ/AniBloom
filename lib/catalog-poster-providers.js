import { isIP } from "node:net";

// Direct client-side image URLs: no AniBloom proxy, provider API key or extra
// backend request. BetterPosters is the automatic choice for resolved IMDb ids.
const BETTERPOSTERS_ORIGIN = "https://btttr.cc";
const IMDB_ID = /^tt[0-9]{7,12}$/;
const RATINGS = Object.freeze({
  average: "", imdb: "IM", tmdb: "TM", rottenTomatoes: "RT",
  metacritic: "MC", trakt: "TR", letterboxd: "LB", rogerEbert: "RE",
});

/**
 * The defaults mirror BetterPosters' public configuration:
 * trend tags on; genre and rating shown; quality and age rating off;
 * rating source average; English. Only the Native title variant changes
 * poster language to Japanese. Other options are intentionally not user-
 * selectable in AniBloom's current installation UI.
 */
export function buildBetterPostersUrl(imdbId, {
  titlePreference = "english",
  genre = true,
  rating = true,
  qualityTags = false,
  ageRating = false,
  trendTags = true,
  ratingSource = "average",
} = {}) {
  if (typeof imdbId !== "string" || !IMDB_ID.test(imdbId)) return null;
  const suffix = (genre ? (rating ? "" : "g") : (rating ? "r" : "n"))
    + (qualityTags ? "q" : "") + (ageRating ? "a" : "");
  const path = suffix ? "poster-" + suffix : "poster";
  const params = new URLSearchParams();
  if (!trendTags) params.set("tag", "none");
  if (titlePreference === "native") params.set("lang", "ja");
  if (rating && Object.hasOwn(RATINGS, ratingSource) && RATINGS[ratingSource]) {
    params.set("rs", RATINGS[ratingSource]);
  }
  const q = params.toString();
  return BETTERPOSTERS_ORIGIN + "/" + path + "/imdb/poster-default/" + imdbId + ".jpg"
    + (q ? "?" + q : "");
}

export function normalizePosterPreference(value) {
  const normalized = typeof value === "string" ? value.trim().toLocaleLowerCase("en") : "";
  // Only explicitly requested legacy variants override the new default.
  if (normalized === "anilist" || normalized === "postersplus") return normalized;
  return "betterposters";
}

function normalizePublicPostersPlusBase(value) {
  if (typeof value !== "string" || !value || value.length > 240) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || url.pathname !== "/" || url.port || !url.hostname.includes(".") || isIP(url.hostname) !== 0
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
 * Projection is applied after canonical title/identity resolution and cache
 * lookups. Original covers remain when IDs are missing or incompatible.
 * If a returned third-party image later fails, only the client can recover.
 */
export function projectCatalogPosters(
  metas,
  preference = "betterposters",
  { postersPlusBaseUrl = process.env.POSTERSPLUS_PUBLIC_BASE_URL,
    titlePreference = "english", betterPostersOptions = {} } = {},
) {
  const provider = normalizePosterPreference(preference);
  if (provider === "anilist" || !Array.isArray(metas)) return metas;
  const base = provider === "postersplus" ? normalizePublicPostersPlusBase(postersPlusBaseUrl) : null;
  if (provider === "postersplus" && !base) return metas;
  return metas.map(meta => {
    let nextPoster = null;
    if (provider === "betterposters") {
      nextPoster = buildBetterPostersUrl(meta?.id, { ...betterPostersOptions, titlePreference });
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
