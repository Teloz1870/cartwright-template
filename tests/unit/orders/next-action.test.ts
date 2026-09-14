import { describe, it, expect } from "vitest";
import {
  suggestNextActions,
  type NextActionInput,
} from "@/lib/orders/next-action";

/** Et neutralt udgangspunkt; hver test overrider kun det relevante felt. */
function base(overrides: Partial<NextActionInput> = {}): NextActionInput {
  return {
    status: "paid",
    ageDays: 0,
    hasSupplier: false,
    lowStock: false,
    openReturns: 0,
    hasStripePayment: true,
    ...overrides,
  };
}

function keys(input: NextActionInput): string[] {
  return suggestNextActions(input).map((a) => a.key);
}

describe("suggestNextActions — heuristics", () => {
  it("flags a payment-amount mismatch as urgent", () => {
    expect(keys(base({ status: "flagged_review" }))).toContain("review-mismatch");
  });

  it("flags a dispute deadline as urgent", () => {
    expect(keys(base({ status: "disputed" }))).toContain(
      "submit-dispute-evidence",
    );
  });

  it("surfaces open returns", () => {
    expect(keys(base({ openReturns: 2 }))).toContain("process-return");
  });

  it("warns when a paid order is overdue to ship", () => {
    expect(keys(base({ status: "paid", ageDays: 5 }))).toContain("ship-now");
  });

  it("suggests creating fulfillment for a fresh paid order with a supplier", () => {
    const k = keys(base({ status: "paid", ageDays: 0, hasSupplier: true }));
    expect(k).toContain("create-fulfillment");
    expect(k).not.toContain("ship-now");
  });

  it("suggests delivery follow-up for a long-shipped order", () => {
    expect(keys(base({ status: "shipped", ageDays: 14 }))).toContain(
      "follow-up-delivery",
    );
  });

  it("notes orders still awaiting payment", () => {
    expect(keys(base({ status: "pending_payment" }))).toContain(
      "awaiting-payment",
    );
  });

  it("notes low stock", () => {
    expect(keys(base({ lowStock: true }))).toContain("low-stock");
  });

  it("returns nothing for a fresh, healthy paid order", () => {
    expect(suggestNextActions(base({ status: "paid", ageDays: 0 }))).toEqual([]);
  });

  it("ranks urgent before warn before info", () => {
    const actions = suggestNextActions(
      base({ status: "flagged_review", openReturns: 1, lowStock: true }),
    );
    const severities = actions.map((a) => a.severity);
    // urgent (review-mismatch), warn (process-return), info (low-stock)
    expect(severities[0]).toBe("urgent");
    const firstInfo = severities.indexOf("info");
    const lastWarn = severities.lastIndexOf("warn");
    if (firstInfo !== -1 && lastWarn !== -1) {
      expect(lastWarn).toBeLessThan(firstInfo);
    }
  });
});
