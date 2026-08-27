import { describe, expect, it } from "vitest";
import {
  canonicalPublicPagePath,
  canonicalTrustRedirect,
  isTrustPageSourceSlug,
} from "@/lib/canonical-public-routes";

describe("legacy public trust routes", () => {
  it.each([
    ["/da/info/om-os", "/da/about"],
    ["/en/info/about", "/en/about"],
    ["/da/info/privacy", "/da/privacy"],
    ["/en/info/contact/", "/en/contact"],
  ])("maps %s to its predictable canonical route", (input, expected) => {
    expect(canonicalTrustRedirect(input, ["da", "en"])).toBe(expected);
  });

  it.each([
    "/info/privacy",
    "/fr/info/privacy",
    "/en/info/terms",
    "/en/info/privacy/extra",
  ])("leaves unrelated or not-yet-localized paths alone: %s", (input) => {
    expect(canonicalTrustRedirect(input, ["da", "en"])).toBeNull();
  });
});

describe("published CMS page paths", () => {
  it("maps legacy trust source slugs without publishing duplicate URLs", () => {
    expect(canonicalPublicPagePath("om-os", "en")).toBe("/en/about");
    expect(canonicalPublicPagePath("privacy", "da")).toBe("/da/privacy");
    expect(canonicalPublicPagePath("faq", "en")).toBe("/en/info/faq");
    expect(isTrustPageSourceSlug("om-os")).toBe(true);
    expect(isTrustPageSourceSlug("faq")).toBe(false);
  });
});
