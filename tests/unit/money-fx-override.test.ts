import { afterEach, describe, expect, it } from "vitest";

import { brand } from "@/brand.config";
import {
  convertMinor,
  fxRate,
  getFxRateOverridesSnapshot,
  setFxRateOverrides,
} from "@/lib/money";

const base = brand.policies.currency.toUpperCase();
const supported = brand.policies.supportedCurrencies as Record<
  string,
  { rate: number }
>;
const targets = Object.keys(supported).filter((currency) => currency !== base);
const target = targets[0] ?? base;
const secondTarget = targets[1] ?? target;
const anchor = supported[target]?.rate ?? 1;
const secondAnchor = supported[secondTarget]?.rate ?? 1;
const override = anchor + 0.01;
const amount = 29_900;

afterEach(() => setFxRateOverrides(null));

describe("setFxRateOverrides — malformed-rate sanitization", () => {
  for (const [label, badRate] of [
    ["negative", -5],
    ["zero", 0],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ] as const) {
    it(`drops a ${label} rate and falls back to the configured anchor`, () => {
      setFxRateOverrides({
        fetchedAt: "2026-06-23T00:00:00.000Z",
        rates: { [target]: badRate },
      });
      expect(fxRate(target)).toBe(anchor);
      expect(convertMinor(amount, target)).toBe(Math.round(amount * anchor));
    });
  }

  it("keeps valid entries while dropping invalid entries", () => {
    setFxRateOverrides({
      fetchedAt: "2026-06-23T00:00:00.000Z",
      rates: { [target]: override, [secondTarget]: -1 },
    });
    expect(fxRate(target)).toBe(override);
    expect(fxRate(secondTarget)).toBe(secondAnchor);
    expect(getFxRateOverridesSnapshot()?.rates).toEqual({ [target]: override });
  });
});

describe("currency-key and query normalization", () => {
  it("upper-cases and trims override keys", () => {
    setFxRateOverrides({
      fetchedAt: "2026-06-23T00:00:00.000Z",
      rates: { [`  ${target.toLowerCase()}  `]: override },
    });
    expect(fxRate(target)).toBe(override);
  });

  it("skips an empty override key", () => {
    setFxRateOverrides({
      fetchedAt: "2026-06-23T00:00:00.000Z",
      rates: { "   ": override, [target]: override },
    });
    expect(getFxRateOverridesSnapshot()?.rates).toEqual({ [target]: override });
  });

  it("normalizes target and configured base currency queries", () => {
    expect(fxRate(target.toLowerCase())).toBe(fxRate(target));
    expect(convertMinor(amount, `  ${target.toLowerCase()}  `)).toBe(
      convertMinor(amount, target),
    );
    expect(convertMinor(amount, base.toLowerCase())).toBe(amount);
    expect(fxRate(base.toLowerCase())).toBe(1);
  });
});

describe("override snapshot and precedence", () => {
  it("returns null without an override", () => {
    expect(getFxRateOverridesSnapshot()).toBeNull();
  });

  it("returns an isolated snapshot", () => {
    setFxRateOverrides({
      fetchedAt: "2026-06-23T00:00:00.000Z",
      rates: { [target]: override },
    });
    const snapshot = getFxRateOverridesSnapshot();
    snapshot!.rates[target] = 999;
    expect(fxRate(target)).toBe(override);
    expect(getFxRateOverridesSnapshot()?.rates[target]).toBe(override);
  });

  it("uses the hydrated cache unless explicit null requests the static anchor", () => {
    setFxRateOverrides({
      fetchedAt: "2026-06-23T00:00:00.000Z",
      rates: { [target]: override },
    });
    expect(fxRate(target)).toBe(override);
    expect(fxRate(target, { fxRateOverrides: null })).toBe(anchor);
    expect(convertMinor(amount, target, { fxRateOverrides: null })).toBe(
      Math.round(amount * anchor),
    );
  });

  it("clears a hydrated override", () => {
    setFxRateOverrides({
      fetchedAt: "2026-06-23T00:00:00.000Z",
      rates: { [target]: override },
    });
    setFxRateOverrides(null);
    expect(getFxRateOverridesSnapshot()).toBeNull();
    expect(fxRate(target)).toBe(anchor);
  });
});
