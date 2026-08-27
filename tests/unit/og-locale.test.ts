import { describe, expect, it } from "vitest";
import { ogLocale } from "@/lib/og";

describe("ogLocale", () => {
  it("maps known locales to the underscore + region og:locale form", () => {
    expect(ogLocale("da")).toBe("da_DK");
    expect(ogLocale("en")).toBe("en_US");
    expect(ogLocale("de")).toBe("de_DE");
  });

  it("falls back to the bare locale for any unmapped code", () => {
    expect(ogLocale("fr")).toBe("fr");
    expect(ogLocale("")).toBe("");
  });

  it("uses the underscore form, not the hyphenated hreflang form", () => {
    // og:locale wants da_DK; hreflang (i18n/routing LOCALE_TAGS) wants da-DK.
    expect(ogLocale("da")).not.toContain("-");
  });
});
