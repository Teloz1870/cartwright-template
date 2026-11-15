import { describe, expect, it } from "vitest";
import { translatedField } from "@/lib/translated-field";
import { getIndustryTemplate } from "@/industry-templates";
import { orientSeedPages } from "@/industry-templates/seed-locale";
import { brand } from "@/brand.config";
import { routing } from "@/i18n/routing";

/**
 * POST-MERGE-VERIFIKATION af F11 (#528). Fixet kan ikke ses på demoen — den er
 * frosset til 3/9 — så det bevises mod motorens egen seed i stedet.
 */
describe("F11 post-merge: title AND body follow the requested locale", () => {
  // ORIENTED, as the seeders write it: the template is authored in English
  // (sourceLocale) with a Danish translation, and `orientSeedPage` rotates them
  // when the shop's base locale is Danish. Testing the raw template asserts a
  // shape no database ever holds — which is how my first attempt "failed".
  const template = getIndustryTemplate("coffee");
  const faq = orientSeedPages(template, brand.defaultLocale).find(
    (p) => p.slug === "faq",
  )!;
  // From the FIXTURE, not from brand.locales. The translation lives in the
  // coffee template; the shop's locale list is a different thing entirely, and
  // pairing them assumed `brand.locales[1]` happens to be the one locale the
  // template ships. No scaffold has reason to satisfy that — `create-cartwright`
  // makes single-locale ["en"] shops — so this failed on a fork that did nothing
  // wrong. Third time this session; the commit under main (#529) is the same
  // lesson.
  const other = Object.keys((faq.translations ?? {}) as Record<string, unknown>)[0];

  it("the fixture actually carries a translation (else this proves nothing)", () => {
    expect(faq).toBeDefined();
    expect((faq.translations as Record<string, unknown>)?.[other!]).toBeDefined();
  });

  it("title switches with the locale", () => {
    const base = translatedField(faq, "title", brand.defaultLocale, faq.title);
    const alt = translatedField(faq, "title", other!, faq.title);
    expect(base).toBe(faq.title);
    expect(alt).not.toBe(base);
  });

  it("body switches with the locale", () => {
    const base = translatedField(faq, "body", brand.defaultLocale, faq.body);
    const alt = translatedField(faq, "body", other!, faq.body);
    expect(alt).not.toBe(base);
    expect(alt.length).toBeGreaterThan(100);
  });

  it("a locale OUTSIDE brand.locales is clamped away", () => {
    // The guard that matters for an agent-supplied locale: an unknown one must
    // fall back to the source text, never to an arbitrary translations key.
    const bogus = translatedField(faq, "title", "zz-ZZ", faq.title);
    expect(bogus).toBe(faq.title);
    expect(routing.locales).not.toContain("zz-ZZ");
  });

  it("a prototype-named locale falls back to the source text", () => {
    // Honest about WHY: `translated-field.ts` uses `Object.hasOwn`, but that
    // guard's difference is NOT observable for a plain object — `asBag` already
    // rejects the function that `translations["constructor"]` returns, and
    // `Object.prototype` carries no string values for the inner lookup to hit.
    // Swapping hasOwn for `in` leaves every assertion here green, which I
    // verified rather than assumed. So this pins the OUTCOME (a weird locale
    // never replaces real copy) and does not claim to prove the mechanism.
    for (const weird of ["constructor", "toString", "valueOf", "__proto__"]) {
      expect(translatedField(faq, "title", weird, faq.title)).toBe(faq.title);
    }
  });

  it("a non-string translation value is ignored, not rendered", () => {
    // This one IS mechanism: the type check is what stops a number or an
    // object in the bag from reaching the page as copy.
    const poisoned = { title: "Base", translations: { xx: { title: 42 } } };
    expect(translatedField(poisoned, "title", "xx", "Base")).toBe("Base");
  });

  it("reads a translations bag that arrived as raw SQL text", () => {
    // The legacy $queryRaw paths return the JSON column as TEXT; without
    // asBag's string branch, translations silently never applied on exactly
    // the fallbacks that exist to keep those installs working.
    const asText = { title: "Base", translations: JSON.stringify({ xx: { title: "Oversat" } }) };
    expect(translatedField(asText, "title", "xx", "Base")).toBe("Oversat");
  });
});
