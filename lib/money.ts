import { brand } from "@/brand.config";

/**
 * Multi-currency conversion — the single source of truth for turning a
 * base-currency amount into a presentment-currency amount.
 *
 * Prices in the DB are stored as base-currency minor units (øre for DKK, cents
 * for an EUR/USD-based fork — see `brand.policies.currency`). `formatPrice`
 * uses this for *display*; checkout uses it to charge the customer in their
 * selected currency and to snapshot the rate on the order. Display and charge
 * math therefore share one code path → they can never drift.
 *
 * Rates resolve as DB override ?? static `brand.policies.supportedCurrencies`
 * anchor (unit-per-1-base-unit, e.g. 1 DKK = 0.134 EUR). Base currency has
 * rate 1. This module stays sync/client-safe; server code hydrates the override
 * cache from IntegrationSettings.fxRatesJson before storefront render/checkout
 * work, and serialized client payloads use the same resolver.
 *
 * NOTE — 2-decimal assumption: every currency in scope today (DKK/EUR/USD/GBP/
 * SEK/NOK) has a 2-decimal minor unit, so `baseMinor * rate` already yields the
 * target's minor units (the ÷100 and ×100 cancel). A zero-decimal currency
 * (JPY, ISK) or 3-decimal (BHD) would need exponent-aware handling before it is
 * added to the rate-table — guard added below rather than silently mis-charge.
 */

const ZERO_DECIMAL = new Set(["JPY", "KRW", "ISK", "HUF", "CLP", "VND"]);

export type FxRatesOverridePayload = {
  fetchedAt: string;
  base?: string;
  source?: string;
  rates: Record<string, number>;
};

export type FxRateResolverOptions = {
  fxRateOverrides?: FxRatesOverridePayload | null;
};

let fxRateOverrides: FxRatesOverridePayload | null = null;

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function normalizeRates(
  rates: Record<string, number> | null | undefined,
): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (const [rawCurrency, rawRate] of Object.entries(rates ?? {})) {
    const currency = normalizeCurrency(rawCurrency);
    if (!currency) continue;
    if (!Number.isFinite(rawRate) || rawRate <= 0) continue;
    normalized[currency] = rawRate;
  }
  return normalized;
}

export function setFxRateOverrides(
  payload: FxRatesOverridePayload | null,
): void {
  fxRateOverrides = payload
    ? {
        ...payload,
        rates: normalizeRates(payload.rates),
      }
    : null;
}

export function getFxRateOverridesSnapshot(): FxRatesOverridePayload | null {
  return fxRateOverrides
    ? { ...fxRateOverrides, rates: { ...fxRateOverrides.rates } }
    : null;
}

function staticFxRate(currency: string): number {
  const rates = brand.policies.supportedCurrencies ?? {};
  return rates[currency]?.rate ?? 1;
}

function resolvedFxRate(
  currency: string,
  options: FxRateResolverOptions = {},
): number {
  const base = normalizeCurrency(brand.policies.currency);
  const target = normalizeCurrency(currency);
  if (target === base) return 1;
  const overrides =
    options.fxRateOverrides === undefined
      ? fxRateOverrides
      : options.fxRateOverrides;
  return overrides?.rates[target] ?? staticFxRate(target);
}

/** The rate used to convert base → `currency` (1 for base / unknown currency). */
export function fxRate(
  currency: string,
  options: FxRateResolverOptions = {},
): number {
  return resolvedFxRate(currency, options);
}

/**
 * Convert `baseMinor` (base-currency minor units) into `currency`'s minor units.
 * Returns `baseMinor` unchanged for the base currency or an unsupported code.
 */
export function convertMinor(
  baseMinor: number,
  currency: string,
  options: FxRateResolverOptions = {},
): number {
  const base = normalizeCurrency(brand.policies.currency);
  const target = normalizeCurrency(currency);
  if (target === base) return baseMinor;

  const entry = (brand.policies.supportedCurrencies ?? {})[target];
  // Unsupported code (not in the rate-table) → charge in base. Defense-in-depth
  // against a manually-set cookie; getCheckoutCurrency already validates first.
  if (!entry) return baseMinor;

  // TODO(zero-decimal): once a 0-/3-decimal currency joins the rate-table, the
  // minor-unit exponent of base vs target stops cancelling — handle it here.
  if (ZERO_DECIMAL.has(target) || ZERO_DECIMAL.has(base)) {
    throw new Error(
      `convertMinor: ${target}/${base} is not 2-decimal; exponent-aware conversion not implemented`,
    );
  }

  return Math.round(baseMinor * resolvedFxRate(target, options));
}
