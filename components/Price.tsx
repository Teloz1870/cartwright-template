"use client";

import { useCurrency } from "@/lib/currency-context";
import { formatPrice } from "@/lib/format";

/**
 * Display a price in the customer's selected currency.
 *
 * Client component der re-renderer når `useCurrency()` ændrer sig — så hele
 * storefront opdaterer instant når kunden vælger ny currency i headerens
 * switcher (ingen reload).
 *
 * `oere` er base-currency minor-units (øre for DKK, cents for EUR/USD).
 * Konvertering til target-currency sker i formatPrice() via static rate-
 * table i brand.policies.supportedCurrencies.
 *
 * Hvis brand.features.currencySwitcher=false: useCurrency returnerer base,
 * `<Price>` rendrer base-currency-pris uændret.
 *
 * Brug:
 *   <Price oere={p.priceDkk} />
 *   <Price oere={totalDkk} className="text-2xl font-black" />
 */
export function Price({
  oere,
  className,
  locale,
}: {
  oere: number;
  className?: string;
  /** Override Intl-locale. Default = auto-pick fra currency. */
  locale?: string;
}) {
  const { currency } = useCurrency();
  return (
    <span className={className}>{formatPrice(oere, { currency, locale })}</span>
  );
}
