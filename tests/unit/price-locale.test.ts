import { describe, expect, it } from "vitest";

import { formatPrice, formatPriceDkk } from "@/lib/format";
import { brand } from "@/brand.config";

/**
 * Money formatting follows the READING locale, not the currency.
 *
 * A DKK shop rendered "119,00 kr." on /en for as long as the Intl locale was
 * derived from `brand.policies.currency` alone. The currency is still the
 * currency — the shop charges DKK either way — but the SEPARATORS and symbol
 * placement belong to the language of the page.
 */
describe("formatPrice follows the reading locale", () => {
  it("renders Danish money in English on an English page", () => {
    // The separator between amount and symbol is U+00A0 in both, spelled out
    // here so a test that "looks equal" cannot pass on the wrong bytes.
    expect(formatPrice(11900, { locale: "en" })).toBe(
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: brand.policies.currency,
      }).format(119),
    );
    expect(formatPrice(11900, { locale: "da" })).toBe(
      new Intl.NumberFormat("da", {
        style: "currency",
        currency: brand.policies.currency,
      }).format(119),
    );
  });

  it("leaves the BASE currency byte-identical on /da \u2014 the canary guarantee", () => {
    // What every cookieless visitor to the three live canaries sees. If this
    // drifts, three shops change on deploy. Checked across magnitudes rather
    // than on one lucky value; `da` and `da-DK` are byte-equal for DKK
    // including the U+00A0 \u2014 measured, not assumed.
    for (const minor of [0, 1, 99, 100, 12345, 89900, 100000, 99999999]) {
      expect(
        formatPrice(minor, { currency: "DKK", locale: "da" }),
        `DKK ${minor} drifts on /da`,
      ).toBe(formatPrice(minor, { currency: "DKK" }));
    }
  });

  it("DOES change the switched currencies on /da \u2014 deliberately", () => {
    // Disclosed, not hidden. The old rule picked the locale from the CURRENCY,
    // so a Danish visitor who switched to EUR got Irish-English formatting on
    // a Danish page: "\u20ac899.00". They now get Danish formatting of euros,
    // "899,00\u00a0\u20ac", which is the correction this change exists to make. It is
    // reachable only behind the currency switcher (cookie), so the cookieless
    // canary render above is unaffected.
    // Asserted as a PROPERTY, not a literal: the amount runs through the FX
    // table (899 DKK is not 899 EUR), and pinning the converted number would
    // make this test fail every time a rate moves — a false red on correct
    // code, which is how gates get deleted.
    const daEur = formatPrice(89900, { currency: "EUR", locale: "da" });
    const defaultEur = formatPrice(89900, { currency: "EUR" });
    expect(daEur).not.toBe(defaultEur);
    expect(daEur.endsWith("\u20ac"), `Danish puts the symbol last: ${daEur}`).toBe(true);
    expect(daEur).toMatch(/\d,\d\d\u00a0\u20ac$/); // comma decimals
    expect(
      defaultEur.startsWith("\u20ac"),
      `en-IE puts it first: ${defaultEur}`,
    ).toBe(true);
    expect(formatPrice(89900, { currency: "USD", locale: "da" })).not.toBe(
      formatPrice(89900, { currency: "USD" }),
    );
  });

  it("actually changes /en — otherwise the whole change is a no-op", () => {
    for (const minor of [99, 12345, 89900]) {
      expect(formatPrice(minor, { locale: "en" })).not.toBe(
        formatPrice(minor, { locale: "da" }),
      );
    }
  });

  it("formatPriceDkk carries the locale through", () => {
    expect(formatPriceDkk(11900, { locale: "en" })).toBe(
      formatPrice(11900, { locale: "en" }),
    );
    expect(formatPriceDkk(11900)).toBe(formatPrice(11900));
  });

  it("a malformed locale tag degrades to the default FORMAT, not a different one", () => {
    // "da_DK" (underscore) is a RangeError. The old catch answered with a
    // differently shaped string — "119.00 kr", no thousands separator, no
    // trailing period — so a typo became a cosmetic mystery. It must fall back
    // to the format the shop would otherwise have rendered.
    expect(formatPriceDkk(11900, { locale: "da_DK" })).toBe(formatPriceDkk(11900));
    expect(formatPrice(1234567, { locale: "da_DK" })).toBe(formatPrice(1234567));
  });

  it("an unknown currency still reaches the symbol fallback", () => {
    // The retry must not swallow the currency failure: a bad CURRENCY throws
    // in both attempts and has to land on the plain-symbol string.
    expect(formatPrice(11900, { currency: "XYZ", locale: "en" })).toContain("XYZ");
  });
});
