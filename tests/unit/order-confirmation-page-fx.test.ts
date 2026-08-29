import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  join(process.cwd(), "app/[locale]/order/[id]/page.tsx"),
  "utf8",
);

describe("order confirmation uses the order's immutable money snapshot", () => {
  it("renders every receipt amount in the stored currency and FX rate", () => {
    expect(SOURCE).not.toContain("formatPriceDkk");
    expect(SOURCE).toContain("currency: order.currency");
    expect(SOURCE).toContain("[order.currency]: order.fxRate");
    expect(SOURCE).toContain("fxRateOverrides: receiptFxRates");
  });

  it("routes EVERY amount through the snapshot, not just most of them", () => {
    // The assertion above only proves the OLD helper is gone. A new amount
    // added as `formatPrice(x, { locale })` — no currency — would pass it while
    // rendering base currency beside converted ones on the same receipt.
    //
    // So: every minor-unit value on this page must reach `orderMoney`. The
    // page has six (unit price, line total, subtotal, discount, shipping,
    // total); the count is asserted so a seventh cannot arrive unnoticed.
    const body = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const amounts = body.match(/\b(?:order|item)\.\w*(?:Dkk|Oere)\b/g) ?? [];
    expect(amounts.length, "no amounts found — the scan is empty").toBeGreaterThan(5);

    // Exactly one formatter call, and it is the helper's own definition.
    const formatCalls = body.match(/formatPrice\(/g) ?? [];
    expect(formatCalls, "an amount is formatted outside orderMoney").toHaveLength(1);
  });

  it("keeps the continue-shopping link in the current locale", () => {
    expect(SOURCE).toContain('href={`/${locale}/produkter`}');
  });
});
