import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolvePublicOrigin } from "../api/config.js";

test("self-host public origin is explicit, sanitized and never trusted from Host headers", () => {
  assert.equal(resolvePublicOrigin(null), "https://anibloom.vercel.app");
  assert.equal(resolvePublicOrigin("https://anime.example.org/"), "https://anime.example.org");
  assert.equal(resolvePublicOrigin("https://anime.example.org:8443"), "https://anime.example.org:8443");
  assert.equal(resolvePublicOrigin("http://localhost:3000", { allowLocalHttp: true }), "http://localhost:3000");
  assert.equal(resolvePublicOrigin("http://192.168.1.12:8080", { allowLocalHttp: true }), "http://192.168.1.12:8080");
  for (const unsafe of [
    "http://anime.example.org", "https://admin:token@anime.example.org",
    "https://anime.example.org/path", "https://anime.example.org/?token=secret",
    "https://anime.example.org/#frag", "javascript:alert(1)", "//evil.example.com",
    "https://anime.example.org.evil.test/path", "not a url",
  ]) {
    assert.throws(() => resolvePublicOrigin(unsafe), /ANIBLOOM_PUBLIC_ORIGIN/);
  }
  assert.throws(() => resolvePublicOrigin("http://anime.example.org", { allowLocalHttp: true }), /ANIBLOOM_PUBLIC_ORIGIN/);
});

test("configured self-host domain controls the manifest logo, homepage catalog links and language install links", () => {
  const code = `
    import { BASE_URL } from "./api/config.js";
    import { buildManifest } from "./api/resolver-manifest.js";
    import { getSeasonInfo } from "./lib/catalog-config.js";
    import homepage from "./api/home-selector.js";
    let html = "";
    homepage({}, {status(){return this}, setHeader(){}, send(value){html=value}});
    const manifest = buildManifest(getSeasonInfo(new Date("2026-11-09T12:00:00Z")));
    console.log(JSON.stringify({base:BASE_URL, logo:manifest.logo,
      catalog:html.includes("https://anime.example.org/catalog/series/top_season.json"),
      install:html.includes("https://anime.example.org/manifest.json"),
      jsOrigin:html.includes('const origin="https://anime.example.org"'),
      hardcoded:html.includes('const origin="https://anibloom.vercel.app"')
    }));
  `;
  const run = (env) => spawnSync(process.execPath, ["--input-type=module","-e",code],
    {cwd:process.cwd(),encoding:"utf8",env:{...process.env,VERCEL:"1",...env}});
  const result = run({ ANIBLOOM_PUBLIC_ORIGIN:"https://anime.example.org" });
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{
    base:"https://anime.example.org",logo:"https://anime.example.org/assets/anibloom-icon.png",
    catalog:true,install:true,jsOrigin:true,hardcoded:false,
  });
  const invalid = run({ ANIBLOOM_PUBLIC_ORIGIN:"https://user:password@evil.example.org/" });
  assert.notEqual(invalid.status,0);
  assert.doesNotMatch(invalid.stderr,/user:password/);
});
