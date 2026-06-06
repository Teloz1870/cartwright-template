import { describe, expect, it, vi } from "vitest";

/**
 * Tax + invoicing (J) — moms-breakdown (inkl./ekskl.) + provider-selektion +
 * order→input-mapping. Stripe-klienten mockes så vi ikke puller hele kæden.
 */

vi.mock("@/lib/stripe", () => ({ getStripeClient: async () => null }));

describe("vatBreakdown", () => {
  it("priser inkl. moms → trækker momsen ud (25%)", async () => {
    const { vatBreakdown } = await import("@/lib/tax");
    const b = vatBreakdown(12500, { ratePct: 25, pricesIncludeVat: true });
    expect(b.net).toBe(10000);
    expect(b.vat).toBe(2500);
    expect(b.gross).toBe(12500);
  });

  it("priser ekskl. moms → lægger momsen ovenpå (25%)", async () => {
    const { vatBreakdown } = await import("@/lib/tax");
    const b = vatBreakdown(10000, { ratePct: 25, pricesIncludeVat: false });
    expect(b.net).toBe(10000);
    expect(b.vat).toBe(2500);
    expect(b.gross).toBe(12500);
  });
});

describe("invoice provider", () => {
  it("default = stripe; navn vælger adapter", async () => {
    const { getInvoiceProvider } = await import("@/lib/invoicing");
    expect(getInvoiceProvider().name).toBe("stripe");
    expect(getInvoiceProvider("economic").name).toBe("economic");
    expect(getInvoiceProvider("dinero").name).toBe("dinero");
  });

  it("e-conomic-stub kaster tydeligt indtil konfigureret", async () => {
    const { getInvoiceProvider } = await import("@/lib/invoicing");
    await expect(
      getInvoiceProvider("economic").createInvoice({
        orderId: "o1",
        customer: { email: "a@b.dk" },
        currency: "dkk",
        lines: [],
        vatRatePct: 25,
        pricesIncludeVat: true,
      }),
    ).rejects.toThrow(/e-conomic/);
  });

  it("buildInvoiceInput mapper ordre → linjer + valuta", async () => {
    const { buildInvoiceInput } = await import("@/lib/invoicing");
    const input = buildInvoiceInput({
      id: "o1",
      email: "a@b.dk",
      shippingName: "Kim",
      items: [{ productName: "Kaffe", unitPriceDkk: 12500, quantity: 2 }],
    });
    expect(input.currency).toBe("dkk");
    expect(input.lines[0]).toEqual({ description: "Kaffe", quantity: 2, unitAmountOere: 12500 });
    expect(input.vatRatePct).toBe(25);
  });
});
