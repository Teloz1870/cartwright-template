import { describe, expect, it } from "vitest";
import { isSupportedLocale, routing } from "@/i18n/routing";

describe("dynamic locale routing", () => {
  it("accepts every locale configured by the brand", () => {
    for (const locale of routing.locales) {
      expect(isSupportedLocale(locale)).toBe(true);
    }
  });

  it("rejects removed discovery routes and arbitrary path segments as locales", () => {
    expect(isSupportedLocale("openapi.json")).toBe(false);
    expect(isSupportedLocale("api")).toBe(false);
    expect(isSupportedLocale("unknown-path")).toBe(false);
  });
});
