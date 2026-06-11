import { afterEach, describe, it, expect } from "vitest";
import { convertMinor, fxRate, setFxRateOverrides } from "@/lib/money";

afterEach(() => {
  setFxRateOverrides(null);
});

// convertMinor converts an amount in BASE-currency minor units (øre for the
// engine's DKK base) into the TARGET currency's minor units, using the static
// rate-table in brand.policies.supportedCurrencies. Engine base = DKK;
// EUR rate = 0.134, USD rate = 0.145. Both base and targets are 2-decimal, so
// minor * rate == target minor directly.
describe("convertMinor", () => {
  it("returns the same amount for the base currency", () => {
    expect(convertMinor(29900, "DKK")).toBe(29900);
  });

  it("converts to EUR via the rate-table and rounds to the nearest cent", () => {
    // 29900 øre = 299 DKK; 299 * 0.134 = 40.066 EUR = 4006.6 → 4007 cents
    expect(convertMinor(29900, "EUR")).toBe(4007);
  });

  it("converts to USD via the rate-table", () => {
    // 299 * 0.145 = 43.355 USD = 4335.5 → 4336 cents
    expect(convertMinor(29900, "USD")).toBe(4336);
  });

  it("falls back to base for an unknown/unsupported currency", () => {
    // XXX = ISO-4217 "no currency"; never in the rate-table.
    expect(convertMinor(29900, "XXX")).toBe(29900);
  });

  it("handles zero", () => {
    expect(convertMinor(0, "EUR")).toBe(0);
  });
});

describe("fxRate", () => {
  it("is 1 for the base currency", () => {
    expect(fxRate("DKK")).toBe(1);
  });

  it("returns the table rate for a supported currency", () => {
    expect(fxRate("EUR")).toBe(0.134);
  });

  it("falls back to 1 for an unknown currency", () => {
    expect(fxRate("XXX")).toBe(1);
  });

  it("prefers hydrated DB overrides over the static anchor", () => {
    setFxRateOverrides({
      fetchedAt: "2026-06-05T12:00:00.000Z",
      rates: { EUR: 0.14 },
    });

    expect(fxRate("EUR")).toBe(0.14);
    expect(convertMinor(29900, "EUR")).toBe(4186);
  });

  it("falls back per currency when an override is missing", () => {
    setFxRateOverrides({
      fetchedAt: "2026-06-05T12:00:00.000Z",
      rates: { EUR: 0.14 },
    });

    expect(fxRate("USD")).toBe(0.145);
    expect(convertMinor(29900, "USD")).toBe(4336);
  });

  it("can resolve from an explicit serialized override payload", () => {
    const fxRateOverrides = {
      fetchedAt: "2026-06-05T12:00:00.000Z",
      rates: { EUR: 0.14 },
    };

    expect(fxRate("EUR", { fxRateOverrides })).toBe(0.14);
    expect(convertMinor(29900, "EUR", { fxRateOverrides })).toBe(4186);
    expect(fxRate("EUR")).toBe(0.134);
  });
});
