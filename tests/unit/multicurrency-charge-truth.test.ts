import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The number a customer READS must be the number their card is CHARGED.
 *
 * Two places broke that promise once `multiCurrency` puts a shopper in a
 * currency other than the shop's base:
 *
 *   1. The pay button rendered `formatPriceDkk(totalDkk)`, which always
 *      formats the BASE currency, while `createOrder` charged
 *      `convertMinor(totalDkk, currency)`. The customer read 149,00 kr and
 *      was charged €19.97.
 *   2. A partial refund sent `amountOere` — a base-currency figure — straight
 *      to `stripe.refunds.create({ amount })`, which Stripe interprets in the
 *      PAYMENT INTENT's currency. Asking to refund 149 on a €19.97 charge is
 *      a request to refund €149.
 *
 * Both were invisible: the flag is default-off, so base == charge currency and
 * the two agreed by coincidence. These assertions read source because the
 * defect is a DATA-FLOW one — which value reaches which call — and a unit test
 * that supplies its own numbers cannot see a wiring mistake.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the pay button shows the amount Stripe is given", () => {
  const CREATE = read("lib/orders/create.ts");
  const PANEL = read("components/StripePaymentPanel.tsx");

  it("createOrder computes the charge ONCE and returns it", () => {
    // One expression feeding both the intent and the button is the whole fix:
    // two independent derivations are what allowed them to disagree.
    expect(CREATE).toMatch(/const chargeAmountMinor = convertMinor\(totalDkk, currency\)/);
    expect(CREATE).toMatch(/amountMinor: chargeAmountMinor/);
    expect(CREATE).toMatch(/chargeAmountMinor,/);
    expect(CREATE).toMatch(/chargeCurrency: currency/);
  });

  it("the button renders that amount, in that currency", () => {
    const body = stripComments(PANEL);
    expect(body).toMatch(/formatPrice\(chargeAmountMinor, \{/);
    expect(body).toMatch(/currency: chargeCurrency/);
  });

  it("the button never formats the base-currency total again", () => {
    // `formatPriceDkk` ignores its argument's currency by design
    // (lib/format.ts) — its presence here is the bug, not a style choice.
    const body = stripComments(PANEL);
    expect(body).not.toContain("formatPriceDkk");
    expect(body, "the panel must not receive the ledger figure at all")
      .not.toMatch(/totalDkk/);
  });

  it("does not convert a second time when formatting", () => {
    // The server already converted. Passing an empty override defeats the
    // module-level FX cache, which `undefined` would consult — double
    // conversion would quietly halve or double the displayed amount.
    expect(stripComments(PANEL)).toMatch(/fxRateOverrides: \{ fetchedAt: "", rates: \{\} \}/);
  });
});

describe("a partial refund is sent in the currency Stripe charged", () => {
  const ACTIONS = read("app/admin/ordrer/actions.ts");

  it("loads the order's own snapshot", () => {
    const body = stripComments(ACTIONS);
    expect(body).toMatch(/currency: true/);
    expect(body).toMatch(/fxRate: true/);
  });

  it("converts the amount with that snapshot, not the live table", () => {
    // The order's rate, deliberately — an FX move between purchase and refund
    // must not change what the customer gets back. Same reasoning as the
    // webhook's amount check.
    expect(stripComments(ACTIONS)).toMatch(
      /Math\.round\(amountOere \* order\.fxRate\)/,
    );
  });

  it("sends the converted figure, not the raw one", () => {
    const body = stripComments(ACTIONS);
    expect(body).toMatch(/amountMinor: refundAmountInChargeCurrency|amountOere: refundAmountInChargeCurrency/);
  });

  it("still validates the request against the base-currency total", () => {
    // The ceiling check belongs in base units — that is what totalDkk is.
    // Converting before validating would compare two different scales.
    expect(stripComments(ACTIONS)).toMatch(/amountOere > order\.totalDkk/);
  });
});
