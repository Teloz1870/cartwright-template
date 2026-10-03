import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * Variant-price parity: every surface that DISPLAYS a cart line must price it
 * the way checkout CHARGES it — `variant?.priceDkk ?? product.priceDkk`
 * (`lib/orders/create.ts` bills that expression at three sites). Measured
 * before this test existed: the cart page (both render branches), the
 * checkout review (both branches), the assistant's pre-purchase PlanCard
 * total (a legal price display — forbrugeraftaleloven §8), the MCP
 * `cart.get_summary`/`discounts.try_apply` tools and the abandoned-cart
 * email all read `product.priceDkk` bare, so a variant priced above its
 * product displayed one total and charged another.
 *
 * Two layers, same rationale as footer-nav-locale.test.ts:
 * 1. A SOURCE scan of the display surfaces — the defect is re-introducible
 *    by writing one more `item.product.priceDkk`, which a fixture test on a
 *    single function would never see. The scan strips the legitimate
 *    fallback occurrences (`?? …product.priceDkk`) and then requires that
 *    NO bare cart-line read remains.
 * 2. A behavior test on the MCP cart summary — the one surface with a plain
 *    function seam — proving the variant price actually flows through.
 */

const ROOT = join(__dirname, "..", "..");

/** Cart-LINE display surfaces (files where `.product.priceDkk` means a line). */
const CART_LINE_FILES = [
  "app/[locale]/cart/page.tsx",
  "app/[locale]/checkout/page.tsx",
  "lib/tools/customer.ts",
  "lib/abandoned-cart.ts",
] as const;

function stripLegitimate(src: string): string {
  // The charged expression itself contains the product read as a FALLBACK —
  // those occurrences are correct and are removed before the scan.
  return src
    .replace(/\?\?\s*(item|i)\.product\.priceDkk/g, "")
    .replace(/\?\?\s*(item|i)\.product\.stock/g, "");
}

describe("cart-line displays price like checkout charges", () => {
  it.each(CART_LINE_FILES)("%s has no bare product-price cart-line read", (file) => {
    const src = stripLegitimate(readFileSync(join(ROOT, file), "utf8"));
    const offenders = src
      .split("\n")
      .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
      .filter(
        ({ line }) =>
          /\b(item|i)\.product\.priceDkk\b/.test(line) ||
          /\b(item|i)\.product\.stock\b/.test(line),
      );
    expect(offenders).toEqual([]);
  });

  it("the assistant PlanCard total reads the charged unit price", () => {
    // route.ts is large and uses `i.` in many contexts — scope the scan to
    // the orders.create preview block that builds the legal price display.
    const src = readFileSync(join(ROOT, "app/api/assistant/chat/route.ts"), "utf8");
    const start = src.indexOf('case "orders.create"');
    expect(start).toBeGreaterThan(-1);
    const block = stripLegitimate(src.slice(start, start + 1500));
    expect(block).not.toMatch(/\bi\.product\.priceDkk\b/);
    expect(block).toContain("i.variant?.priceDkk");
  });

  it("the abandoned-cart query actually LOADS the variant it now prices by", () => {
    // The expression is only as good as its data: without the variant include
    // the fallback silently always wins and the scan above still passes.
    const src = readFileSync(join(ROOT, "lib/abandoned-cart.ts"), "utf8");
    expect(src).toMatch(/variant:\s*\{\s*select:\s*\{\s*priceDkk:\s*true/);
  });
});

describe("MCP cart.get_summary prices variant lines like checkout", () => {
  it("uses variant price and variant-aware totals", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/cart", () => ({
      getCart: vi.fn(async () => ({
        id: "c1",
        items: [
          {
            id: "l1",
            quantity: 2,
            product: { slug: "grinder", name: "Hand Grinder", priceDkk: 39900, images: "[]" },
            variant: { id: "v1", priceDkk: 44900, stock: 2 },
          },
        ],
      })),
    }));
    const { getCartSummary } = await import("@/lib/tools/customer");
    const result = (await getCartSummary.handler({}, { actor: "system:test" })) as {
      items: { unitPriceDkk: number; lineTotalDkk: number }[];
      subtotalDkk: number;
    };
    expect(result.items[0].unitPriceDkk).toBe(44900);
    expect(result.items[0].lineTotalDkk).toBe(89800);
    expect(result.subtotalDkk).toBe(89800);
  });
});
