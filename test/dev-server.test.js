import test from "node:test";
import assert from "node:assert/strict";
import { get } from "node:http";
import { createPreviewServer } from "../scripts/dev-server.js";
import { ADDON_VERSION } from "../api/version.js";

test("preview server serves version, homepage, manifest and assets", async (t) => {
  const server = createPreviewServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const versionResponse = await fetch(`${base}/version`);
  assert.equal(versionResponse.status, 200);
  assert.deepEqual(await versionResponse.json(), { version: ADDON_VERSION });

  const homeResponse = await fetch(base);
  assert.equal(homeResponse.status, 200);
  assert.match(await homeResponse.text(), /AniBloom — Anime Discovery for Nuvio/);

  const manifestResponse = await fetch(`${base}/manifest.json`);
  assert.equal(manifestResponse.status, 200);
  assert.equal((await manifestResponse.json()).version, ADDON_VERSION);

  const assetResponse = await fetch(`${base}/assets/anibloom.css`);
  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.headers.get("content-type"), /text\/css/);
});

test("preview server does not expose files outside the assets directory", async (t) => {
  const server = createPreviewServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/assets/%2e%2e%2fapi%2fversion.js`);
  assert.equal(response.status, 404);
});

test("opt-in profile stylesheet hashes only apply on the configured loopback origin", async (t) => {
  const hash = "sha256-62lPaUtpvg47KrxPOXYc0Ki8fkE6PNsbY5I9DpyEwZ4=";
  const profileOrigin = "http://localhost:3017";
  assert.throws(() => createPreviewServer({ profileStyleHashes: "unsafe-inline" }), /SHA-256/);
  const server = createPreviewServer({ profileOrigin, profileStyleHashes: hash });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const readPolicy = (path, host) => new Promise((resolve, reject) => {
    get({ hostname: "127.0.0.1", port: server.address().port, path, headers: { host } }, response => {
      response.resume();
      resolve(response.headers["content-security-policy"]);
    }).on("error", reject);
  });
  for (const route of ["/configure", "/login"]) {
    const policy = await readPolicy(route, "localhost:3017");
    assert.ok(policy.includes(`style-src 'self' '${hash}'`));
    assert.match(policy, /default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'/);
    assert.doesNotMatch(policy, /unsafe-inline/);
    assert.doesNotMatch(await readPolicy(route, "preview.example"), /style-src/);
  }
});
