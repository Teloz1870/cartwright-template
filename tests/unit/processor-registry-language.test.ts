import { describe, expect, it } from "vitest";
import { brand } from "@/brand.config";

/**
 * The GDPR processor registry renders in exactly one place — `/admin/processors`
 * — and nowhere on the storefront. The admin is English by product decision, so
 * the registry's own prose has to be English too, for every shop including the
 * Danish canaries whose storefronts stay Danish.
 *
 * It shipped Danish: "Fejlovervågning", "Betalinger", "Alle kunde- og
 * ordredata". The page's chrome around it was already English, so an English
 * shop owner read an English table with Danish rows.
 *
 * This guard is deliberately narrow. It asserts nothing about storefront copy,
 * `messages/da.json`, or a Danish shop's own content — only about a registry
 * that has a single, English-by-design render site.
 */
describe("the GDPR processor registry speaks the admin's language", () => {
  const DANISH_LETTERS = /[æøåÆØÅ]/;
  const DANISH_WORDS =
    /\b(og|eller|ikke|valgfri|ingen|alle|data om|hosting af|billeder|kunde|ordre)\b/i;

  it("has a registry to check", () => {
    // Without this, an empty array would make every assertion below pass.
    expect(brand.policies.processors.length).toBeGreaterThan(0);
  });

  it.each(brand.policies.processors.map((p) => [p.name, p] as const))(
    "%s describes itself in English",
    (_name, processor) => {
      for (const field of ["purpose", "data"] as const) {
        const value = processor[field];
        expect(value, `${processor.name}.${field} is empty`).toBeTruthy();
        expect(
          DANISH_LETTERS.test(value),
          `${processor.name}.${field} contains Danish letters: ${value}`,
        ).toBe(false);
        expect(
          DANISH_WORDS.test(value),
          `${processor.name}.${field} reads as Danish: ${value}`,
        ).toBe(false);
      }
    },
  );
});
