import test from "node:test";
import assert from "node:assert/strict";
import { loadCatalogPage, createRequestGate } from "../src/lib/catalogLoader.js";
test("catalog preserves filtered overflow and offsets across pages", async () => {
  const rows = Array.from({ length: 30 }, (_, id) => ({ id }));
  const first = await loadCatalogPage({ fetchBatch: async (n, skip) => rows.slice(skip, skip+n), matchesFilter: () => true });
  assert.equal(first.page.length, 12); assert.equal(first.remaining.length, 18); assert.equal(first.offset, 30);
  const second = await loadCatalogPage({ fetchBatch: async (n, skip) => rows.slice(skip, skip+n), matchesFilter: () => true, offset: first.offset, pendingMatches: first.remaining });
  assert.deepEqual(second.page.map(x=>x.id), Array.from({length:12},(_,i)=>i+12));
  const third = await loadCatalogPage({ fetchBatch: async (n, skip) => rows.slice(skip, skip+n), matchesFilter: () => true, offset: second.offset, pendingMatches: second.remaining });
  assert.deepEqual(third.page.map(x=>x.id), [24,25,26,27,28,29]);
  assert.equal(third.hasMore, false);
});
test("provider failures remain errors rather than an empty marketplace", async () => {
  await assert.rejects(loadCatalogPage({ fetchBatch: async () => { throw new Error("offline"); }, matchesFilter: () => true }), /offline/);
  await assert.rejects(loadCatalogPage({ fetchBatch: async () => ({}), matchesFilter: () => true }), /invalid/);
});
test("sparse filtering is bounded and still permits continuing a search", async () => {
  let calls = 0;
  const result = await loadCatalogPage({ fetchBatch: async () => { calls++; return Array.from({length:50},()=>({})); }, matchesFilter: () => false });
  assert.equal(calls, 8); assert.equal(result.offset, 400); assert.equal(result.hasMore, true);
});
test("stale requests cannot overwrite the latest search or a dismissed page", () => {
  const gate = createRequestGate();
  const old = gate.begin(); const latest = gate.begin();
  assert.equal(old(), false); assert.equal(latest(), true);
  gate.invalidate(); assert.equal(latest(), false);
});
