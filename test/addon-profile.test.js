import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAddonProfileHandler } from "../api/addon-profile.js";
import { createCatalogPreviewHandler } from "../api/catalog-preview.js";
import { getSeasonInfo } from "../lib/catalog-config.js";
import { catalogResponseCacheKey, setCatalogRuntimeCacheForTests } from "../lib/catalog-runtime-cache.js";
import { createLocalProfileStore } from "../lib/addon-profile-store.js";

const origin = "https://anibloom.example";
const password = "test-only-passphrase";
const initial = { titleStyle: "native", catalog: ["top_season", "current_season"] };
const updated = { titleStyle: "romaji", catalog: ["current_season", "previous_season_movies"] };

function request(path, { form, cookie, from = origin, method } = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(form || {})) {
    for (const part of Array.isArray(value) ? value : [value]) body.append(key, part);
  }
  return new Request(origin + path, {
    method: method || (form ? "POST" : "GET"),
    headers: { ...(form ? { origin: from } : {}), ...(cookie ? { cookie } : {}) },
    body: form ? body : undefined,
  });
}

async function createProfile(handler, settings = initial) {
  const response = await handler(request("/configure", {
    form: { action: "create", ...settings, password, confirmation: password },
  }));
  assert.equal(response.status, 303);
  const destination = response.headers.get("location");
  const path = destination.split("?")[0];
  assert.match(path, /^\/[a-f0-9-]{36}\/configure$/);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, new RegExp("Path=" + path + ";"));
  assert.match(cookie, /HttpOnly; SameSite=Lax; Secure/);
  return { configurePath: path, manifestPath: path.replace("/configure", "/manifest.json"), cookie: cookie.split(";")[0], id: path.split("/")[1] };
}

test("saved profiles support the TV phone workflow, then Android Configure and refresh", async t => {
  const directory = await mkdtemp(join(tmpdir(), "anibloom-profile-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createLocalProfileStore(directory);
  const handler = createAddonProfileHandler({ origin, store });
  const key = catalogResponseCacheKey({ id: "current_season", seasonInfo: getSeasonInfo(new Date()), skip: 50, search: "Attack", genre: "Action" });
  const meta = {
    id: "tt1234567", name: "Attack on Titan", type: "series", poster: "https://s4.anilist.co/cover.jpg",
    extra: { anilistId: 1, titleEnglish: "Attack on Titan", titleRomaji: "Shingeki no Kyojin", titleNative: "進撃の巨人" },
  };
  const cacheReads = [];
  setCatalogRuntimeCacheForTests({ async get(keyRead) {
    cacheReads.push(keyRead);
    assert.equal(keyRead, key);
    return { metas: [meta], freshUntil: Date.now() + 60000 };
  } });
  t.after(() => setCatalogRuntimeCacheForTests(null));

  const setup = await handler(request("/configure"));
  assert.equal(setup.headers.get("referrer-policy"), "same-origin");
  assert.match(await setup.text(), /Create your AniBloom profile/);
  const legacySetup = await handler(request("/native/extended/ranked/configure"));
  assert.match(await legacySetup.text(), /Create your AniBloom profile/);
  const profile = await createProfile(handler);
  const { configurePath, manifestPath, id, cookie } = profile;
  const catalogPath = `/${id}/catalog/series/current_season/skip=50&search=Attack&genre=Action.json`;
  const storeDump = await readFile(join(directory, id + ".json"), "utf8");
  assert.doesNotMatch(storeDump, /test-only-passphrase/);
  assert.match(JSON.parse(storeDump).passwordHash, /^[0-9a-f]{64}$/);

  await t.test("TV installs the shareable URL, then refreshes it after a phone edit", async () => {
    const manifest = await handler(request(manifestPath));
    assert.equal(manifest.headers.get("cache-control"), "no-store");
    const installed = await manifest.json();
    assert.equal(installed.behaviorHints.configurable, true);
    assert.deepEqual(installed.catalogs.map(c => c.id), initial.catalog);
    assert.match(installed.catalogs[1].name, /^今期のアニメ/);
    const catalog = await handler(request(catalogPath + "?titleMode=english&artwork=anilist"));
    assert.equal(catalog.status, 200);
    assert.equal(catalog.headers.get("cache-control"), "no-store");
    const { metas } = await catalog.json();
    assert.equal(metas[0].name, "進撃の巨人");
    assert.equal(metas[0].id, meta.id);
    assert.doesNotMatch(metas[0].poster, /lang=ja/);

    const freshHandler = createAddonProfileHandler({ origin, store: createLocalProfileStore(directory) });
    const signIn = await freshHandler(request(configurePath));
    assert.match(await signIn.text(), /Sign in to edit your profile/);
    const signedIn = await freshHandler(request(configurePath, { form: { action: "login", password } }));
    assert.equal(signedIn.status, 303);
    const phoneCookie = signedIn.headers.get("set-cookie").split(";")[0];
    const edit = await freshHandler(request(configurePath, { cookie: phoneCookie }));
    assert.match(await edit.text(), /<option value="native" selected>/);
    const saved = await freshHandler(request(configurePath, { cookie: phoneCookie, form: { action: "save", ...updated, password } }));
    assert.equal(saved.headers.get("location"), configurePath + "?saved=1");
    const refresh = await freshHandler(request(manifestPath));
    const refreshed = await refresh.json();
    assert.deepEqual(refreshed.catalogs.map(c => c.id), updated.catalog);
    assert.match(refreshed.catalogs[0].name, /^Konki no Anime/);
    assert.equal((await freshHandler(request(`/${id}/catalog/series/top_season.json`))).status, 404);
  });

  await t.test("Android derives Configure from the manifest URL and sees saved titles on refresh", async () => {
    const path = manifestPath.replace(/\/manifest\.json$/, "/configure");
    const signIn = await handler(request(path));
    const body = await signIn.text();
    assert.match(body, /Sign in to edit your profile/);
    assert.ok(body.includes(manifestPath));
    const edit = await handler(request(path, { cookie }));
    assert.match(await edit.text(), /<option value="romaji" selected>/);
    const catalog = await handler(request(`/api/addon-profile?mode=catalog&profileId=${id}&type=series&catalogId=current_season&skip=50&search=Attack&genre=Action`));
    const { metas } = await catalog.json();
    assert.equal(metas[0].name, "Shingeki no Kyojin");
    assert.equal(metas[0].id, meta.id);
    assert.deepEqual(cacheReads, [key, key]);
    const reopened = await handler(request(`/configure?profile=${id}`));
    assert.equal(reopened.headers.get("location"), path);
  });

  await t.test("edits require a signed session and the correct password", async () => {
    const save = { action: "save", ...initial, password };
    assert.equal((await handler(request(configurePath, { form: save }))).status, 401);
    assert.equal((await handler(request(configurePath, { form: { ...save, password: "wrong password" }, cookie }))).status, 401);
    assert.equal((await handler(request(configurePath, { form: save, cookie, from: "https://example.test" }))).status, 403);
    assert.equal((await handler(request(configurePath, { form: { ...save, catalog: [] }, cookie }))).status, 400);
    assert.equal((await handler(request(configurePath, { form: { ...save, catalog: ["top_season", "top_season"] }, cookie }))).status, 400);
    const another = await createProfile(handler, updated);
    assert.equal((await handler(request(another.configurePath, { form: save, cookie }))).status, 401);
    assert.equal((await handler(request(manifestPath, { form: save, cookie }))).status, 405);
    const refreshed = await handler(request(manifestPath));
    assert.deepEqual((await refreshed.json()).catalogs.map(c => c.id), updated.catalog);
    const signedOut = await handler(request(configurePath, { form: { action: "logout" }, cookie }));
    assert.match(signedOut.headers.get("set-cookie"), /Max-Age=0/);
  });
});

test("setup previews work before a profile exists and use the chosen title style", async () => {
  const preview = createCatalogPreviewHandler({
    acquirePermit: async () => ({ allowed: true }),
    getCache: async () => ({ metas: [{ name: "English title", extra: { titleNative: "日本語の作品" } }] }),
  });
  const handler = createAddonProfileHandler({ origin, servePreview: preview.fetch });

  const setup = await handler(request("/configure"));
  assert.match(setup.headers.get("Content-Security-Policy"), /img-src 'self' https:/);
  const html = await setup.text();
  assert.equal((html.match(/data-preview-catalog=/g) || []).length, 9);
  assert.match(html, /data-preview-configuration="\/configure"/);

  const sample = await handler(request("/configure?preview=current_season"));
  assert.equal(sample.status, 200);
  assert.equal(sample.headers.get("Cache-Control"), "no-store");
  assert.deepEqual((await sample.json()).metas, [{ name: "English title" }]);
  const japanese = await handler(request("/api/addon-profile?mode=setup&preview=current_season_movies&titleStyle=native"));
  assert.equal(japanese.status, 200);
  assert.deepEqual((await japanese.json()).metas, [{ name: "日本語の作品" }]);
  assert.equal((await handler(request("/configure?preview=unknown"))).status, 404);
  assert.equal((await handler(request("/configure?preview=current_season&titleStyle=unknown"))).status, 400);
});

test("saved profile previews are private, allow unchecked catalogs and reflect the draft title style", async t => {
  const directory = await mkdtemp(join(tmpdir(), "anibloom-profile-preview-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createLocalProfileStore(directory);
  let cacheReads = 0;
  const preview = createCatalogPreviewHandler({
    acquirePermit: async () => ({ allowed: true }),
    getCache: async () => {
      cacheReads++;
      return { metas: [{
        name: "English title", id: "tt1234567",
        extra: { titleRomaji: "Romaji title", titleNative: "日本語の作品" },
      }] };
    },
  });
  const handler = createAddonProfileHandler({ origin, store, servePreview: preview.fetch });
  const { configurePath, id, cookie } = await createProfile(handler);
  const samplePath = configurePath + "?preview=previous_season_movies";

  const setup = await handler(request("/configure"));
  assert.match(await setup.text(), /<option value="native">Japanese<\/option>/);
  const signedOut = await handler(request(configurePath));
  assert.doesNotMatch(await signedOut.text(), /data-preview-catalog/);
  assert.equal((await handler(request(samplePath))).status, 401);
  assert.equal((await handler(request(configurePath + "?preview=bad", { cookie }))).status, 404);
  assert.equal((await handler(request(samplePath + "&titleStyle=bad", { cookie }))).status, 400);
  assert.equal(cacheReads, 0);

  const edit = await handler(request(configurePath, { cookie }));
  assert.match(edit.headers.get("Content-Security-Policy"), /img-src 'self' https:/);
  const editHtml = await edit.text();
  assert.equal((editHtml.match(/data-preview-catalog=/g) || []).length, 9);
  assert.match(editHtml, /<option value="native" selected>Japanese<\/option>/);

  const draft = await handler(request(samplePath + "&titleStyle=romaji", { cookie }));
  assert.equal(draft.status, 200);
  assert.equal(draft.headers.get("Cache-Control"), "no-store");
  assert.equal(draft.headers.get("Access-Control-Allow-Origin"), null);
  const poster = "https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg";
  assert.deepEqual((await draft.json()).metas, [{ name: "Romaji title", poster }]);
  const rewritten = await handler(request(`/api/addon-profile?mode=configure&profileId=${id}&preview=previous_season_movies`, { cookie }));
  assert.deepEqual((await rewritten.json()).metas, [{ name: "日本語の作品", poster }]);
  assert.deepEqual((await store.get(id)).catalogIds, initial.catalog);
  assert.equal((await store.get(id)).titleStyle, "native");
  assert.equal(cacheReads, 2);
});

test("profile Vercel rewrites send the UUID and catalog route parameters to the profile handler", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const routes = config.rewrites.filter(route => route.destination.startsWith("/api/addon-profile"));
  assert.deepEqual(routes.map(route => route.destination), [
    "/api/addon-profile?mode=setup",
    "/api/addon-profile?mode=setup",
    "/api/addon-profile?mode=configure&profileId=:profileId",
    "/api/addon-profile?mode=manifest&profileId=:profileId",
    "/api/addon-profile?mode=catalog&profileId=:profileId&type=:type&catalogId=:catalogId",
    "/api/addon-profile?mode=catalog&profileId=:profileId&type=:type&catalogId=:catalogId&extra=:extra*",
  ]);
  const unavailable = createAddonProfileHandler({ origin });
  assert.equal((await unavailable(request("/bad-id/manifest.json"))).status, 404);
  assert.equal((await unavailable(request("/669e4b5c-597d-4115-a8df-81f299a7f555/manifest.json"))).status, 503);
});
