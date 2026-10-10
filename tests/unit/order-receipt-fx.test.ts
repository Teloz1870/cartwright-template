import { describe, it, expect } from "vitest";
import { renderOrderConfirmationHtml } from "@/lib/mailer";
import { brand } from "@/brand.config";
import { formatPrice } from "@/lib/format";

// Guards the integration-review finding: the order-confirmation receipt must use
// the order's SNAPSHOTTED Order.fxRate (what the customer was actually charged),
// not the live FX-override cache (unprimed in the webhook → would fall back to the
// static brand anchor and drift from the charge when fxAutoUpdate is on).
const base = {
  orderId: "abcd1234efgh",
  email: "k@teloz.net",
  shippingName: "Test Testesen",
  items: [{ productName: "Vare", quantity: 1, unitPriceDkk: 10000 }],
  subtotalDkk: 10000,
  discountDkk: 0,
  shippingDkk: 0,
  totalDkk: 10000,
};

const baseCurrency = brand.policies.currency;
const targetCurrency = Object.keys(brand.policies.supportedCurrencies).find(
  (currency) => currency !== baseCurrency,
)!;

describe("order receipt FX — snapshotted rate, no charge/display drift", () => {
  it("converts at the order's fxRate, not the static target anchor", () => {
    const html = renderOrderConfirmationHtml({
      ...base,
      currency: targetCurrency,
      fxRate: 0.1,
    });
    const snapshot = formatPrice(10000, {
      currency: targetCurrency,
      fxRateOverrides: { fetchedAt: "", rates: { [targetCurrency]: 0.1 } },
    });
    const anchored = formatPrice(10000, { currency: targetCurrency });
    expect(html).toContain(snapshot);
    expect(snapshot).not.toBe(anchored);
    expect(html).not.toContain(anchored);
  });

  it("different snapshot rates yield different receipts (rate is actually applied)", () => {
    const a = renderOrderConfirmationHtml({ ...base, currency: targetCurrency, fxRate: 0.1 });
    const b = renderOrderConfirmationHtml({ ...base, currency: targetCurrency, fxRate: 0.5 });
    expect(a).not.toBe(b);
  });

  it("base-currency / no-fxRate receipts are unaffected (renders base amounts)", () => {
    const html = renderOrderConfirmationHtml(base);
    expect(html).toContain(formatPrice(10000));
  });
});
