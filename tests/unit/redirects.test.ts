import { describe, expect, it } from "vitest";

import { brand } from "@/brand.config";
import { matchRedirect, normalizeFromPath, stripLocaleAndQuery, type RedirectMap } from "@/lib/redirects/match";

/**
 * THIS FILE SHIPS in every light and full scaffold, where brand.config.ts has
 * `locales: ["en"]`. Since URL1 the matcher strips a locale from
 * `brand.locales`, not a fixed `(da|en)`, so every prefix here is the tree's
 * own: `L` is the default locale, `OTHER` a second one when there is one.
 */
const L: string = brand.defaultLocale;
const OTHER: string = (brand.locales as readonly string[]).find((locale) => locale !== L) ?? L;

const MAP: RedirectMap = {
  "/gammel": { to: "/ny", status: 301 },
  "/kampagne": { to: "https://andet.dk/kampagne", status: 302 },
};

describe("matchRedirect", () => {
  it("matcher uden locale → relativ destination", () => {
    expect(matchRedirect("/gammel", MAP)).toEqual({ to: "/ny", status: 301 });
  });

  it("stripper locale og bevarer den på relativ destination", () => {
    expect(matchRedirect(`/${L}/gammel`, MAP)).toEqual({ to: `/${L}/ny`, status: 301 });
    expect(matchRedirect(`/${OTHER}/gammel`, MAP)).toEqual({ to: `/${OTHER}/ny`, status: 301 });
  });

  it("absolut destination bevares uden locale-prefix + 302", () => {
    expect(matchRedirect(`/${L}/kampagne`, MAP)).toEqual({
      to: "https://andet.dk/kampagne",
      status: 302,
    });
  });

  it("returnerer null uden match", () => {
    expect(matchRedirect("/findes-ikke", MAP)).toBeNull();
    expect(matchRedirect(`/${L}/andet`, MAP)).toBeNull();
  });
});

describe("normalizeFromPath", () => {
  it("tilføjer leading slash + fjerner trailing", () => {
    expect(normalizeFromPath("gammel/")).toBe("/gammel");
    expect(normalizeFromPath("  /a/b/  ")).toBe("/a/b");
    expect(normalizeFromPath("/")).toBe("/");
  });
});

describe("stripLocaleAndQuery", () => {
  it("is the source path the matcher looks a relative destination up under", () => {
    // Exactly what matchRedirect does to the request: locale off, then the lookup.
    expect(stripLocaleAndQuery(`/${L}/gammel`)).toBe("/gammel");
    expect(stripLocaleAndQuery(`/${OTHER}/gammel/`)).toBe("/gammel");
    expect(stripLocaleAndQuery("/gammel?x=1")).toBe("/gammel");
    expect(stripLocaleAndQuery("/gammel/#top")).toBe("/gammel");
    expect(stripLocaleAndQuery(`/${L}`)).toBe("/");
    // Not a locale segment: a longer first segment that starts with one.
    expect(stripLocaleAndQuery("/dansk/side")).toBe("/dansk/side");
    expect(stripLocaleAndQuery(`/${L}sk/side`)).toBe(`/${L}sk/side`);
    expect(stripLocaleAndQuery("/gammel")).toBe("/gammel");
  });
});
