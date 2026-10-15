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
  // The reading locale wins when the caller knows it. The currency-derived
  // default stays as the LAST resort — it is what every context with no
  // request has (email, cron, the admin, agent tool output) — but it must not
  // decide the language of a page: a DKK shop rendered "119,00 kr." on /en for
  // as long as it was the only rule.
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
    // Fallback hvis Intl rejicerer unknown currency-kode.
    //
    // This swallow became load-bearing the moment `locale` started being
    // threaded from call sites: a malformed tag ("da_DK" with an underscore)
    // is a RangeError, and silently returning a DIFFERENTLY formatted string
    // ("119.00 kr" — no thousands separator, no trailing period) turns a typo
    // into a cosmetic mystery instead of a failure. Retrying without the
    // caller's locale keeps a bad tag from degrading the format, and the
    // currency fallback below still covers a genuinely unknown currency.
    if (opts.locale) {
      try {
        return new Intl.NumberFormat(
          DEFAULT_LOCALE_FOR_CURRENCY[targetCurrency] ?? "en-US",
          { style: "currency", currency: targetCurrency, currencyDisplay: "symbol" },
        ).format(majorTarget);
      } catch {
        // fall through to the symbol fallback
      }
    }
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
 *
 * The second parameter is an OBJECT, deliberately, even though only `locale`
 * is readable through it. A bare positional `locale?: string` would make
 * `formatPriceDkk(89900, "DKK")` type-check — both are `string` — and Intl
 * does not reject it either: a three-letter code is a valid language subtag,
 * so it silently falls back to the runtime default and renders `DKK 899.00`
 * on /da. With an object, that mistake is a type error.
 */
export function formatPriceDkk(
  oere: number,
  opts: Pick<FormatPriceOptions, "locale"> = {},
): string {
  return formatPrice(oere, opts);
}

/**
 * Money as an AI agent should receive it: the machine-readable minor-unit
 * amount, the ISO-4217 code it is denominated in, and the exact string a
 * human sees on the page. Introduced for the WebMCP tool surface, where a
 * bare `subtotalDkk` field hardcoded the currency into the field NAME and
 * left the agent no way to read which currency it actually was.
 *
 * All three fields describe THE SAME money in ONE currency: the one the
 * customer will actually be charged in.
 *
 * That used to be pinned to the base currency, with the rationale that the
 * agent should get "the amount the shop charges in". True while
 * `multiCurrency` is off — base IS the charge currency then — and false the
 * moment it is on: the page shows the presentment amount, Stripe charges the
 * presentment amount, and only the agent was still quoting base. Callers pass
 * the charge currency (`getCheckoutCurrency()`); omitting it keeps base, which
 * is byte-identical for every shop with the flag off.
 */
export type AgentMoney = {
  amountMinor: number;
  currency: string;
  formatted: string;
};

/**
 * @param minorBase amount in BASE-currency minor units (what the `*Dkk`
 *   columns hold). Converted to `currency` on the way out.
 * @param locale BCP-47 locale to render `formatted` in. Omit for the shop's
 *   currency default (da-DK for DKK). PASS IT whenever the caller knows which
 *   language the reader is in: without it an English request to a DKK shop got
 *   `149,00 kr.` — the Danish decimal convention quoted back to an English
 *   shopper by an agent, which is the defect that started this work.
 * @param currency the currency the customer is CHARGED in — from
 *   `getCheckoutCurrency()`. Omit for the shop's base currency.
 *
 * `amountMinor` is converted along with `formatted`, deliberately: returning
 * base minor units under a presentment currency code would be worse than not
 * converting at all, because it reads as authoritative machine data.
 */
export function agentMoney(
  minorBase: number,
  locale?: string,
  currency?: string,
): AgentMoney {
  const target = currency ?? brand.policies.currency;
  return {
    amountMinor: convertMinor(minorBase, target),
    currency: target,
    formatted: formatPrice(minorBase, {
      currency: target,
      ...(locale ? { locale } : {}),
    }),
  };
}
