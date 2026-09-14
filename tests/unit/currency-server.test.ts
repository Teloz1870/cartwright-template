import { describe, it, expect } from "vitest";
import { getCheckoutCurrency } from "@/lib/currency-server";
import { brand } from "@/brand.config";

// The safety contract that keeps default shops byte-identical: with
// multiCurrency OFF (the default), checkout must charge the BASE currency
// regardless of any presentment cookie. The helper short-circuits before it
// ever reads the cookie, so this needs no request scope / no mocks.
describe("getCheckoutCurrency", () => {
  it("returns the base currency when multiCurrency is off (default)", async () => {
    expect(brand.features.multiCurrency).toBe(false); // guard: testing the default
    await expect(getCheckoutCurrency()).resolves.toBe(brand.policies.currency);
  });
});
