import "server-only";

import { cookies } from "next/headers";
import { brand } from "@/brand.config";
import { CURRENCY_COOKIE_NAME } from "@/lib/currency-shared";

/**
 * Server-side reader for kunde-valgt currency.
 *
 * Cookie: `cw_currency=EUR` etc. Sat client-side af CurrencySwitcher når
 * kunden vælger. SSR'ed siders renderer skal bruge denne så HTML matcher
 * post-hydration state (ingen flash-of-wrong-currency).
 *
 * Mirror pattern fra `lib/consent-server.ts` (Phase 10).
 *
 * Hvis:
 *   - features.currencySwitcher: false → ignorér cookie, returnér base
 *   - cookie ikke sat → returnér brand.policies.currency
 *   - cookie peger på unknown currency → returnér base (defense-in-depth
 *     mod manuelt sat cookie)
 */
export async function getCurrency(): Promise<string> {
  const features = brand.features as Record<string, boolean | undefined>;
  const base = brand.policies.currency;

  if (!features.currencySwitcher) return base;

  const supported = brand.policies.supportedCurrencies ?? {};
  const supportedKeys = Object.keys(supported);
  if (supportedKeys.length <= 1) return base;

  try {
    const store = await cookies();
    const raw = store.get(CURRENCY_COOKIE_NAME)?.value;
    if (!raw) return base;
    return supportedKeys.includes(raw) ? raw : base;
  } catch {
    return base;
  }
}

/**
 * Presentment currency for CHECKOUT (what the customer is actually charged).
 *
 * Distinct from `getCurrency()`, which is display-only and gated on
 * `currencySwitcher`. Charging in a non-base currency is the stronger,
 * opt-in behavior gated on `multiCurrency` (which dependsOn `currencySwitcher`).
 * When `multiCurrency` is off we return base WITHOUT reading the cookie, so a
 * display-only shop keeps charging base and default shops are byte-identical.
 */
export async function getCheckoutCurrency(): Promise<string> {
  const features = brand.features as Record<string, boolean | undefined>;
  if (!features.multiCurrency) return brand.policies.currency;
  return getCurrency();
}
