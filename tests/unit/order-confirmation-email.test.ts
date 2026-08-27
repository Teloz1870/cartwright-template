import { describe, it, expect } from "vitest";
import { renderOrderConfirmationHtml } from "@/lib/mailer";

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

describe("renderOrderConfirmationHtml — currency", () => {
  it("renders the base currency (DKK) when no currency is given", () => {
    const html = renderOrderConfirmationHtml(base);
    expect(html).toMatch(/299,00\skr/);
    expect(html).not.toContain("€");
  });

  it("renders the presentment currency when currency is set", () => {
    // 29900 base-øre → convertMinor("EUR") = 4007 cents → €40.07
    const html = renderOrderConfirmationHtml({ ...base, currency: "EUR" });
    expect(html).toContain("€");
    expect(html).toMatch(/40[.,]07/);
    expect(html).not.toMatch(/\bkr/);
  });
});
