import { describe, it, expect } from "vitest";
import { renderOrderConfirmationHtml } from "@/lib/mailer";
import { brand } from "@/brand.config";
import { formatPrice } from "@/lib/format";

const base = {
  orderId: "order-1",
  email: "kunde@example.dk",
  shippingName: "Kunde",
  items: [{ productName: "Solir Classic", quantity: 1, unitPriceDkk: 29900 }],
  subtotalDkk: 29900,
  discountDkk: 0,
  shippingDkk: 0,
  totalDkk: 29900,
};

const baseCurrency = brand.policies.currency;
const targetCurrency = Object.keys(brand.policies.supportedCurrencies).find(
  (currency) => currency !== baseCurrency,
)!;

describe("renderOrderConfirmationHtml — currency", () => {
  it("renders the configured base currency when no currency is given", () => {
    const html = renderOrderConfirmationHtml(base);
    expect(html).toContain(formatPrice(29900));
  });

  it("renders the presentment currency when currency is set", () => {
    const html = renderOrderConfirmationHtml({ ...base, currency: targetCurrency });
    expect(html).toContain(formatPrice(29900, { currency: targetCurrency }));
    expect(html).not.toContain(formatPrice(29900, { currency: baseCurrency }));
  });
});
