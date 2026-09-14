export async function loadCatalogPage({ fetchBatch, matchesFilter, offset = 0, pendingMatches = [], pageSize = 12, batchSize = 50 }) {
  let nextOffset = offset;
  let matches = pendingMatches.slice();
  let exhausted = false;
  for (let scans = 0; scans < 8 && matches.length < pageSize; scans += 1) {
    const batch = await fetchBatch(batchSize, nextOffset);
    if (!Array.isArray(batch)) throw new Error("Inventory response was invalid.");
    if (!batch.length) { exhausted = true; break; }
    nextOffset += batch.length;
    matches = matches.concat(batch.filter(matchesFilter));
    if (batch.length < batchSize) { exhausted = true; break; }
  }
  return {
    page: matches.slice(0, pageSize),
    remaining: matches.slice(pageSize),
    offset: nextOffset,
    hasMore: !exhausted || matches.length > pageSize,
  };
}
export function createRequestGate() {
  let version = 0;
  return {
    begin() { const request = ++version; return () => version === request; },
    invalidate() { version += 1; },
  };
}
