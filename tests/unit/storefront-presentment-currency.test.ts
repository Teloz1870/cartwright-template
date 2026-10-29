import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const CHECKOUT_SURFACES = [
  "app/[locale]/cart/page.tsx",
  "app/[locale]/checkout/page.tsx",
] as const;

/**
 * Cart and checkout are server components, while the currency switcher stores
 * the shopper's choice in a cookie. They must therefore resolve the same
 * charge currency as order creation and format every base-unit amount through
 * that currency. A base-only formatter made PDP + WebMCP show USD while the
 * cart and checkout silently switched back to DKK.
 */
describe("cart and checkout render the selected charge currency", () => {
  it.each(CHECKOUT_SURFACES)("%s resolves and formats presentment currency", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    expect(src).toContain('getCheckoutCurrency()');
    expect(src).toMatch(/formatPrice\(minorBase,\s*\{\s*currency:\s*chargeCurrency/);
    expect(src).not.toContain("formatPriceDkk(");
  });
});
