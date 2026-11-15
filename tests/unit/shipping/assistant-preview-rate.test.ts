import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The assistant's orders.create confirmation card shows the total the customer
 * confirms (Forbrugeraftaleloven §8). orders.create forwards shippingRateId to
 * createOrder (it extends checkoutSchema), so the card must price with the same
 * choice, or it shows the cheapest rate's total while the order charges another.
 * The route cannot be rendered here, so the seam is pinned in its source.
 */
describe("the assistant's order preview prices the chosen delivery option", () => {
  it("passes orders.create's shippingRateId into priceCart", () => {
    const src = readFileSync("app/api/assistant/chat/route.ts", "utf8");
    const preview = src.slice(src.indexOf('case "orders.create"'));
    const call = preview.slice(preview.indexOf("priceCart("), preview.indexOf("priceCart(") + 200);
    expect(call).toMatch(/rateId:\s*typeof a\.shippingRateId === "string"/);
  });
});
