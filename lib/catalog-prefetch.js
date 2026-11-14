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
