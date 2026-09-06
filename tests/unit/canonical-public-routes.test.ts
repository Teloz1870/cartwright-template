import { describe, expect, it } from "vitest";
import {
  canonicalPublicPagePath,
  canonicalTrustRedirect,
  isTrustPageSourceSlug,
  publicPageSourceSlugs,
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

describe("the source-slug set a canonical route resolves", () => {
  /**
   * Pinned in ORDER, because the order IS the contract: the route reads the
   * first source that exists, so a reader that resolves them in another order
   * answers about a different row than the URL renders.
   */
  it("returns the aliases in the order the route reads them", () => {
    expect(publicPageSourceSlugs("about")).toEqual(["about", "om-os"]);
    expect(publicPageSourceSlugs("om-os")).toEqual(["about", "om-os"]);
    expect(publicPageSourceSlugs("contact")).toEqual(["contact"]);
    expect(publicPageSourceSlugs("privacy")).toEqual(["privacy"]);
  });

  it("passes an ordinary page slug straight through", () => {
    expect(publicPageSourceSlugs("faq")).toEqual(["faq"]);
  });

  /**
   * Page slugs are caller-supplied and every slug validator in the engine
   * allows `^[a-z0-9-]+$`, so `constructor` is a page a shop may legitimately
   * publish. On an object literal that lookup returns `Object` — a truthy
   * FUNCTION — which turned an ordinary page into a trust alias: the announced
   * URL became `/en/function Object() { [native code] }`, and the resolver
   * handed Prisma a function where it wanted a string (an anonymous 500).
   */
  it.each(["constructor", "__proto__", "hasownproperty", "tostring"])(
    "does not mistake the prototype key %s for a trust alias",
    (slug) => {
      expect(isTrustPageSourceSlug(slug)).toBe(false);
      expect(publicPageSourceSlugs(slug)).toEqual([slug]);
      expect(canonicalPublicPagePath(slug, "en")).toBe(`/en/info/${slug}`);
      expect(canonicalTrustRedirect(`/en/info/${slug}`, ["da", "en"])).toBeNull();
    },
  );
});
