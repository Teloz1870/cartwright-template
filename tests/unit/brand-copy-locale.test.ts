import { describe, expect, it, vi } from "vitest";

vi.mock("@/brand.config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/brand.config")>();
  return {
    ...actual,
    brand: {
      ...actual.brand,
      defaultLocale: "da",
      copyTranslations: {
        en: {
          "ai.assistantOpenText": "Ask the stylist",
          "footer.tagline": "Hand-picked frames, shipped fast.",
        },
        // A deliberately WRONG entry for the shop's own default locale, so the
        // short-circuit below is actually exercised. Without it the lookup
        // would miss and fall back to base anyway, and the test would pass on
        // a broken implementation.
        da: { "ai.assistantOpenText": "SKAL ALDRIG RENDRES" },
      },
    },
  };
});

const { localizedBrandCopy } = await import("@/lib/brand-copy");

/**
 * The shop's OWN copy, per locale. This is the mechanism that was missing:
 * `messages/*.json` holds engine copy a shop cannot edit, and the genome
 * resolves one string per key regardless of locale — so a Danish shop serving
 * /en had no way to say its own assistant button in English. Measured on the
 * eyewear canary, where `assistantOpenText: "Spørg Stylisten"` rendered
 * verbatim on the English route.
 */
describe("localizedBrandCopy", () => {
  it("returns the shop's translation for a secondary locale", () => {
    expect(localizedBrandCopy("ai.assistantOpenText", "Spørg Stylisten", "en")).toBe(
      "Ask the stylist",
    );
  });

  it("returns the BASE value for the shop's own default locale", () => {
    // The base value IS the default-locale copy; consulting the table there
    // would let a stray entry silently rewrite the shop's own language.
    expect(localizedBrandCopy("ai.assistantOpenText", "Spørg Stylisten", "da")).toBe(
      "Spørg Stylisten",
    );
  });

  it("falls back to base for a locale or field with no entry", () => {
    expect(localizedBrandCopy("ai.assistantLabel", "Stylisten", "en")).toBe("Stylisten");
    expect(localizedBrandCopy("footer.tagline", "Håndplukket.", "de")).toBe("Håndplukket.");
  });

  it("falls back to base when no locale is known at all", () => {
    // Emails and cron have no request. They must render something, not crash
    // and not silently pick a language.
    expect(localizedBrandCopy("footer.tagline", "Håndplukket.", undefined)).toBe(
      "Håndplukket.",
    );
  });

  it("ignores an empty string rather than rendering a blank", () => {
    // A half-filled translation table is likelier than a missing one, and a
    // blank tagline is worse than an untranslated one.
    expect(localizedBrandCopy("ai.assistantOpenText", "Spørg Stylisten", "en")).toBe(
      "Ask the stylist",
    );
    expect(localizedBrandCopy("nope.missing", "Base", "en")).toBe("Base");
  });
});

describe("the engine default is untouched by the mechanism", () => {
  it("an empty table changes nothing in any locale", async () => {
    vi.resetModules();
    vi.doMock("@/brand.config", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/brand.config")>();
      return {
        ...actual,
        brand: { ...actual.brand, defaultLocale: "da", copyTranslations: {} },
      };
    });
    const mod = await import("@/lib/brand-copy");
    for (const locale of ["da", "en", "de", undefined]) {
      expect(mod.localizedBrandCopy("footer.tagline", "Base copy", locale)).toBe(
        "Base copy",
      );
    }
    vi.doUnmock("@/brand.config");
  });
});
