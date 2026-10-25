import { describe, expect, it, vi } from "vitest";

/**
 * W21-live-1 R3 — `lib/woo` decodes HTML entities with jsdom, and must LOAD it
 * lazily, as lib/v0/transform/sanitize-strict.ts does: importing jsdom crosses
 * its CJS→ESM `require` boundary, and lib/woo will sit behind the tool
 * registry, a barrel that a dozen pages import. Same probe as
 * v0-sanitize-strict-lazy.test.ts: evaluating the mock factory IS the signal.
 */

const { loaded, windows } = vi.hoisted(() => ({ loaded: { value: false }, windows: { count: 0 } }));

vi.mock("jsdom", () => {
  loaded.value = true;
  return {
    JSDOM: class {
      window = { document: { createElement: () => ({ innerHTML: "", value: "decoded" }) } };
      constructor() {
        windows.count++;
      }
    },
  };
});

describe("lib/woo — jsdom is loaded on first decode, never at import", () => {
  it("importing the plan and the mapping loads nothing; the first plan loads one window, reused", async () => {
    vi.resetModules();
    const { planWooCatalog } = await import("@/lib/woo/plan");
    const { htmlDecoder } = await import("@/lib/woo/map-catalog");
    expect(loaded.value, "jsdom was pulled in just by importing lib/woo").toBe(false);

    const { wooSnapshot } = await import("./woo-fixture-shop");
    await planWooCatalog(wooSnapshot(), { categories: [], products: [] }, { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true });
    await htmlDecoder();
    expect(loaded.value).toBe(true);
    expect(windows.count).toBe(1);
  });
});
