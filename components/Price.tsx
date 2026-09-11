"use client";

import { useLocale } from "next-intl";

import { useCurrency } from "@/lib/currency-context";
import { formatPrice } from "@/lib/format";

/**
 * `useLocale()` THROWS without a NextIntlClientProvider — and in the production
 * build the error is minified to a message-less `Error(void 0)`, i.e. a blank
 * 500. Every current importer renders under `app/[locale]/layout.tsx`, so this
 * never fires today; the guard exists because `useCurrency()` one line below
 * deliberately keeps a provider-optional fallback for isolated renders
 * (lib/currency-context.tsx), and it would be a trap for `<Price>` to quietly
 * lose that property while looking like it still had it.
 *
 * The hook is called UNCONDITIONALLY — try/catch around it does not change hook
 * order, so the rules of hooks hold.
 */
function useOptionalLocale(): string | undefined {
  try {
    return useLocale();
  } catch {
    return undefined;
  }
}

/**
 * Display a price in the customer's selected currency.
 *
 * Client component der re-renderer når `useCurrency()` ændrer sig — så hele
 * storefront opdaterer instant når kunden vælger ny currency i headerens
 * switcher (ingen reload).
 *
 * `oere` er base-currency minor-units (øre for DKK, cents for EUR/USD).
 * Konvertering til target-currency sker i formatPrice() via samme effective
 * rate payload som server-layoutet primede fra DB, med static anchors som
 * fallback.
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
  /**
   * Override the Intl locale. Omitted ⇒ the READING locale of the page.
   *
   * It used to fall back to a locale derived from the CURRENCY, which is why a
   * DKK shop printed "119,00 kr." on /en: the money is Danish, the page is not.
   * The currency still decides the currency; the locale decides the language.
   */
  locale?: string;
}) {
  const { currency, fxRateOverrides } = useCurrency();
  const requestLocale = useOptionalLocale();
  return (
    <span className={className}>
      {formatPrice(oere, {
        currency,
        locale: locale ?? requestLocale,
        fxRateOverrides,
      })}
    </span>
  );
}
