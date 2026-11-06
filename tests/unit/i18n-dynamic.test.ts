import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ getLocale: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: mocks.getLocale }));

// Pin the base locale so this test is independent of the shipped brand.config:
// the engine is da-default but a website-corporate scaffold is en-default, and
// without this pin the "translation present" case breaks when the requested
// locale (en) equals defaultLocale. Only defaultLocale is overridden — every
// other brand field stays real.
vi.mock("@/brand.config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/brand.config")>();
  return { ...actual, brand: { ...actual.brand, defaultLocale: "da" } };
});

import { getDynamicTranslation } from "@/lib/i18n-dynamic";

// Pinned base locale is "da" (see the brand.config mock above).
const entity = { title: "Om os", translations: { en: { title: "About" } } };

describe("getDynamicTranslation", () => {
  beforeEach(() => mocks.getLocale.mockReset());

  it("returns the base field for the base locale", async () => {
    mocks.getLocale.mockResolvedValue("da");
    expect(await getDynamicTranslation(entity, "title")).toBe("Om os");
  });

  it("returns the locale translation when present", async () => {
    mocks.getLocale.mockResolvedValue("en");
    expect(await getDynamicTranslation(entity, "title")).toBe("About");
  });

  it("falls back to base/fallback when the locale translation is missing", async () => {
    mocks.getLocale.mockResolvedValue("en");
    // No translations.en.body → falls back to the provided fallback.
    expect(await getDynamicTranslation(entity, "body", "fallback")).toBe("fallback");
  });
});
