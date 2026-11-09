#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { catalogDefinitions, getSeasonInfo, NUVIO_PAGE_SIZE } from "../lib/catalog-config.js";
import { ADDON_VERSION } from "../api/version.js";

// Snapshot requests must come only from a validated manifest, not untrusted
// arbitrary workflow input or a separately hardcoded catalog list.
export function validateSnapshotManifest(manifest, expectedVersion) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Snapshot manifest must be an object");
  }
  if (!/^\d+\.\d+\.\d+$/.test(String(expectedVersion || ""))
    || manifest.version !== expectedVersion) {
    throw new Error("Snapshot manifest version does not match the requested release");
  }
  if (manifest.id !== "com.marki.nuvio.anime-releases" || manifest.identityMode !== "provider") {
    throw new Error("Unexpected snapshot addon identity");
  }
  if (JSON.stringify(manifest.resources) !== JSON.stringify([{ name:"catalog", types:["series","movie"] }])
    || JSON.stringify(manifest.types) !== JSON.stringify(["series","movie"])) {
    throw new Error("Unexpected snapshot catalog protocol contract");
  }
  const list = manifest.catalogs;
  if (!Array.isArray(list) || list.length < 1 || list.length > 32) {
    throw new Error("Invalid snapshot catalog count");
  }
  const ids = new Set();
  const result = list.map(row => {
    if (!row || typeof row.id !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(row.id)) {
      throw new Error("Invalid snapshot catalog identifier");
    }
    if (ids.has(row.id)) throw new Error("Duplicate snapshot catalog identifier");
    ids.add(row.id);
    if ((row.type !== "series" && row.type !== "movie") || row.pageSize !== NUVIO_PAGE_SIZE) {
      throw new Error("Invalid snapshot catalog type or page size");
    }
    return { id:row.id, type:row.type };
  });
  // For the current source version, ensure snapshots agree exactly with the
  // runtime. Older *deployed* versions use their own validated manifest; this
  // keeps the manual workflow usable for a historical eight-catalog release.
  if (manifest.version === ADDON_VERSION) {
    const expected = catalogDefinitions(getSeasonInfo(new Date("2026-11-09T12:00:00Z")))
      .map(({id,type}) => ({id,type}));
    if (JSON.stringify(expected) !== JSON.stringify(result)) {
      throw new Error("Snapshot catalog entries do not match the runtime contract");
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [source, version, output] = process.argv.slice(2);
  if (!source || !version || !output) {
    console.error("Usage: node scripts/catalog-snapshot-contract.mjs manifest.json VERSION catalog-contract.tsv");
    process.exitCode = 2;
  } else {
    const manifest = JSON.parse(readFileSync(source,"utf8"));
    const catalogList = validateSnapshotManifest(manifest,version);
    writeFileSync(output,catalogList.map(row=>row.type+":"+row.id).join("\n")+"\n");
  }
}
