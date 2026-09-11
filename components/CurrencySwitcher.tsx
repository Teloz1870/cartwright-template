"use client";

import { useTranslations } from "next-intl";

import { useCurrency } from "@/lib/currency-context";
import { brand } from "@/brand.config";

/**
 * Customer-facing currency-switcher dropdown.
 *
 * Render-gate (alle skal være sande):
 *   1. brand.features.currencySwitcher (compile-time)
 *   2. brand.policies.supportedCurrencies har ≥ 2 entries
 *   3. CurrencyProvider mounted i træet (else useCurrency returnerer
 *      defensiv-fallback og setter er no-op)
 *
 * UI: simpel <select> så vi får OS-native dropdown gratis (mobile-friendly,
 * keyboard-accessible, no JS bloat). Storefront-shops kan re-skinne via
 * Tailwind-classes på wrapping span.
 *
 * On-change: opdaterer cookie + lokal state → alle priser re-rendrer
 * via useCurrency() i ProductCard / PDP / cart / checkout. Ingen reload.
 */
export default function CurrencySwitcher({ className }: { className?: string }) {
  const { currency, setCurrency } = useCurrency();
  const t = useTranslations("Storefront");

  const features = brand.features as Record<string, boolean | undefined>;
  if (!features.currencySwitcher) return null;

  const supported = brand.policies.supportedCurrencies ?? {};
  const entries = Object.entries(supported);
  if (entries.length < 2) return null;

  return (
    <label
      className={
        className ??
        "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sol-muted"
      }
    >
      <span className="sr-only">{t("currencyLabel")}</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        aria-label={t("currencySelectAria")}
        className="rounded-md border border-sol-ink/15 bg-transparent px-2 py-1 text-xs font-bold text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
      >
        {entries.map(([code]) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </label>
  );
}
