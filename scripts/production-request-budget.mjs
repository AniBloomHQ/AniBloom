import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validateRequestBudget(value = 100) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError("Production request budget must be an integer between 1 and 1000");
  }
  return limit;
}

function exhausted() {
  const error = new Error("Production request budget exhausted; validation/capture is incomplete");
  error.code = "PRODUCTION_REQUEST_BUDGET_EXHAUSTED";
  return error;
}

export function createBudgetedProductionFetch(fetchImpl, maxRequests = 100) {
  const limit = validateRequestBudget(maxRequests);
  let count = 0;
  return (...args) => {
    if (count >= limit) throw exhausted();
    count++;
    return fetchImpl(...args);
  };
}

// Snapshot requests are serial. Persist the counter because shell command
// substitution runs the request function in a separate subshell for each page.
export function claimSnapshotRequest(file, maxRequests = 100) {
  const limit = validateRequestBudget(maxRequests);
  const count = existsSync(file) ? Number(readFileSync(file, "utf8").trim()) : 0;
  if (!Number.isInteger(count) || count < 0) throw new Error("Invalid production request counter");
  if (count >= limit) throw exhausted();
  writeFileSync(file, String(count + 1), { mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error("A snapshot request counter file is required");
  claimSnapshotRequest(process.argv[2], process.argv[3]);
}
