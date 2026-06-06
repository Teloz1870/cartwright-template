import { describe, expect, it } from "vitest";
import { isSetupWhitelistedPath } from "@/lib/setup-wizard";

/**
 * Task D regression: layout-redirect skal NEVER blokere disse paths,
 * uanset om wizard ellers skulle vises.
 */
describe("setup-wizard path whitelist", () => {
  it("whitelister /admin/setup selv (undgår evig redirect-loop)", () => {
    expect(isSetupWhitelistedPath("/admin/setup")).toBe(true);
    expect(isSetupWhitelistedPath("/admin/setup/")).toBe(true);
  });

  it("whitelister /admin/integrations så admin altid kan nå keys", () => {
    expect(isSetupWhitelistedPath("/admin/integrations")).toBe(true);
    expect(isSetupWhitelistedPath("/admin/integrations/anthropic")).toBe(true);
  });

  it("blokerer alle andre /admin/* paths så de redirectes til wizard", () => {
    expect(isSetupWhitelistedPath("/admin")).toBe(false);
    expect(isSetupWhitelistedPath("/admin/produkter")).toBe(false);
    expect(isSetupWhitelistedPath("/admin/ordrer")).toBe(false);
    expect(isSetupWhitelistedPath("/admin/kategorier")).toBe(false);
  });

  it("matcher ikke partial-string-matches (ingen sub-string exploits)", () => {
    // /admin/setupasdf må ikke matche /admin/setup
    expect(isSetupWhitelistedPath("/admin/setupasdf")).toBe(false);
    expect(isSetupWhitelistedPath("/admin/integrationsx")).toBe(false);
  });
});
