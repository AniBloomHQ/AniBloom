import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { ANILIST_CATALOG_GENRES } from "./catalog-config.js";

export const MAX_CATALOG_SKIP = 1000;
export const MAX_CATALOG_SEARCH_LENGTH = 200;

export function normalizeCatalogRequestOptions(query = {}, { allowGenre = false } = {}) {
  const rawSkip = query.skip == null || query.skip === "" ? "0" : String(query.skip).trim();
  if (!/^\d+$/.test(rawSkip)) {
    return { ok: false, error: "Invalid catalog offset", code: "INVALID_SKIP" };
  }

  const skip = Number(rawSkip);
  if (!Number.isSafeInteger(skip) || skip > MAX_CATALOG_SKIP) {
    return { ok: false, error: "Invalid catalog offset", code: "INVALID_SKIP" };
  }

  const search = String(query.search || "").trim();
  if (search.length > MAX_CATALOG_SEARCH_LENGTH) {
    return { ok: false, error: "Search query is too long", code: "SEARCH_TOO_LONG" };
  }

  if (query.genre != null && query.genre !== "") {
    if (typeof query.genre !== "string") {
      return { ok: false, error: "Invalid catalog genre", code: "INVALID_GENRE" };
    }
    const submitted = query.genre.trim().toLocaleLowerCase("en");
    if (submitted) {
      if (!allowGenre) {
        return { ok: false, error: "Genre filtering is not supported for this catalog", code: "UNSUPPORTED_GENRE" };
      }
      const genre = ANILIST_CATALOG_GENRES.find(value => value.toLocaleLowerCase("en") === submitted);
      if (!genre) return { ok: false, error: "Invalid catalog genre", code: "INVALID_GENRE" };
      return { ok: true, skip, search, genre };
    }
  }
  return { ok: true, skip, search };
}

export function isCatalogDiagnosticsEnabled(query = {}, environment = process.env.VERCEL_ENV || process.env.NODE_ENV) {
  return String(query.diagnostics || "") === "1" && environment !== "production";
}

export function getCatalogClientIdentifier(request) {
  // Vercel overwrites X-Forwarded-For with the public client IP before the
  // request reaches a function, preventing callers from spoofing this value.
  const forwarded = request?.headers?.get("x-forwarded-for") || "";
  const candidate = forwarded.split(",", 1)[0].trim();
  if (!candidate || !isIP(candidate)) return "ip:unknown";
  const digest = createHash("sha256").update(candidate).digest("hex").slice(0, 32);
  return `ip:${digest}`;
}
