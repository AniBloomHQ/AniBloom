import test from "node:test";
import assert from "node:assert/strict";
import { withCatalogDeadline, fetchWithCatalogDeadline } from "../lib/catalog-deadline.js";
import { formatCatalogErrorDiagnostics } from "../api/catalog-source.js";

test("catalog deadlines preserve successful results", async () => {
  assert.equal(await withCatalogDeadline(async () => 42, 100), 42);
});

test("a deadline aborts outstanding response bodies and rejects the complete build", async () => {
  const original = globalThis.fetch;
  let signal;
  globalThis.fetch = async (_, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({
      start(controller) { signal.addEventListener("abort", () => controller.error(signal.reason), { once: true }); },
    }));
  };
  try {
    await assert.rejects(withCatalogDeadline(async () => {
      const response = await fetchWithCatalogDeadline("https://example.test");
      await response.text();
    }, 25), { code: "CATALOG_BUILD_TIMEOUT" });
    assert.equal(signal.aborted, true);
  } finally { globalThis.fetch = original; }
});

test("nested work shares the original deadline rather than starting a new budget", async () => {
  await assert.rejects(withCatalogDeadline(() => withCatalogDeadline(() => new Promise(() => {}), 1000), 25), {
    code: "CATALOG_BUILD_TIMEOUT",
  });
});

test("build timeouts are classified as retryable catalog failures", () => {
  const diagnostic = formatCatalogErrorDiagnostics({ code: "CATALOG_BUILD_TIMEOUT" });
  assert.equal(diagnostic.category, "catalog_timeout");
  assert.equal(diagnostic.retryable, true);
});
