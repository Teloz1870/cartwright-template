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
 * Rates come from the static `brand.policies.supportedCurrencies` rate-table
 * (unit-per-1-base-unit, e.g. 1 DKK = 0.134 EUR). Base currency has rate 1.
 *
 * NOTE — 2-decimal assumption: every currency in scope today (DKK/EUR/USD/GBP/
 * SEK/NOK) has a 2-decimal minor unit, so `baseMinor * rate` already yields the
 * target's minor units (the ÷100 and ×100 cancel). A zero-decimal currency
 * (JPY, ISK) or 3-decimal (BHD) would need exponent-aware handling before it is
 * added to the rate-table — guard added below rather than silently mis-charge.
 */

const ZERO_DECIMAL = new Set(["JPY", "KRW", "ISK", "HUF", "CLP", "VND"]);

/** The rate used to convert base → `currency` (1 for base / unknown currency). */
export function fxRate(currency: string): number {
  const base = brand.policies.currency;
  if (currency === base) return 1;
  const rates = brand.policies.supportedCurrencies ?? {};
  return rates[currency]?.rate ?? 1;
}

/**
 * Convert `baseMinor` (base-currency minor units) into `currency`'s minor units.
 * Returns `baseMinor` unchanged for the base currency or an unsupported code.
 */
export function convertMinor(baseMinor: number, currency: string): number {
  const base = brand.policies.currency;
  if (currency === base) return baseMinor;

  const entry = (brand.policies.supportedCurrencies ?? {})[currency];
  // Unsupported code (not in the rate-table) → charge in base. Defense-in-depth
  // against a manually-set cookie; getCheckoutCurrency already validates first.
  if (!entry) return baseMinor;

  // TODO(zero-decimal): once a 0-/3-decimal currency joins the rate-table, the
  // minor-unit exponent of base vs target stops cancelling — handle it here.
  if (ZERO_DECIMAL.has(currency) || ZERO_DECIMAL.has(base)) {
    throw new Error(
      `convertMinor: ${currency}/${base} is not 2-decimal; exponent-aware conversion not implemented`,
    );
  }

  return Math.round(baseMinor * entry.rate);
}
