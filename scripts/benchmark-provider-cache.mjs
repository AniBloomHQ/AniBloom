#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  root: { type: "string", default: fileURLToPath(new URL("..", import.meta.url)) },
  cache: { type: "string" }, report: { type: "string" },
  catalog: { type: "string", default: "current_season" },
  date: { type: "string", default: new Date().toISOString() },
} });
if (!values.cache || !values.report) {
  throw new Error("Usage: node scripts/benchmark-provider-cache.mjs --cache /tmp/cache.json --report /tmp/report.json [--root baseline-checkout] [--catalog current_season] [--date ISO-date]");
}
const date = new Date(values.date);
if (!Number.isFinite(date.getTime())) throw new Error("Invalid benchmark date");
const root = resolve(values.root);
const moduleUrl = file => pathToFileURL(resolve(root, file));
const { createLocalCatalogCache } = await import(moduleUrl("lib/local-catalog-cache.js"));
const { configureLocalCatalogCache } = await import(moduleUrl("lib/catalog-runtime-cache.js"));
const { buildCatalog, getSeasonInfo, getCatalogFilter, configureCatalogPipeline } = await import(moduleUrl("api/catalog-source.js"));
const { catalogDefinitions } = await import(moduleUrl("lib/catalog-config.js"));
const info = getSeasonInfo(date);
if (!catalogDefinitions(info).some(catalog => catalog.id === values.catalog)) throw new Error("Unknown catalog");
if (!getCatalogFilter(values.catalog, info)) throw new Error("Use a seasonal/ranked catalog; rolling feeds depend on the live clock");
const cache = await createLocalCatalogCache({ file: resolve(values.cache) });
configureLocalCatalogCache(cache); configureCatalogPipeline({ optimized: true });

const originalFetch = globalThis.fetch;
const network = {};
globalThis.fetch = async (input, options) => {
  const host = new URL(typeof input === "string" || input instanceof URL ? input : input.url).hostname;
  if (host === "anibloom.vercel.app") throw new Error("Hosted AniBloom requests are forbidden in this local benchmark");
  const record = network[host] ||= { requests: 0, failures: 0 };
  record.requests++;
  try {
    const response = await originalFetch(input, options);
    if (!response.ok) record.failures++;
    return response;
  } catch (error) { record.failures++; throw error; }
};
const diagnostics = {}, started = performance.now(), cpu = process.cpuUsage();
try {
  // Bypass prepared-page hits deliberately: every process rebuilds the catalog
  // while retaining only the provider and identity records in the cache file.
  const metas = await buildCatalog(values.catalog, info, 0, "", diagnostics);
  const usage = process.cpuUsage(cpu);
  const report = {
    catalog: values.catalog, date: date.toISOString(), ms: Math.round(performance.now() - started),
    cpuMs: Math.round((usage.user + usage.system) / 1000),
    requests: Object.values(network).reduce((total, record) => total + record.requests, 0),
    titles: metas.length, network, diagnostics, metas,
  };
  await cache.flush();
  await writeFile(resolve(values.report), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ ...report, metas: undefined }));
} finally { globalThis.fetch = originalFetch; }
