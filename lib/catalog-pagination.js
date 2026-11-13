export async function collectValidatedCatalogPage({
  skip = 0,
  pageSize = 10,
  maxPages = 5,
  fetchPage,
  canonicalizePage,
  onPage,
  onComplete,
}) {
  const normalizedSkip = Math.max(0, Number(skip) || 0);
  const targetCount = normalizedSkip + pageSize;
  const valid = [];
  const seenIds = new Set();
  let pagesFetched = 0;
  let lastRawCount = 0;

  for (let page = 1; page <= maxPages && valid.length < targetCount; page++) {
    const rows = await fetchPage(page);
    pagesFetched = page;
    lastRawCount = Array.isArray(rows) ? rows.length : 0;
    if (!Array.isArray(rows) || rows.length === 0) break;

    const resolved = await canonicalizePage(rows);
    for (const meta of Array.isArray(resolved) ? resolved : []) {
      if (!meta) continue;
      const identity = String(meta.id || "").trim();
      if (!identity || seenIds.has(identity)) continue;
      seenIds.add(identity);
      valid.push(meta);
    }

    if (typeof onPage === "function") {
      await onPage({
        page,
        rawCount: rows.length,
        validCount: Array.isArray(resolved) ? resolved.length : 0,
        accumulatedCount: valid.length,
      });
    }

    if (rows.length < pageSize) break;
  }

  // A full final upstream page with too few validated unique entries can
  // indicate the fixed request budget cut the catalog short. Do not perform
  // a speculative next fetch; report a *possible* truncation to diagnostics.
  if (typeof onComplete === "function") {
    await onComplete({
      pagesFetched,
      targetReached: valid.length >= targetCount,
      budgetExhausted: pagesFetched >= maxPages
        && lastRawCount >= pageSize
        && valid.length < targetCount,
    });
  }
  return valid.slice(normalizedSkip, targetCount);
}
