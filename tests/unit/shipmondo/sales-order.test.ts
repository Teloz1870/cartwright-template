import { beforeEach, describe, expect, it, vi } from "vitest";
import { amount, orderRefOf, toSalesOrder, vatFraction, type ShippableOrderRow } from "@/plugins/shipmondo/lib/sales-order";

/**
 * A Cartwright order as a Shipmondo sales order (plugins/shipmondo/lib/sales-order.ts).
 * Amounts are minor units in, Shipmondo's decimal strings out. The market is
 * pinned here (a Danish shop: DKK, 25 % VAT included) rather than read from
 * brand.config, because this file also runs in the USD scaffold market
 * (pr-gate SCAFFOLD-USD-GATE); the last test switches to that market.
 */
const market = vi.hoisted(() => ({
  brand: {
    storeName: "Northbound",
    policies: { country: "DK", currency: "DKK", vatRatePct: 25, pricesIncludeVat: true },
  },
}));
vi.mock("@/brand.config", () => ({ brand: market.brand }));

beforeEach(() => {
  market.brand.policies = { country: "DK", currency: "DKK", vatRatePct: 25, pricesIncludeVat: true };
});
const ORDER: ShippableOrderRow = {
  id: "ord_1",
  orderNumber: 1042,
  createdAt: new Date("2026-11-05T09:00:00Z"),
  paidAt: new Date("2026-11-05T09:01:00Z"),
  email: "kunde@example.com",
  phoneNumber: "+4512345678",
  shippingName: "Kunde Hansen",
  shippingAddress: "Holmvej 15",
  shippingZip: "6780",
  shippingCity: "Skærbæk",
  billingName: null,
  billingAddress: null,
  billingZip: null,
  billingCity: null,
  billingCountry: null,
  shippingDkk: 4900,
  discountDkk: 2500,
  discountCode: "VELKOMMEN",
  totalDkk: 27400,
  vatOere: null,
  paymentMethod: "stripe_card",
  paymentRef: "pi_123",
  items: [
    { productName: "Kaffe", sku: "K1", variantSku: "K1-500", quantity: 2, unitPriceDkk: 12500 },
  ],
};

describe("amount", () => {
  it.each([
    [12345, "123.45"],
    [5, "0.05"],
    [0, "0.00"],
    [-500, "-5.00"],
    [100000, "1000.00"],
  ])("%i øre → %s", (oere, text) => expect(amount(oere)).toBe(text));
});

describe("vatFraction", () => {
  it.each([
    [25, "0.25"],
    [12.5, "0.125"],
    [7.7, "0.077"],
    [0, "0"],
  ])("%d %% is %s, as Shipmondo writes a rate", (pct, text) => expect(vatFraction(pct)).toBe(text));
});

describe("toSalesOrder", () => {
  const so = toSalesOrder(ORDER);

  it("names the order by the number the shop sees, else its id, and tags it with its own id", () => {
    expect(so.order_id).toBe("1042");
    expect(so.tags).toEqual(["cartwright:ord_1"]);
    expect(orderRefOf({ id: "ord_2", orderNumber: null })).toBe("ord_2");
    expect(so.ordered_at).toBe("2026-11-05T09:01:00.000Z");
  });

  it("ships to the order's address in the shop's country, and bills there when no billing address was given", () => {
    expect(so.ship_to).toEqual({
      name: "Kunde Hansen",
      address1: "Holmvej 15",
      zipcode: "6780",
      city: "Skærbæk",
      country_code: "DK",
      email: "kunde@example.com",
      mobile: "+4512345678",
    });
    expect(so.bill_to).toMatchObject({ name: "Kunde Hansen", address1: "Holmvej 15", country_code: "DK" });
  });

  it("sends the charged total with its VAT, and the payment reference", () => {
    // 274.00 incl. 25 % VAT → VAT is a fifth: 54.80.
    expect(so.payment_details).toEqual({
      amount_including_vat: "274.00",
      amount_excluding_vat: "219.20",
      vat_amount: "54.80",
      vat_percent: "0.25",
      currency_code: "DKK",
      payment_method: "stripe_card",
      transaction_id: "pi_123",
    });
    expect(toSalesOrder({ ...ORDER, vatOere: 5000 }).payment_details.vat_amount).toBe("50.00");
  });

  it("has one line per item, then shipping, then the discount as a negative line", () => {
    expect(so.order_lines).toEqual([
      {
        line_type: "item",
        item_name: "Kaffe",
        item_sku: "K1-500",
        quantity: 2,
        unit_price_excluding_vat: "100.00",
        vat_percent: "0.25",
        currency_code: "DKK",
      },
      {
        line_type: "shipping",
        item_name: "Shipping",
        quantity: 1,
        unit_price_excluding_vat: "39.20",
        vat_percent: "0.25",
        currency_code: "DKK",
      },
      {
        line_type: "discount",
        item_name: "Discount VELKOMMEN",
        quantity: 1,
        unit_price_excluding_vat: "-20.00",
        vat_percent: "0.25",
        currency_code: "DKK",
      },
    ]);
  });

  it("sends the shop's own base currency and country, not Denmark's", () => {
    market.brand.policies = { country: "us", currency: "usd", vatRatePct: 0, pricesIncludeVat: false };
    const us = toSalesOrder(ORDER);
    expect(us.ship_to.country_code).toBe("US");
    expect(us.payment_details.currency_code).toBe("USD");
    expect(new Set(us.order_lines.map((l) => l.currency_code))).toEqual(new Set(["USD"]));
    // No VAT in this market: the charged total is the whole amount.
    expect(us.payment_details).toMatchObject({ amount_including_vat: "274.00", vat_amount: "0.00" });
    expect(us.order_lines[0].unit_price_excluding_vat).toBe("125.00");
  });

  it("in a shop whose prices exclude VAT, tells Shipmondo the VAT that was charged: none unless recorded", () => {
    market.brand.policies = { country: "DK", currency: "DKK", vatRatePct: 25, pricesIncludeVat: false };
    const plain = toSalesOrder({ ...ORDER, shippingDkk: 0, discountDkk: 0, totalDkk: 25000 });
    // Checkout added no VAT on top (MOMS1), so the lines are the prices and the total adds up.
    expect(plain.payment_details).toMatchObject({ amount_including_vat: "250.00", amount_excluding_vat: "250.00", vat_amount: "0.00", vat_percent: "0" });
    expect(plain.order_lines[0]).toMatchObject({ unit_price_excluding_vat: "125.00", vat_percent: "0" });
    // An order that recorded its VAT says so, at the shop's rate.
    const taxed = toSalesOrder({ ...ORDER, shippingDkk: 0, discountDkk: 0, totalDkk: 31250, vatOere: 6250 });
    expect(taxed.payment_details).toMatchObject({ amount_excluding_vat: "250.00", vat_amount: "62.50", vat_percent: "0.25" });
    expect(taxed.order_lines[0]).toMatchObject({ unit_price_excluding_vat: "125.00", vat_percent: "0.25" });
  });

  it("a zero-rated order in a VAT-inclusive shop takes no VAT out of its lines", () => {
    const zero = toSalesOrder({ ...ORDER, shippingDkk: 0, discountDkk: 0, totalDkk: 25000, vatOere: 0 });
    expect(zero.payment_details).toMatchObject({ amount_including_vat: "250.00", vat_amount: "0.00", vat_percent: "0" });
    expect(zero.order_lines[0]).toMatchObject({ unit_price_excluding_vat: "125.00", vat_percent: "0" });
  });

  it("sends a Stripe checkout's PaymentIntent as the transaction id when paymentRef is unset", () => {
    const so = toSalesOrder({ ...ORDER, paymentRef: null, stripePaymentIntentId: "pi_live_1" });
    expect(so.payment_details).toMatchObject({ transaction_id: "pi_live_1" });
  });

  it("falls back to the product's own SKU when the line kept none", () => {
    const so = toSalesOrder({
      ...ORDER,
      items: [{ productName: "Hegn", sku: null, variantSku: null, quantity: 1, unitPriceDkk: 12500, product: { sku: "HEGN-1" } }],
    });
    expect(so.order_lines[0].item_sku).toBe("HEGN-1");
    const none = toSalesOrder({ ...ORDER, items: [{ productName: "Hegn", sku: null, variantSku: null, quantity: 1, unitPriceDkk: 12500, product: null }] });
    expect(none.order_lines[0]).not.toHaveProperty("item_sku");
  });

  it("leaves out shipping and discount lines that are zero, and an empty phone", () => {
    const plain = toSalesOrder({ ...ORDER, shippingDkk: 0, discountDkk: 0, phoneNumber: null });
    expect(plain.order_lines.map((l) => l.line_type)).toEqual(["item"]);
    expect(plain.ship_to).not.toHaveProperty("mobile");
  });
});
