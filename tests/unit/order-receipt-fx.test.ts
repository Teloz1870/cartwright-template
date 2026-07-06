import { describe, it, expect } from "vitest";
import { renderOrderConfirmationHtml } from "@/lib/mailer";

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

describe("order receipt FX — snapshotted rate, no charge/display drift", () => {
  it("converts at the order's fxRate, not the static EUR anchor (0.134)", () => {
    // 10000 øre × 0.10 = 1000 minor = €10.00 (snapshot). The anchor 0.134 would
    // yield €13.40 — which must NOT appear.
    const html = renderOrderConfirmationHtml({ ...base, currency: "EUR", fxRate: 0.1 });
    expect(html).toContain("10.00");
    expect(html).not.toContain("13.40");
    expect(html).not.toContain("13,40");
  });

  it("different snapshot rates yield different receipts (rate is actually applied)", () => {
    const a = renderOrderConfirmationHtml({ ...base, currency: "EUR", fxRate: 0.1 });
    const b = renderOrderConfirmationHtml({ ...base, currency: "EUR", fxRate: 0.5 });
    expect(a).not.toBe(b);
  });

  it("base-currency / no-fxRate receipts are unaffected (renders base amounts)", () => {
    const html = renderOrderConfirmationHtml(base);
    expect(html).toContain("100"); // 10000 øre = 100,00 kr (base, unconverted)
  });
});
