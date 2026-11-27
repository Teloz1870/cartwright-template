import { describe, it, expect } from "vitest";
import {
  calcDiscount,
  calcPriceBreakdown,
  type DiscountInput,
} from "@/lib/pricing";

/**
 * Charge-path regression coverage for the DEFENSIVE clamps in
 * `calcDiscount` / `calcPriceBreakdown` (lib/pricing.ts) — the single source of
 * truth for what the customer is charged at checkout (lib/orders/create.ts feeds
 * the validated discount straight into `calcPriceBreakdown`).
 *
 * `pricing.test.ts` covers the happy paths (positive percent/fixed below 100%).
 * This file locks in the clamp branches that protect money correctness but are
 * otherwise untested, so a future refactor can't silently let a malformed
 * DiscountCode row mis-charge:
 *   - `Math.max(raw, 0)`  → a negative discount value can never INCREASE the total.
 *   - `Math.min(raw, subtotalDkk)` → a discount (incl. percent > 100%) can never
 *     exceed the subtotal, so the total never goes negative — at most the customer
 *     pays shipping only.
 * Same conservative lane as PR #329 (money-FX override hardening): additive,
 * test-only, no source change → byte-identical render.
 *
 * `value` is taken verbatim from a DiscountCode DB row via validateDiscountCode
 * (lib/discount.ts returns `record.value` unchanged), so an out-of-range or
 * negative column reaches this math directly — exactly what the clamps guard.
 */

describe("calcDiscount — defensive clamps (never mis-charge)", () => {
  it("clamps a negative FIXED discount to 0 (never increases the total)", () => {
    expect(calcDiscount(50000, { type: "fixed", value: -5000 })).toBe(0);
  });

  it("clamps a negative PERCENT discount to 0", () => {
    expect(calcDiscount(50000, { type: "percent", value: -10 })).toBe(0);
  });

  it("caps a PERCENT discount above 100% at the subtotal (never refunds more than the cart)", () => {
    expect(calcDiscount(50000, { type: "percent", value: 150 })).toBe(50000);
  });

  it("a PERCENT discount of exactly 100% equals the subtotal", () => {
    expect(calcDiscount(50000, { type: "percent", value: 100 })).toBe(50000);
  });

  it("yields 0 on a zero subtotal regardless of discount type", () => {
    expect(calcDiscount(0, { type: "percent", value: 10 })).toBe(0);
    expect(calcDiscount(0, { type: "fixed", value: 5000 })).toBe(0);
  });

  it("rounds a fractional PERCENT discount to nearest øre, both directions (locks Math.round, not floor/ceil)", () => {
    // 29994 * 10 / 100 = 2999.4 → round → 2999 (rules out ceil)
    expect(calcDiscount(29994, { type: "percent", value: 10 })).toBe(2999);
    // 29996 * 10 / 100 = 2999.6 → round → 3000 (rules out floor)
    expect(calcDiscount(29996, { type: "percent", value: 10 })).toBe(3000);
  });
});

describe("calcPriceBreakdown — total stays non-negative under adversarial discounts", () => {
  it("an over-100% PERCENT code zeroes the goods portion → total equals shipping only, never negative", () => {
    const result = calcPriceBreakdown(
      [{ unitPriceDkk: 20000, quantity: 1 }],
      { type: "percent", value: 150 },
    );
    expect(result.discountDkk).toBe(20000); // capped at subtotal
    // Assert total === shippingDkk (the goods portion is fully cancelled) rather than a
    // literal fee, so the case is independent of the free-shipping threshold config.
    expect(result.totalDkk).toBe(result.shippingDkk);
    expect(result.totalDkk).toBeGreaterThanOrEqual(0);
  });

  it("a FIXED discount larger than the subtotal is capped → total equals shipping only", () => {
    const result = calcPriceBreakdown(
      [{ unitPriceDkk: 12000, quantity: 1 }],
      { type: "fixed", value: 99999 },
    );
    expect(result.discountDkk).toBe(12000);
    expect(result.totalDkk).toBe(result.shippingDkk);
  });

  it("preserves the ledger invariant total = subtotal - discount + shipping for every case", () => {
    const cases: { lines: { unitPriceDkk: number; quantity: number }[]; discount: DiscountInput }[] = [
      { lines: [{ unitPriceDkk: 20000, quantity: 2 }], discount: { type: "percent", value: 25 } },
      { lines: [{ unitPriceDkk: 9900, quantity: 1 }], discount: { type: "fixed", value: -100 } },
      { lines: [{ unitPriceDkk: 60000, quantity: 1 }], discount: { type: "percent", value: 200 } },
      { lines: [{ unitPriceDkk: 5000, quantity: 3 }], discount: null },
    ];
    for (const { lines, discount } of cases) {
      const r = calcPriceBreakdown(lines, discount);
      expect(r.totalDkk).toBe(r.subtotalDkk - r.discountDkk + r.shippingDkk);
      expect(r.discountDkk).toBeLessThanOrEqual(r.subtotalDkk);
      expect(r.discountDkk).toBeGreaterThanOrEqual(0);
      expect(r.totalDkk).toBeGreaterThanOrEqual(r.shippingDkk);
    }
  });
});
