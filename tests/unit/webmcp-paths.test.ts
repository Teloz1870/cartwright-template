import { describe, it, expect } from "vitest";
import { isSameOriginPath } from "@/lib/webmcp/paths";
import { isSameOriginPath as core } from "@/lib/safe-path";

describe("isSameOriginPath (WebMCP navigate guard)", () => {
  it("accepterer interne stier", () => {
    expect(isSameOriginPath("/produkter")).toBe(true);
    expect(isSameOriginPath("/produkter?q=oak")).toBe(true);
    expect(isSameOriginPath("/product/some-slug#reviews")).toBe(true);
  });
  it("afviser eksterne + protocol-relative + scheme-tricks", () => {
    expect(isSameOriginPath("//evil.com")).toBe(false);
    expect(isSameOriginPath("https://evil.com")).toBe(false);
    expect(isSameOriginPath("http://evil.com/x")).toBe(false);
    expect(isSameOriginPath("/\\evil.com")).toBe(false);
    expect(isSameOriginPath("javascript:alert(1)")).toBe(false);
  });
  it("ER kernens funktion - et vaern, ikke to kopier der kan drifte", () => {
    // Implementationen bor i lib/safe-path.ts; dette modul re-eksporterer den.
    // Assertionen bor HER og ikke i tests/unit/safe-path.test.ts, fordi CLI'ens
    // --profile light sletter lib/webmcp/ OG denne testfil sammen
    // (LIGHT_EXCLUDED_PATHS) - en identitets-assertion i en KERNE-test ville
    // vaere en TS2307 paa default-profilen. Prune-sikker pr. konstruktion.
    expect(isSameOriginPath).toBe(core);
  });
  it("afviser ikke-strenge + tom + relativ-uden-slash", () => {
    expect(isSameOriginPath("produkter")).toBe(false);
    expect(isSameOriginPath("")).toBe(false);
    expect(isSameOriginPath(undefined)).toBe(false);
    expect(isSameOriginPath(42)).toBe(false);
  });
});
