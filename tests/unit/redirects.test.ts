import { describe, expect, it } from "vitest";

import { matchRedirect, normalizeFromPath, type RedirectMap } from "@/lib/redirects/match";

const MAP: RedirectMap = {
  "/gammel": { to: "/ny", status: 301 },
  "/kampagne": { to: "https://andet.dk/kampagne", status: 302 },
};

describe("matchRedirect", () => {
  it("matcher uden locale → relativ destination", () => {
    expect(matchRedirect("/gammel", MAP)).toEqual({ to: "/ny", status: 301 });
  });

  it("stripper locale og bevarer den på relativ destination", () => {
    expect(matchRedirect("/da/gammel", MAP)).toEqual({ to: "/da/ny", status: 301 });
    expect(matchRedirect("/en/gammel", MAP)).toEqual({ to: "/en/ny", status: 301 });
  });

  it("absolut destination bevares uden locale-prefix + 302", () => {
    expect(matchRedirect("/da/kampagne", MAP)).toEqual({
      to: "https://andet.dk/kampagne",
      status: 302,
    });
  });

  it("returnerer null uden match", () => {
    expect(matchRedirect("/findes-ikke", MAP)).toBeNull();
    expect(matchRedirect("/da/andet", MAP)).toBeNull();
  });
});

describe("normalizeFromPath", () => {
  it("tilføjer leading slash + fjerner trailing", () => {
    expect(normalizeFromPath("gammel/")).toBe("/gammel");
    expect(normalizeFromPath("  /a/b/  ")).toBe("/a/b");
    expect(normalizeFromPath("/")).toBe("/");
  });
});
