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
  const record = network[host] ||= {
    requests: 0, failures: 0, responseBytes: 0, headersMs: 0,
    bodyMs: 0, jsonParseMs: 0, encodedBytes: null,
    contentEncoding: null, transferEncoding: null, requestBatchSizes: [],
  };
  record.requests++;
  if (host === "arm.haglund.dev") {
    try {
      const requestRows = JSON.parse(String(options?.body || "null"));
      record.requestBatchSizes.push(Array.isArray(requestRows) ? requestRows.length : null);
    } catch { record.requestBatchSizes.push(null); }
  }
  const requestStarted = performance.now();
  let response;
  try {
    response = await originalFetch(input, options);
  } catch (error) {
    record.headersMs += performance.now() - requestStarted;
    record.failures++;
    throw error;
  }
  record.headersMs += performance.now() - requestStarted;
  if (!response.ok) record.failures++;
  if (host === "graphql.anilist.co") {
    const contentLength = response.headers.get("content-length");
    const encodedBytes = contentLength == null ? NaN : Number(contentLength);
    if (Number.isFinite(encodedBytes) && encodedBytes >= 0) {
      record.encodedBytes = (record.encodedBytes || 0) + encodedBytes;
    }
    record.contentEncoding = response.headers.get("content-encoding");
    record.transferEncoding = response.headers.get("transfer-encoding");
    // Split body transfer/decompression from JSON parsing while consuming the
    // response exactly once, through the same Response.json() call as normal.
    response.json = async () => {
      const bodyStarted = performance.now();
      let body;
      try {
        body = await response.text();
      } finally {
        record.bodyMs += performance.now() - bodyStarted;
      }
      record.responseBytes += Buffer.byteLength(body);
      const parseStarted = performance.now();
      try {
        return JSON.parse(body);
      } finally {
        record.jsonParseMs += performance.now() - parseStarted;
      }
    };
  } else {
    // Count decoded body bytes for other providers without consuming the body
    // used by their resolver.
    try {
      record.responseBytes += await response.clone().arrayBuffer().then(body => body.byteLength);
    } catch { /* Instrumentation must not affect catalog resolution. */ }
  }
  return response;
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
