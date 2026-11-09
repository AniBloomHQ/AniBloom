#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runCatalogFanoutScenario } from "../test-support/catalog-fanout-harness.mjs";

/**
 * Request-count profile for the existing full identity fallback pipeline.
 * Fake workers use local HTTP/Redis/AniList/provider responses exclusively.
 * Report only aggregate counts, never media IDs, search strings or URLs.
 * These durations are offline elapsed time, NOT measured Vercel CPU.
 */
export async function runMockedCatalogProfile() {
  const scenarios = [
    ["cold", {}],
    ["warm", { warm:true }],
    ["stale", { stale:true }],
    ["lock-unavailable", { lockUnavailable:true }],
  ];
  const reports=[];
  for (const [mode,options] of scenarios) {
    const raw=await runCatalogFanoutScenario(options);
    if (!raw.results.every(item=>item.ok && item.status===200)) {
      throw new Error("Mocked catalog profile scenario failed: "+mode);
    }
    reports.push({
      mode,
      workerCount: raw.results.length,
      cacheReads: raw.catalogReads,
      catalogWrites: raw.catalogWrites,
      anilistCalls: raw.anilistCalls,
      armCalls: raw.armCalls,
      providerRequests: raw.providerTargets.length,
      providerRequestsByHost: Object.fromEntries(Object.entries(raw.providerCountsByHost)
        .map(([host,count]) => [host,count]).sort(([a],[b]) => a.localeCompare(b))),
      elapsedMs:raw.durationMs,
    });
  }
  // The mocked hosts are source identifiers, not user data or outbound URLs.
  return { offline:true, measuredProductionCpu:false, scenarios:reports };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await runMockedCatalogProfile(),null,2));
}
