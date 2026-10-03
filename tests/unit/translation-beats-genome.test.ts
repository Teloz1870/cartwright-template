import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { brandCopyTranslation } from "@/lib/brand-copy";
import { brand } from "@/brand.config";

/**
 * Precedence between two sources that both claim a copy field.
 *
 * The Resolvable Genome resolves ONE string per field — `readField` takes a
 * key, not a locale — so on a shop with `genomeResolve` on it shadowed the
 * shop's own per-locale translations entirely. Measured on the eyewear canary
 * after `copyTranslations` was supplied: /en still rendered "Alle rettigheder
 * forbeholdes", because the Danish genome value won the race.
 *
 * The rule is SPECIFICITY: a value written for this exact locale beats one
 * written for no locale at all. The property that makes it safe is that it can
 * only ever ADD languages — on the default locale, and on any shop supplying
 * no translations, this returns undefined and the genome still wins.
 */
describe("an explicit per-locale translation outranks a locale-blind source", () => {
  const withTranslations = (table: Record<string, Record<string, string>>) =>
    vi.spyOn(brand as unknown as { copyTranslations: unknown }, "copyTranslations", "get")
      .mockReturnValue(table);

  it("returns the translation when the shop supplies one", () => {
    const other = brand.locales.find((l) => l !== brand.defaultLocale);
    if (!other) return; // single-locale shop: nothing to outrank
    const spy = withTranslations({ [other]: { "footer.disclaimer": "All rights reserved." } });
    expect(brandCopyTranslation("footer.disclaimer", other)).toBe("All rights reserved.");
    spy.mockRestore();
  });

  it("returns undefined for the DEFAULT locale, so the genome keeps winning", () => {
    // The safety property: this cannot change what a single-locale shop or a
    // base-locale page renders. Note the table DOES contain the default
    // locale — if that were ever honoured, this assertion fails.
    const spy = withTranslations({
      [brand.defaultLocale]: { "footer.disclaimer": "MUST NEVER RENDER" },
    });
    expect(brandCopyTranslation("footer.disclaimer", brand.defaultLocale)).toBeUndefined();
    spy.mockRestore();
  });

  it("returns undefined when the shop supplies no table at all", () => {
    const spy = withTranslations({});
    expect(brandCopyTranslation("footer.disclaimer", "en")).toBeUndefined();
    spy.mockRestore();
  });

  it("returns undefined for a path the shop did not translate", () => {
    const other = brand.locales.find((l) => l !== brand.defaultLocale);
    if (!other) return;
    const spy = withTranslations({ [other]: { "footer.tagline": "x" } });
    expect(brandCopyTranslation("footer.disclaimer", other)).toBeUndefined();
    spy.mockRestore();
  });

  it("treats an empty string as no translation", () => {
    const other = brand.locales.find((l) => l !== brand.defaultLocale);
    if (!other) return;
    const spy = withTranslations({ [other]: { "footer.disclaimer": "   " } });
    // Whitespace is not a translation; falling through beats rendering blank.
    expect(brandCopyTranslation("footer.disclaimer", other)?.trim() || undefined)
      .toBeUndefined();
    spy.mockRestore();
  });

  it("the Footer consults the translation BEFORE the genome", () => {
    // The ordering is the whole fix, and it is one line to get backwards.
    const src = readFileSync(join(process.cwd(), "components/Footer.tsx"), "utf8");
    const translationAt = src.indexOf("brandCopyTranslation(path, locale)");
    const genomeAt = src.indexOf("readField(path)");
    expect(translationAt).toBeGreaterThan(-1);
    expect(genomeAt).toBeGreaterThan(-1);
    expect(translationAt, "the genome is consulted first again").toBeLessThan(genomeAt);
  });
});
