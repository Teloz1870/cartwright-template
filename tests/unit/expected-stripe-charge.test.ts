import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chargeMatchesOrder, expectedStripeCharge } from "@/lib/money";

/**
 * CRON-FX — "the amount Stripe should have charged" has ONE definition, and
 * both places that compare a PaymentIntent against an order read it. The
 * reconcile cron used to compare `intent.amount` with the base-currency total
 * while the webhook used the snapshotted presentment amount + currency, so the
 * two disagreed about the same multiCurrency payment.
 */
const eurOrder = { totalDkk: 14900, fxRate: 0.134, currency: "EUR" };

describe("expectedStripeCharge", () => {
  it("converts with the order's snapshotted rate, in its currency as Stripe writes it", () => {
    expect(expectedStripeCharge(eurOrder)).toEqual({ amount: 1997, currency: "eur" });
  });

  it("is the total unchanged for a base-currency order", () => {
    expect(expectedStripeCharge({ totalDkk: 14900, fxRate: 1, currency: "DKK" })).toEqual({
      amount: 14900,
      currency: "dkk",
    });
  });
});

describe("chargeMatchesOrder", () => {
  it("accepts the presentment amount in the presentment currency", () => {
    expect(chargeMatchesOrder({ amount: 1997, currency: "eur" }, eurOrder)).toBe(true);
  });

  it("refuses the base-currency total, another amount, or another currency", () => {
    expect(chargeMatchesOrder({ amount: 14900, currency: "eur" }, eurOrder)).toBe(false);
    expect(chargeMatchesOrder({ amount: 1996, currency: "eur" }, eurOrder)).toBe(false);
    expect(chargeMatchesOrder({ amount: 1997, currency: "usd" }, eurOrder)).toBe(false);
  });
});

describe("the webhook and the reconcile cron share it", () => {
  for (const file of ["app/api/webhook/stripe/route.ts", "app/api/cron/reconcile-stripe/route.ts"]) {
    it(file, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/chargeMatchesOrder\(intent, order\)/);
      // No second, local derivation of the expected amount.
      expect(src).not.toMatch(/totalDkk \* /);
      expect(src).not.toMatch(/intent\.amount !==/);
    });
  }
});
