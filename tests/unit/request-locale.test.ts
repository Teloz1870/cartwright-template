import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["da", "en"], defaultLocale: "da" },
}));

const { resolveRequestLocale } = await import("@/lib/request-locale");

const req = (url: string, referer?: string) =>
  new Request(url, referer ? { headers: { referer } } : undefined);

/**
 * The live defect: an agent on https://demo.cartwright.app/en searched and got
 * back /da/product/... links, because the URL was built from a store-wide
 * default that a stale BrandingSettings row had set to "da" — while the router
 * redirects / to /en. The conversation switched language mid-flow.
 */
describe("resolveRequestLocale", () => {
  it("prefers an explicit ?locale= the shop actually serves", () => {
    expect(resolveRequestLocale(req("https://shop.test/api/x?locale=en"), "da")).toBe("en");
  });

  it("falls back to the page the caller is standing on", () => {
    // This is the case that was broken: no explicit param, agent on /en.
    expect(
      resolveRequestLocale(
        req("https://shop.test/api/x", "https://shop.test/en/produkter"),
        "da",
      ),
    ).toBe("en");
  });

  it("falls back to the shop default when there is nothing to read", () => {
    // A direct HTTP agent — no param, no Referer — is the case this CANNOT
    // fix, and saying so is the point: it gets the shop's own default, which
    // is the only defensible answer when the caller expressed no preference.
    expect(resolveRequestLocale(req("https://shop.test/api/x"), "da")).toBe("da");
    expect(resolveRequestLocale(req("https://shop.test/api/x"), "en")).toBe("en");
  });

  it("prefers the explicit param over the Referer", () => {
    expect(
      resolveRequestLocale(
        req("https://shop.test/api/x?locale=da", "https://shop.test/en/produkter"),
        "en",
      ),
    ).toBe("da");
  });

  it("ignores a locale this shop does not serve", () => {
    // A stale or hostile value must never become a path segment.
    expect(resolveRequestLocale(req("https://shop.test/api/x?locale=de"), "en")).toBe("en");
    expect(
      resolveRequestLocale(
        req("https://shop.test/api/x?locale=../../etc/passwd"),
        "en",
      ),
    ).toBe("en");
    expect(
      resolveRequestLocale(
        req("https://shop.test/api/x", "https://evil.test/de/anything"),
        "en",
      ),
    ).toBe("en");
  });

  it("a forged Referer can only choose between the shop's OWN locales", () => {
    // The Referer is advisory, so it is checked against the allowlist. The
    // worst outcome is a link in a language this shop already publishes.
    expect(
      resolveRequestLocale(
        req("https://shop.test/api/x", "https://attacker.test/en/whatever"),
        "da",
      ),
    ).toBe("en");
    expect(
      resolveRequestLocale(
        req("https://shop.test/api/x", "not a url at all"),
        "da",
      ),
    ).toBe("da");
  });

  it("falls back to routing when even the shop default is nonsense", () => {
    // getBrand() can return a stale value; it must not be able to produce a
    // URL segment the router cannot serve.
    expect(resolveRequestLocale(req("https://shop.test/api/x"), "zz")).toBe("da");
    expect(resolveRequestLocale(req("https://shop.test/api/x"), "")).toBe("da");
  });
});
