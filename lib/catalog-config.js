const TIME_ZONE = "Asia/Manila";

export const ANILIST_CATALOG_GENRES = Object.freeze([
  "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror",
  "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance",
  "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller",
]);

export const NUVIO_PAGE_SIZE = 50;
export const ANILIST_PAGE_SIZE = 50;
// Bound upstream schedule fan-out per catalog request; shared Runtime Cache reuses fetched pages.
export const MAX_SCHEDULE_PAGES = 8;
export const FETCH_TIMEOUT_MS = 8000;
export const ROLLING_PREVIOUS_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const ROLLING_UPCOMING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const ROLLING_WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function parseCatalogExtraPath(value) {
  const result = {};
  const parts = String(value || "").split("&");
  for (let index = 0; index < parts.length; index++) {
    const pair = parts[index];
    if (!pair) continue;
    const separator = pair.indexOf("=");
    const rawKey = separator >= 0 ? pair.slice(0, separator) : pair;
    let rawValue = separator >= 0 ? pair.slice(separator + 1) : "";
    if (!rawKey) continue;
    if (index === parts.length - 1) rawValue = rawValue.replace(/\.json$/i, "");
    try {
      result[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
    } catch {
      result[rawKey] = rawValue;
    }
  }
  return result;
}

export function catalogDefinitions(info, titlePreference = "english", { includeExtended = false } = {}) {
  const current = `${prettySeason(info.ongoing.season)} ${info.ongoing.year}`;
  const previous = `${prettySeason(info.previous.season)} ${info.previous.year}`;
  const upcoming = `${prettySeason(info.upcoming.season)} ${info.upcoming.year}`;
  const extra = [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }];
  const seasonalExtra = [...extra, { name: "genre", isRequired: false, options: [...ANILIST_CATALOG_GENRES] }];
  const catalogs = [
    { type: "series", id: "upcoming_season", name: `Upcoming Season — ${upcoming}`, extra: seasonalExtra, pageSize: NUVIO_PAGE_SIZE },
    { type: "series", id: "current_season", name: `Current Season — ${current}`, extra: seasonalExtra, pageSize: NUVIO_PAGE_SIZE },
    { type: "series", id: "previous_season", name: `Previous Season — ${previous}`, extra: seasonalExtra, pageSize: NUVIO_PAGE_SIZE },
    { type: "movie", id: "upcoming_season_movies", name: `Upcoming Season Movies — ${upcoming}`, extra: seasonalExtra, pageSize: NUVIO_PAGE_SIZE },
    { type: "movie", id: "current_season_movies", name: `Current Season Movies — ${current}`, extra: seasonalExtra, pageSize: NUVIO_PAGE_SIZE },
    { type: "movie", id: "previous_season_movies", name: `Previous Season Movies — ${previous}`, extra: seasonalExtra, pageSize: NUVIO_PAGE_SIZE },
    { type: "series", id: "upcoming_3_days", name: "Upcoming — 3 days", extra, pageSize: NUVIO_PAGE_SIZE },
    { type: "series", id: "previous_3_days", name: "Previous — 3 days", extra, pageSize: NUVIO_PAGE_SIZE },
  ];
  if (includeExtended) {
    catalogs.push(
      { type: "series", id: "airing_today", name: "Airing Today", extra, pageSize: NUVIO_PAGE_SIZE },
      { type: "series", id: "upcoming_7_days", name: "Upcoming — 7 days", extra, pageSize: NUVIO_PAGE_SIZE },
    );
  }
  if (titlePreference !== "native") return catalogs;
  const seasonJa = (season) => `${season.year}年${{ WINTER: "冬", SPRING: "春", SUMMER: "夏", FALL: "秋" }[season.season] || season.season}`;
  const names = {
    upcoming_season: `来期のアニメ — ${seasonJa(info.upcoming)}`,
    current_season: `今期のアニメ — ${seasonJa(info.ongoing)}`,
    previous_season: `前期のアニメ — ${seasonJa(info.previous)}`,
    upcoming_season_movies: `来期のアニメ映画 — ${seasonJa(info.upcoming)}`,
    current_season_movies: `今期のアニメ映画 — ${seasonJa(info.ongoing)}`,
    previous_season_movies: `前期のアニメ映画 — ${seasonJa(info.previous)}`,
    upcoming_3_days: "今後3日間の放送予定",
    previous_3_days: "過去3日間の放送",
    airing_today: "本日これから放送",
    upcoming_7_days: "今後7日間の放送予定",
  };
  return catalogs.map((catalog) => ({ ...catalog, name: names[catalog.id] }));
}

export function buildCatalogMediaVariables(filter, page, search = "") {
  const normalizedSearch = String(search || "").trim();
  return {
    page: page || 1, season: filter.season?.season, seasonYear: filter.season?.year, sort: filter.sort,
    formats: Array.isArray(filter.formats) && filter.formats.length ? filter.formats : ["TV", "TV_SHORT", "ONA", "OVA", "SPECIAL", "MOVIE"],
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
    ...(filter.genre ? { genres: [filter.genre] } : {}),
  };
}

export function getSeasonInfo(date) {
  const { month, year } = getManilaDateParts(date);
  if (month <= 3) return { previous: { season: "FALL", year: year - 1 }, ongoing: { season: "WINTER", year }, upcoming: { season: "SPRING", year } };
  if (month <= 6) return { previous: { season: "WINTER", year }, ongoing: { season: "SPRING", year }, upcoming: { season: "SUMMER", year } };
  if (month <= 9) return { previous: { season: "SPRING", year }, ongoing: { season: "SUMMER", year }, upcoming: { season: "FALL", year } };
  return { previous: { season: "SUMMER", year }, ongoing: { season: "FALL", year }, upcoming: { season: "WINTER", year: year + 1 } };
}

// Only upcoming episodes are included today; the cutoff is the next Manila midnight.
export function getAiringTodayRangeManila(date) {
  const now = new Date(date).getTime();
  const { year, month, day } = getManilaDateParts(date);
  // Asia/Manila is UTC+08:00 and does not observe daylight saving time.
  const nextMidnight = Date.UTC(year, month - 1, day + 1) - 8 * 60 * 60 * 1000;
  return { start: now, end: nextMidnight };
}

export function getNext7DaysRangeManila(date) {
  const now = new Date(date).getTime();
  return { start: now, end: now + ROLLING_WEEK_WINDOW_MS };
}

export function getPrevious3DaysRangeManila(date) {
  const now = new Date(date).getTime();
  return { start: now - ROLLING_PREVIOUS_WINDOW_MS, end: now };
}

export function getNext3DaysRangeManila(date) {
  const now = new Date(date).getTime();
  return { start: now, end: now + ROLLING_UPCOMING_WINDOW_MS };
}

function getManilaDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" });
  const result = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") result[part.type] = Number(part.value);
  }
  return result;
}

function prettySeason(season) {
  return season.charAt(0) + season.slice(1).toLowerCase();
}
