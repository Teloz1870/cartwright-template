import { afterEach, describe, expect, it } from "vitest";

import { brand } from "@/brand.config";
import { convertMinor, fxRate, setFxRateOverrides } from "@/lib/money";

const base = brand.policies.currency.toUpperCase();
const supported = brand.policies.supportedCurrencies;
const targets = Object.keys(supported).filter((currency) => currency !== base);
const target = targets[0] ?? base;
const secondTarget = targets[1] ?? target;
const targetAnchor = supported[target]?.rate ?? 1;
const secondAnchor = supported[secondTarget]?.rate ?? 1;
const amount = 29_900;

afterEach(() => setFxRateOverrides(null));

describe("convertMinor", () => {
  it("returns the same amount for the configured base currency", () => {
    expect(convertMinor(amount, base)).toBe(amount);
  });

  it("converts via the configured rate-table and rounds to minor units", () => {
    expect(convertMinor(amount, target)).toBe(Math.round(amount * targetAnchor));
  });

  it("converts a second configured target without assuming a DKK base", () => {
    expect(convertMinor(amount, secondTarget)).toBe(
      Math.round(amount * secondAnchor),
    );
  });

  it("falls back to base for an unknown/unsupported currency", () => {
    expect(convertMinor(amount, "XXX")).toBe(amount);
  });

  it("handles zero", () => {
    expect(convertMinor(0, target)).toBe(0);
  });
});

describe("fxRate", () => {
  it("is 1 for the configured base currency", () => {
    expect(fxRate(base)).toBe(1);
  });

  it("returns the configured table rate for a supported target", () => {
    expect(fxRate(target)).toBe(targetAnchor);
  });

  it("falls back to 1 for an unknown currency", () => {
    expect(fxRate("XXX")).toBe(1);
  });

  it("prefers hydrated DB overrides over the static anchor", () => {
    const override = targetAnchor + 0.01;
    setFxRateOverrides({
      fetchedAt: "2026-06-05T12:00:00.000Z",
      rates: { [target]: override },
    });
    expect(fxRate(target)).toBe(override);
    expect(convertMinor(amount, target)).toBe(Math.round(amount * override));
  });

  it("falls back per currency when an override is missing", () => {
    setFxRateOverrides({
      fetchedAt: "2026-06-05T12:00:00.000Z",
      rates: { [target]: targetAnchor + 0.01 },
    });
    expect(fxRate(secondTarget)).toBe(secondAnchor);
  });

  it("can resolve from an explicit serialized override payload", () => {
    const override = targetAnchor + 0.01;
    const fxRateOverrides = {
      fetchedAt: "2026-06-05T12:00:00.000Z",
      rates: { [target]: override },
    };
    expect(fxRate(target, { fxRateOverrides })).toBe(override);
    expect(convertMinor(amount, target, { fxRateOverrides })).toBe(
      Math.round(amount * override),
    );
    expect(fxRate(target)).toBe(targetAnchor);
  });
});
