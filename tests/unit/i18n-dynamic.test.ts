import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ getLocale: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: mocks.getLocale }));

import { getDynamicTranslation } from "@/lib/i18n-dynamic";

// Engine base locale is "da" (brand.defaultLocale).
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
