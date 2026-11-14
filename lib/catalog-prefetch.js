/** Start independent bulk reads together; consume only the rows each stage requests. */
export function prefetchMappingLookup(resolve, targets) {
  const idOf = row => Number(typeof row === "object" ? row.id ?? row.anilistId : row);
  const prefetchedIds = new Set(targets.map(idOf));
  // Handle failures immediately, even if an earlier stage resolves every title.
  const pending = Promise.resolve().then(() => resolve(targets))
    .then(records => ({ records }), error => ({ error }));
  return async requested => {
    if (!requested.length) return new Map();
    if (requested.every(row => !prefetchedIds.has(idOf(row)))) return resolve(requested);
    const outcome = await pending;
    if (outcome.error) throw outcome.error;
    const ids = new Set(requested.map(idOf));
    const result = new Map([...outcome.records].filter(([id]) => ids.has(Number(id))));
    // Franchise protection can ask for parent IDs outside the catalog page.
    // Those were never prefetched and must still reach the original resolver.
    const additional = requested.filter(row => !prefetchedIds.has(idOf(row)));
    if (additional.length) {
      for (const [id, records] of await resolve(additional)) result.set(id, records);
    }
    return result;
  };
}

/** Start late fallback work without allowing it to replace a provider identity. */
export function createFallbackPrefetch(resolve) {
  let pending = null;
  let requestedKeys = new Set();
  const keyOf = row => JSON.stringify([String(row.id), String(row.idMal || ""), row.currentFallbackId]);
  return {
    start(targets) {
      if (pending || !targets.length) return;
      requestedKeys = new Set(targets.map(keyOf));
      pending = Promise.resolve().then(() => resolve(targets))
        .then(result => ({ result }), error => ({ error }));
    },
    async resolve(targets) {
      if (!pending) return resolve(targets);
      const outcome = await pending;
      if (!(outcome.result instanceof Map)) return resolve(targets);
      const result = new Map();
      const missing = targets.filter(row => {
        const value = outcome.result.get(Number(row.id));
        if (!requestedKeys.has(keyOf(row)) || !/^[1-9]\d*$/.test(String(value || ""))) return true;
        result.set(Number(row.id), value);
        return false;
      });
      // A failed or empty early lookup must not suppress the normal late retry,
      // nor can a different MAL/source preference reuse the early result.
      if (missing.length) for (const [id, value] of await resolve(missing)) result.set(id, value);
      return result;
    },
  };
}
