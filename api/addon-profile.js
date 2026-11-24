import { randomUUID } from "node:crypto";
import { fetchCatalog } from "./catalog-source.js";
import catalogPreview from "./catalog-preview.js";
import { BASE_URL } from "./config.js";
import { buildManifest } from "./resolver-manifest.js";
import { catalogDefinitions, getSeasonInfo, parseCatalogExtraPath } from "../lib/catalog-config.js";
import { getCatalogClientIdentifier } from "../lib/catalog-request-guard.js";
import { normalizeTitlePreference, TITLE_PREFERENCES } from "../lib/title-preference.js";
import {
  checkProfilePassword, createProfileCredentials, isSignedIn, makeProfileCookie, validNewPassword,
} from "../lib/addon-profile-auth.js";
import { renderProfilePage } from "../lib/addon-profile-page.js";
import { createHostedProfileStore, normalizeProfileId } from "../lib/addon-profile-store.js";

const MAX_FORM_BYTES = 4096;
const PRIVATE_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" };
const ADDON_HEADERS = {
  ...PRIVATE_HEADERS,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function matchProfileRoute(url, { allowInternal = false } = {}) {
  if (/^\/(?:(?:romaji|native|extended|ranked|betterposters|postersplus)\/)*configure\/?$/.test(url.pathname)) {
    return { mode: "setup" };
  }
  if (/^\/login\/?$/.test(url.pathname)) return { mode: "login" };
  const parts = /^\/([^/]+)\/(configure\/?|manifest\.json|catalog\/(series|movie|anime)\/([a-z0-9_]+)(?:\.json|\/([^/]+)))$/.exec(url.pathname);
  const id = normalizeProfileId(parts?.[1]);
  if (id) {
    if (parts[3]) return { mode: "catalog", id, type: parts[3], catalogId: parts[4], extra: parts[5] };
    return { mode: parts[2] === "manifest.json" ? "manifest" : "configure", id };
  }
  if (!allowInternal || url.pathname !== "/api/addon-profile") return null;
  const mode = url.searchParams.get("mode");
  const profileId = normalizeProfileId(url.searchParams.get("profileId"));
  if (mode === "setup" || mode === "login") return { mode };
  if (!profileId || !["configure", "manifest", "catalog"].includes(mode)) return null;
  if (mode !== "catalog") return { mode, id: profileId };
  const type = url.searchParams.get("type");
  const catalogId = url.searchParams.get("catalogId") || "";
  if (!["series", "movie", "anime"].includes(type) || !/^[a-z0-9_]+$/.test(catalogId)) return null;
  return { mode, id: profileId, type, catalogId, extra: url.searchParams.get("extra") };
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...ADDON_HEADERS, ...headers } });
}

function redirect(path, cookie) {
  return new Response(null, {
    status: 303,
    headers: { ...PRIVATE_HEADERS, Location: path, ...(cookie ? { "Set-Cookie": cookie } : {}) },
  });
}

async function readForm(request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded"
    || Number(request.headers.get("content-length")) > MAX_FORM_BYTES || !request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FORM_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function readSettings(form, defaults) {
  const preferredStyle = form.get("titleStyle");
  const selectedIds = form.getAll("catalog");
  const catalogIds = [...new Set(selectedIds)].filter(id => defaults.catalogIds.includes(id));
  const settings = { titleStyle: normalizeTitlePreference(preferredStyle), catalogIds };
  if (!TITLE_PREFERENCES.includes(preferredStyle)) return { settings, errorStep: 1 };
  if (!catalogIds.length || catalogIds.length !== selectedIds.length) return { settings, errorStep: 2 };
  return { settings, errorStep: null };
}

function profileCatalog(request, route, profile, origin, serveCatalog) {
  if (!profile.catalogIds.includes(route.catalogId)) return json({ metas: [] }, 404);
  const sourceUrl = new URL(request.url);
  const extras = parseCatalogExtraPath(route.extra);
  const catalogUrl = new URL(`/catalog/${route.type}/${route.catalogId}.json`, origin);
  for (const key of ["skip", "search", "genre"]) {
    const value = sourceUrl.searchParams.get(key) ?? extras[key];
    if (typeof value === "string") catalogUrl.searchParams.set(key, value);
  }
  return serveCatalog(new Request(catalogUrl, { headers: request.headers, signal: request.signal }),
    { titlePreference: normalizeTitlePreference(profile.titleStyle) }).then(response => {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(PRIVATE_HEADERS)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  });
}

export function createAddonProfileHandler({
  store, origin = BASE_URL, serveCatalog = fetchCatalog, servePreview = catalogPreview.fetch,
} = {}) {
  const secure = origin.startsWith("https://");
  return async function handleProfile(request) {
    const url = new URL(request.url);
    const route = matchProfileRoute(url, { allowInternal: true });
    if (!route) return json({ error: "Not found" }, 404);
    const { mode, id } = route;
    const standaloneLogin = mode === "login";
    const addonRequest = mode === "manifest" || mode === "catalog";
    const previewRequest = (mode === "setup" || mode === "configure")
      && request.method === "GET" && url.searchParams.has("preview");
    const previewError = (error, status) => Response.json({ error }, { status, headers: PRIVATE_HEADERS });
    if (addonRequest && request.method === "OPTIONS") return new Response(null, { status: 204, headers: ADDON_HEADERS });
    const allow = addonRequest ? "GET, OPTIONS" : "GET, POST";
    if (request.method !== "GET" && !(request.method === "POST" && !addonRequest)) {
      return json({ error: "Method not allowed" }, 405, { Allow: allow });
    }
    const now = getSeasonInfo(new Date());
    const definitions = catalogDefinitions(now);
    const defaults = { titleStyle: "english", catalogIds: definitions.map(catalog => catalog.id) };
    const page = (pageMode, { settings = defaults, message, status = 200, retryAfter, loginId, step } = {}) => new Response(
      renderProfilePage({ mode: pageMode, seasonInfo: now, definitions, settings, id, origin, loginId, message, error: status >= 400, step }),
      { status, headers: {
        ...PRIVATE_HEADERS,
        // Browsers suppress the Origin header on form posts from no-referrer pages.
        "Referrer-Policy": "same-origin",
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
          + ((pageMode === "create" || pageMode === "edit") ? "; img-src 'self' https:" : ""),
        "X-Content-Type-Options": "nosniff",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      } },
    );
    try {
      if (previewRequest) {
        let savedStyle = defaults.titleStyle;
        if (mode === "configure") {
          if (!store) throw new Error("Profile storage unavailable");
          const profile = await store.get(id);
          if (!profile || !isSignedIn(request, id, profile.sessionKey)) return previewError("Sign in to preview catalogs.", 401);
          savedStyle = normalizeTitlePreference(profile.titleStyle);
        }
        const definition = definitions.find(catalog => catalog.id === url.searchParams.get("preview"));
        if (!definition) return previewError("Unknown catalog", 404);
        const titlePreference = url.searchParams.get("titleStyle") ?? savedStyle;
        if (!TITLE_PREFERENCES.includes(titlePreference)) return previewError("Unknown title style", 400);
        const target = new URL("/api/catalog-preview", origin);
        target.search = new URLSearchParams({ id: definition.id, type: definition.type });
        const response = await servePreview(new Request(target, { headers: request.headers, signal: request.signal }), { titlePreference });
        const headers = new Headers(PRIVATE_HEADERS);
        headers.set("Content-Type", "application/json; charset=utf-8");
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) headers.set("Retry-After", retryAfter);
        return new Response(response.body, { status: response.status, headers });
      }
      if (mode === "setup" && request.method === "GET") {
        if (!url.searchParams.has("profile")) return page("create");
        const lookupId = normalizeProfileId(url.searchParams.get("profile")?.trim());
        return lookupId ? redirect(`/${lookupId}/configure`)
          : page("create", { status: 400, message: "Enter a valid profile UUID." });
      }
      if (standaloneLogin && request.method === "GET") return page("login");
      if (!store) throw new Error("Profile storage unavailable");
      if (request.method === "POST") {
        if (request.headers.get("origin") !== origin) return new Response("Forbidden", { status: 403, headers: PRIVATE_HEADERS });
        const form = await readForm(request);
        if (!form) return page(mode === "setup" ? "create" : "login", { status: 400, message: "Invalid form submission." });
        const action = form.get("action");
        if (!((mode === "setup" && action === "create") || (standaloneLogin && action === "login")
          || (id && ["login", "save", "logout"].includes(action)))) {
          return new Response("Invalid action", { status: 400, headers: PRIVATE_HEADERS });
        }
        if (action === "logout") return redirect(`/${id}/configure`, makeProfileCookie(id, null, secure));
        const submitted = action === "login" ? null : readSettings(form, defaults);
        const client = getCatalogClientIdentifier(request);
        const retryAfter = await store.attempt(`${action === "create" ? "create" : "edit"}:${client}`, action === "create" ? 5 : 20);
        if (retryAfter > 0) return page(mode === "setup" ? "create" : "login",
          { status: 429, retryAfter, settings: submitted?.settings, step: submitted?.errorStep ?? 3, message: "Too many attempts. Try again later." });
        const password = form.get("password");
        if (action === "create") {
          const { settings, errorStep } = submitted;
          if (errorStep) return page("create", { settings, step: errorStep, status: 400, message: "Choose a title language and at least one catalog." });
          if (!validNewPassword(password) || password !== form.get("confirmation")) {
            return page("create", { status: 400, settings, step: 3, message: "Use matching passwords with at least 12 characters and at most 256 bytes." });
          }
          const newId = randomUUID();
          const credentials = await createProfileCredentials(password);
          if (!(await store.put(newId, { ...settings, ...credentials }, { create: true }))) throw new Error("Profile creation failed");
          return redirect(`/${newId}/configure?saved=1`, makeProfileCookie(newId, credentials.sessionKey, secure));
        }
        const targetId = standaloneLogin ? normalizeProfileId(form.get("profileId")?.trim()) : id;
        const profile = targetId ? await store.get(targetId) : null;
        if (!profile && !standaloneLogin) return page("unavailable", { status: 404, message: "This profile could not be found." });
        if (action === "save" && !isSignedIn(request, id, profile.sessionKey)) {
          return page("login", { status: 401, message: "Sign in before editing this profile." });
        }
        if (!profile || !(await checkProfilePassword(password, profile))) {
          return page(action === "save" ? "edit" : "login", {
            status: 401, settings: submitted?.settings, step: 3,
            loginId: standaloneLogin ? targetId : undefined,
            message: standaloneLogin ? "The profile UUID or password is incorrect." : "The profile password is incorrect.",
          });
        }
        if (action === "login") return redirect(`/${targetId}/configure`, makeProfileCookie(targetId, profile.sessionKey, secure));
        const { settings, errorStep } = submitted;
        if (errorStep) return page("edit", { settings, step: errorStep, status: 400, message: "Choose a title language and at least one catalog." });
        if (!(await store.put(id, { ...profile, ...settings }))) throw new Error("Profile update failed");
        return redirect(`/${id}/configure?saved=1`);
      }
      const profile = await store.get(id);
      if (!profile) return addonRequest ? json({ error: "Profile not found" }, 404)
        : page("unavailable", { status: 404, message: "This profile could not be found." });
      const settings = { catalogIds: profile.catalogIds, titleStyle: normalizeTitlePreference(profile.titleStyle) };
      if (mode === "manifest") return json(buildManifest(now, { ...settings, origin }));
      if (mode === "catalog") return await profileCatalog(request, route, profile, origin, serveCatalog);
      if (!isSignedIn(request, id, profile.sessionKey)) return page("login");
      const saved = url.searchParams.get("saved") === "1";
      if (saved || url.searchParams.get("install") === "1") {
        return page("install", { message: saved ? "Profile saved." : "" });
      }
      const requestedStep = url.searchParams.get("step");
      let step = 1;
      if (requestedStep === "2" || requestedStep === "3") {
        step = requestedStep === "3" && settings.catalogIds.length ? 3 : 2;
      }
      return page("edit", { settings, step });
    } catch {
      if (previewRequest) return previewError("Preview temporarily unavailable", 503);
      return addonRequest ? json({ error: "Profile temporarily unavailable" }, 503)
        : page("unavailable", { status: 503, message: "Profile storage is temporarily unavailable. Please try again later." });
    }
  };
}

const hostedHandler = createAddonProfileHandler({ store: createHostedProfileStore() });
export default { fetch: hostedHandler };
