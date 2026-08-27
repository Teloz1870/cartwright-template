import { brand } from "@/brand.config";
import {
  convertMinor,
  type FxRatesOverridePayload,
} from "@/lib/money";

/**
 * Formatér et beløb i base-currency minor-units (øre for DKK, cents for
 * EUR/USD) til en lokaliseret valutastreng.
 *
 * Multi-currency: hvis caller giver `currency` der adskiller sig fra
 * `brand.policies.currency`, konverterer vi via samme resolver som checkout:
 * DB override ?? static rate-table i `brand.policies.supportedCurrencies`.
 *
 * Locale-aware: `Intl.NumberFormat(locale, { style: "currency" })` så vi får
 * korrekte separatorer + symbol-placering ("299,00 kr" for da-DK,
 * "$43.35" for en-US, "€39,90" for de-DE).
 *
 * Backwards-compat: `formatPriceDkk()` bevares som thin wrapper der bruger
 * brand.policies.currency som currency-arg. Eksisterende callere (admin,
 * email-templates) virker uændret.
 *
 * @param minorBase amount i base-currency minor-units (fx 29900 = 299 DKK)
 * @param opts.currency target currency (ISO-4217). Default = brand.policies.currency
 * @param opts.locale target Intl-locale (BCP-47). Default = "da-DK" for DKK, "en-US" for andre
 */
export type FormatPriceOptions = {
  currency?: string;
  locale?: string;
  fxRateOverrides?: FxRatesOverridePayload | null;
};

const DEFAULT_LOCALE_FOR_CURRENCY: Record<string, string> = {
  DKK: "da-DK",
  EUR: "en-IE", // neutral EUR-locale (Irland) der bruger "." for decimal
  USD: "en-US",
  GBP: "en-GB",
  SEK: "sv-SE",
  NOK: "nb-NO",
};

export function formatPrice(
  minorBase: number,
  opts: FormatPriceOptions = {},
): string {
  const baseCurrency = brand.policies.currency;
  const targetCurrency = opts.currency ?? baseCurrency;
  const locale =
    opts.locale ?? DEFAULT_LOCALE_FOR_CURRENCY[targetCurrency] ?? "en-US";

  // Konvertér via samme rate-table som checkout bruger (lib/money.ts) så det
  // viste beløb er præcis det kunden opkræves — display og charge deler kode.
  const majorTarget =
    convertMinor(minorBase, targetCurrency, {
      fxRateOverrides: opts.fxRateOverrides,
    }) / 100;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: targetCurrency,
      currencyDisplay: "symbol",
    }).format(majorTarget);
  } catch {
    // Fallback hvis Intl rejicerer unknown currency-kode
    const symbol = targetCurrency === "DKK" ? "kr" : targetCurrency;
    return `${majorTarget.toFixed(2)} ${symbol}`;
  }
}

/**
 * Backwards-compat wrapper. Eksisterende admin + email-templates kalder
 * stadig formatPriceDkk() — den respekterer brand.policies.currency så
 * en EUR-baseret fork også får korrekt output uden code-change.
 *
 * Navnet bevares fordi storefront-priser i DB er gemt som "øre" historisk;
 * en breaking-rename til formatBaseAmount() kan komme i en senere PR.
 */
export function formatPriceDkk(oere: number): string {
  return formatPrice(oere);
}

/**
 * Money as an AI agent should receive it: the machine-readable minor-unit
 * amount, the ISO-4217 code it is denominated in, and the exact string a
 * human sees on the page. Introduced for the WebMCP tool surface, where a
 * bare `subtotalDkk` field hardcoded the currency into the field NAME and
 * left the agent no way to read which currency it actually was.
 *
 * `amountMinor` is in the BASE currency (`brand.policies.currency`), same
 * unit as every `*Dkk` column — deliberately NOT converted to a presentment
 * currency: the agent gets the amount the shop charges in, and `formatted`
 * renders it with the same `formatPrice` path the storefront uses.
 */
export type AgentMoney = {
  amountMinor: number;
  currency: string;
  formatted: string;
};

export function agentMoney(minorBase: number): AgentMoney {
  return {
    amountMinor: minorBase,
    currency: brand.policies.currency,
    formatted: formatPrice(minorBase),
  };
}
