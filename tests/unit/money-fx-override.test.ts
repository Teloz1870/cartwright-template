import { afterEach, describe, it, expect } from "vitest";
import {
  convertMinor,
  fxRate,
  setFxRateOverrides,
  getFxRateOverridesSnapshot,
} from "@/lib/money";

// `lib/money.ts` is the single source of truth for charge math: the SAME
// `convertMinor`/`fxRate` path drives display, the Stripe charge amount, and the
// order's snapshotted rate (so display and charge can never drift). The happy
// paths live in `money.test.ts`. THIS table covers the defensive branches that
// protect a live customer from being mis-charged by a corrupt DB FX payload
// (`IntegrationSettings.fxRatesJson`, hydrated via `setFxRateOverrides`) or by a
// tampered currency cookie — the branches that are unreachable from the happy
// path but are exactly where a money bug would hide.
//
// Engine base = DKK; static anchors EUR=0.134, USD=0.145 (brand.config.ts).
// Base and every supported target are 2-decimal, so baseMinor*rate is already
// the target's minor units.

afterEach(() => {
  setFxRateOverrides(null);
});

// `normalizeRates` (run inside setFxRateOverrides) is the gate that decides which
// DB-supplied rates are trusted. A rate that fails the gate is DROPPED, and the
// resolver falls through to the safe static anchor — it must NEVER charge at a
// garbage rate. We assert the OBSERVABLE consequence (the resolved rate / amount),
// not the private function.
describe("setFxRateOverrides — malformed-rate sanitization (charge safety)", () => {
  it("drops a negative rate → falls back to the static anchor, never a negative charge", () => {
    setFxRateOverrides({ fetchedAt: "2026-06-23T00:00:00.000Z", rates: { EUR: -5 } });
    expect(fxRate("EUR")).toBe(0.134); // anchor, not -5
    const charged = convertMinor(29900, "EUR");
    expect(charged).toBe(4007); // == anchor result (299 * 0.134 → 4006.6 → 4007)
    // A negative rate in the DB-cache path is sanitized away, so the charge can
    // never be inverted. (The explicit-options resolver path trusts its caller and
    // is NOT re-sanitized here — production feeds it an already-cleaned payload via
    // lib/fx/rates.ts; see the explicit-null/precedence block below.)
    expect(charged).toBeGreaterThan(0);
  });

  it("drops a zero rate → static anchor (a 0 rate would zero out the charge)", () => {
    setFxRateOverrides({ fetchedAt: "2026-06-23T00:00:00.000Z", rates: { EUR: 0 } });
    expect(fxRate("EUR")).toBe(0.134);
    expect(convertMinor(29900, "EUR")).toBe(4007);
  });

  it("drops a NaN rate → static anchor", () => {
    setFxRateOverrides({ fetchedAt: "2026-06-23T00:00:00.000Z", rates: { EUR: Number.NaN } });
    expect(fxRate("EUR")).toBe(0.134);
  });

  it("drops an Infinity rate → static anchor", () => {
    setFxRateOverrides({
      fetchedAt: "2026-06-23T00:00:00.000Z",
      rates: { EUR: Number.POSITIVE_INFINITY },
    });
    expect(fxRate("EUR")).toBe(0.134);
  });

  it("keeps the valid entries while dropping the invalid ones in a mixed payload", () => {
    setFxRateOverrides({
      fetchedAt: "2026-06-23T00:00:00.000Z",
      rates: { EUR: 0.14, USD: -1 },
    });
    expect(fxRate("EUR")).toBe(0.14); // valid override applied
    expect(fxRate("USD")).toBe(0.145); // invalid dropped → USD anchor
    // The sanitized cache reflects only the trusted entry.
    expect(getFxRateOverridesSnapshot()?.rates).toEqual({ EUR: 0.14 });
  });
});

// DB keys arrive in whatever case/spacing the upstream FX source emitted.
// normalizeRates upper-cases + trims them on the way IN so the override actually
// resolves against the upper-cased lookup key.
describe("setFxRateOverrides — currency-key normalization", () => {
  it("upper-cases a lower-case override key so it still applies", () => {
    setFxRateOverrides({ fetchedAt: "2026-06-23T00:00:00.000Z", rates: { eur: 0.14 } });
    expect(fxRate("EUR")).toBe(0.14);
  });

  it("trims whitespace around an override key", () => {
    setFxRateOverrides({ fetchedAt: "2026-06-23T00:00:00.000Z", rates: { "  eur  ": 0.14 } });
    expect(fxRate("EUR")).toBe(0.14);
  });

  it("skips an empty / whitespace-only override key", () => {
    setFxRateOverrides({ fetchedAt: "2026-06-23T00:00:00.000Z", rates: { "   ": 0.14, EUR: 0.14 } });
    expect(getFxRateOverridesSnapshot()?.rates).toEqual({ EUR: 0.14 });
  });
});

// The QUERY side (the currency the caller asks for — a cookie/locale value)
// is normalized too, so a mis-cased or padded currency code resolves identically.
describe("convertMinor / fxRate — query-currency normalization", () => {
  it("treats a lower-case target like its upper-case form", () => {
    expect(fxRate("eur")).toBe(fxRate("EUR"));
    expect(convertMinor(29900, "eur")).toBe(convertMinor(29900, "EUR"));
  });

  it("trims whitespace around the target currency", () => {
    expect(convertMinor(29900, "  usd  ")).toBe(convertMinor(29900, "USD"));
  });

  it("treats a mis-cased base currency as the base (1:1 passthrough)", () => {
    expect(convertMinor(29900, "dkk")).toBe(29900);
    expect(fxRate("dkk")).toBe(1);
  });
});

// `getFxRateOverridesSnapshot` is serialized into client payloads and re-applied
// via the explicit-options resolver path. It MUST hand back an isolated copy so a
// consumer can't reach back and corrupt the server-side charge cache.
describe("getFxRateOverridesSnapshot — isolation", () => {
  it("returns null when no override is hydrated", () => {
    expect(getFxRateOverridesSnapshot()).toBeNull();
  });

  it("mutating the returned snapshot's rates does not corrupt the live cache", () => {
    setFxRateOverrides({ fetchedAt: "2026-06-23T00:00:00.000Z", rates: { EUR: 0.14 } });
    const snap = getFxRateOverridesSnapshot();
    expect(snap).not.toBeNull();
    // Tamper with the returned object…
    snap!.rates.EUR = 999;
    snap!.fetchedAt = "1999-01-01T00:00:00.000Z";
    // …the live resolver is unaffected.
    expect(fxRate("EUR")).toBe(0.14);
    expect(getFxRateOverridesSnapshot()?.rates.EUR).toBe(0.14);
  });
});

// The resolver distinguishes an absent options.fxRateOverrides (=> use the module
// cache) from an explicit `null` (=> bypass the cache, force the static anchor).
// This lets a caller deliberately resolve at the anchor even while a DB override
// is hydrated.
describe("resolver override precedence — explicit null vs module cache", () => {
  it("uses the hydrated module cache when options is absent", () => {
    setFxRateOverrides({ fetchedAt: "2026-06-23T00:00:00.000Z", rates: { EUR: 0.14 } });
    expect(fxRate("EUR")).toBe(0.14);
  });

  it("explicit null bypasses a hydrated cache and resolves at the static anchor", () => {
    setFxRateOverrides({ fetchedAt: "2026-06-23T00:00:00.000Z", rates: { EUR: 0.14 } });
    expect(fxRate("EUR", { fxRateOverrides: null })).toBe(0.134);
    expect(convertMinor(29900, "EUR", { fxRateOverrides: null })).toBe(4007);
  });

  it("setFxRateOverrides(null) clears a previously hydrated override", () => {
    setFxRateOverrides({ fetchedAt: "2026-06-23T00:00:00.000Z", rates: { EUR: 0.14 } });
    setFxRateOverrides(null);
    expect(getFxRateOverridesSnapshot()).toBeNull();
    expect(fxRate("EUR")).toBe(0.134);
  });
});
