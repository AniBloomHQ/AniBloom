import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertVercelAccountReady } from "../scripts/assert-vercel-account-ready.mjs";
import { createBudgetedProductionFetch, validateRequestBudget } from "../scripts/production-request-budget.mjs";
import { retryTransientProductionFetch } from "../scripts/retry-production-fetch.mjs";
import { validateProduction } from "../scripts/validate-production.mjs";
import { catalogDefinitions, getSeasonInfo } from "../lib/catalog-config.js";

const workflow = readFileSync(new URL("../.github/workflows/sync-version.yml", import.meta.url), "utf8");
function gate(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "anibloom-release-gate-"));
  const block = workflow.split("      - name: Determine release request\n")[1].split("      - name: Validate repository release metadata\n")[0];
  const script = block.split("        run: |\n")[1].replace(/^          /gm, "");
  const output = join(directory, "output");
  try {
    execFileSync("bash", ["-c", script], { env: {
      ...process.env, EVENT_NAME: "workflow_dispatch", DEPLOY_PROD: "false", FINALIZE_RELEASE: "false",
      DRY_RUN: "true", LIVE_VALIDATION: "false", RELEASE_TARGET_SHA_INPUT: "", COMMIT_MESSAGE: "",
      GITHUB_SHA: "a".repeat(40), GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: join(directory, "summary"), ...overrides,
    }, stdio: "pipe" });
    return Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").map(line => line.split("=")));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("the actual workflow gate makes dry runs offline and requires explicit live validation", () => {
  assert.equal(gate().live_requests, "false");
  assert.equal(gate().release, "true");
  assert.equal(gate().redeploy, "false");
  assert.equal(gate({ LIVE_VALIDATION: "true" }).live_requests, "true");
  assert.equal(gate({ DRY_RUN: "false", DEPLOY_PROD: "true" }).live_requests, "true");
  assert.throws(() => gate({ DEPLOY_PROD: "true" }), /Command failed/);
  assert.throws(() => gate({ DRY_RUN: "false", LIVE_VALIDATION: "true" }), /Command failed/);
});

test("all hosted release request steps honor the live-request gate", () => {
  for (const name of ["Check for an existing Vercel deployment", "Trigger Vercel deployment", "Production smoke test", "Extended production validation"]) {
    const block = workflow.split(`      - name: ${name}\n`)[1].split("      - name:")[0];
    assert.match(block.split("\n")[0], /live_requests == 'true'/, name);
  }
  assert.ok(workflow.indexOf("node scripts/assert-vercel-account-ready.mjs") < workflow.indexOf("      - name: Trigger Vercel deployment"));
});

test("a known Vercel account block stops release checks without treating unrelated CI failures as account blocks", () => {
  const blocked = { context: "Vercel", state: "failure", description: "Account is blocked." };
  assert.throws(() => assertVercelAccountReady({ statuses: [blocked] }), /account is blocked/);
  assert.doesNotThrow(() => assertVercelAccountReady({ statuses: [{ ...blocked, context: "test" }] }));
  assert.doesNotThrow(() => assertVercelAccountReady({ statuses: [{ ...blocked, description: "Build failed" }] }));
  assert.doesNotThrow(() => assertVercelAccountReady({ statuses: [] }));
});

test("production retries cannot exceed the HTTP attempt budget or retry budget exhaustion", async () => {
  let calls = 0;
  const fetch = createBudgetedProductionFetch(async () => { calls++; return new Response("Wait", { status: 503 }); }, 2);
  await assert.rejects(retryTransientProductionFetch(fetch, "https://example.test", { attempts: 5, sleep: async () => {} }),
    { code: "PRODUCTION_REQUEST_BUDGET_EXHAUSTED" });
  assert.equal(calls, 2);
  for (const value of [0, -1, 1.5, "bad", 1001]) assert.throws(() => validateRequestBudget(value), /between 1 and 1000/);
});

test("snapshot attempt limits survive separate CLI processes and fail before another request is allowed", () => {
  const directory = mkdtempSync(join(tmpdir(), "anibloom-snapshot-budget-"));
  const file = join(directory, "count");
  const script = fileURLToPath(new URL("../scripts/production-request-budget.mjs", import.meta.url));
  try {
    execFileSync(process.execPath, [script, file, "1"]);
    const second = spawnSync(process.execPath, [script, file, "1"], { encoding: "utf8" });
    assert.equal(second.status, 1); assert.match(second.stderr, /budget exhausted/);
    assert.equal(readFileSync(file, "utf8"), "1");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("budget exhaustion cannot turn a partially checked catalog into successful production validation", async () => {
  const png = new Uint8Array(24); png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer); view.setUint32(16, 1); view.setUint32(20, 1);
  const manifest = { id: "com.marki.nuvio.anime-releases", version: "2.16.0", identityMode: "provider",
    resources: [{ name: "catalog", types: ["series", "movie"] }], types: ["series", "movie"], logo: "/logo.png",
    catalogs: catalogDefinitions(getSeasonInfo(new Date())),
  };
  let calls = 0;
  await assert.rejects(validateProduction("https://example.test", "2.16.0", async () => {
    calls++;
    return calls === 1 ? Response.json(manifest) : new Response(png, { headers: { "content-type": "image/png" } });
  }, { maxRequests: 2 }), { code: "PRODUCTION_REQUEST_BUDGET_EXHAUSTED" });
  assert.equal(calls, 2);
});

test("snapshot workflow budgets every attempt, including the manifest, before publishing complete data", () => {
  const snapshot = readFileSync(new URL("../.github/workflows/catalog-snapshot.yml", import.meta.url), "utf8");
  assert.match(snapshot, /max_requests:[\s\S]*?default: 100/);
  assert.match(snapshot, /while \(\( attempt <= max_attempts \)\); do\s+node scripts\/production-request-budget\.mjs/);
  assert.match(snapshot, /fetch_catalog_page "\$PRODUCTION_BASE_URL\/manifest\.json"/);
  assert.doesNotMatch(snapshot, /retry-all-errors/);
});
