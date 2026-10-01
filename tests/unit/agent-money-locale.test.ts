import { describe, expect, it } from "vitest";

import { agentMoney, formatPrice } from "@/lib/format";
import { convertMinor } from "@/lib/money";
import { brand } from "@/brand.config";

/**
 * The price an agent reads back to a shopper must be written in the shopper's
 * language, not the currency's.
 *
 * `formatPrice` maps DKK to da-DK by default, which is right for a Danish
 * shop and wrong the moment the same shop answers an English request: the
 * owner's own report that started this work was seeing "119,00 kr." on an
 * English page. `/api/products/search` resolves the request locale for its
 * URLs; the money has to travel with it.
 */
describe("agentMoney renders in the locale it is given", () => {
  // Intl separates symbol and amount with a NON-BREAKING space; comparing
  // against a typed literal without this fails on an invisible character.
  const plain = (s: string) => s.replace(/\u00a0/g, " ");
  const baseCurrency = brand.policies.currency;
  const targetCurrency = Object.keys(brand.policies.supportedCurrencies).find(
    (currency) => currency !== baseCurrency,
  )!;

  it("writes English money for an English request", () => {
    const money = agentMoney(14900, "en");
    expect(plain(money.formatted)).toBe(
      plain(formatPrice(14900, { currency: baseCurrency, locale: "en" })),
    );
    expect(money.amountMinor).toBe(14900);
    expect(money.currency).toBe(baseCurrency);
  });

  it("writes Danish money for a Danish request", () => {
    expect(plain(agentMoney(14900, "da").formatted)).toBe(
      plain(formatPrice(14900, { currency: baseCurrency, locale: "da" })),
    );
  });

  it("converts BOTH the amount and the label when given a currency", () => {
    // The trap this closes: returning base minor units under a presentment
    // currency code. `formatted` would look right while `amountMinor` — the
    // field a machine actually reads — was a different currency's number.
    const base = agentMoney(14900);
    const target = agentMoney(14900, "en", targetCurrency);
    expect(target.currency).toBe(targetCurrency);
    expect(target.amountMinor).not.toBe(base.amountMinor);
    expect(target.amountMinor).toBe(convertMinor(14900, targetCurrency));
    expect(target.formatted).toBe(
      formatPrice(14900, { currency: targetCurrency, locale: "en" }),
    );
  });

  it("still answers in base when no currency is given", () => {
    // Byte-identical for every shop with multiCurrency off — which is all of
    // them by default, and both Danish canaries.
    const money = agentMoney(14900, "en");
    expect(money.currency).toBe(brand.policies.currency);
    expect(money.amountMinor).toBe(14900);
  });

  it("converts BOTH the amount and the label when given a currency", () => {
    // The trap this closes: returning base minor units under a presentment
    // currency code. `formatted` would look right while `amountMinor` — the
    // field a machine actually reads — was a different currency's number.
    // A currency this shop is NOT denominated in, taken from its own table.
    // Naming EUR outright was fork-hostile: on a EUR-based shop the conversion
    // is a no-op, so "the two must differ" fails on a scaffold that did nothing
    // wrong. The engine's own defect, one file over from where I fixed it.
    const other = Object.keys(brand.policies.supportedCurrencies ?? {}).find(
      (c) => c !== brand.policies.currency,
    );
    if (!other) return; // single-currency shop: nothing to convert to

    const base = agentMoney(14900);
    const converted = agentMoney(14900, "en", other);
    expect(converted.currency).toBe(other);
    expect(converted.amountMinor).not.toBe(base.amountMinor);
    expect(converted.amountMinor).toBe(convertMinor(14900, other));
  });

  it("still answers in base when no currency is given", () => {
    // Byte-identical for every shop with multiCurrency off — which is all of
    // them by default, and both Danish canaries.
    const money = agentMoney(14900, "en");
    expect(money.currency).toBe(brand.policies.currency);
    expect(money.amountMinor).toBe(14900);
  });

  it("keeps the CURRENCY's default when no locale is given", () => {
    // Compared against the currency's own default rather than a typed "da-DK":
    // that literal is only the right answer while the base currency is DKK.
    // DEFAULT_LOCALE_FOR_CURRENCY maps EUR to en-IE and USD to en-US, so a
    // hardcoded da-DK made this assertion's LABEL false for any other shop.
    expect(agentMoney(14900).formatted).toBe(formatPrice(14900));
  });

  it("distinguishes the two — this test is worthless if they format alike", () => {
    expect(agentMoney(14900, "en").formatted).not.toBe(
      agentMoney(14900, "da").formatted,
    );
  });
});
