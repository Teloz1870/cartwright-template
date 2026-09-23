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

  it("whitelister /admin/konto (first-login loop-regression)", () => {
    // På en frisk fork er BÅDE mustChangePassword OG shouldShowSetupWizard
    // sande. app/admin/layout.tsx har to redirect-gates: setup-gaten (kører
    // FØRST) sender ikke-whitelistede paths → /admin/setup, og password-gaten
    // sender alt ≠ /admin/konto → /admin/konto. Hvis konto IKKE er
    // setup-whitelisted, bouncer konto → setup → konto → … i en evig loop
    // (ERR_TOO_MANY_REDIRECTS på den allerførste login). Konto MÅ derfor være
    // whitelisted her, så ejeren kan nå det tvungne password-skift.
    expect(isSetupWhitelistedPath("/admin/konto")).toBe(true);
  });

  it("whitelister /admin/indstillinger + /admin/designs (Browse-all-designs CTA)", () => {
    // First-run-canvas'ets "Browse all designs"-CTA → /admin/designs som
    // redirecter til /admin/indstillinger?tab=designs. Begge skal være
    // reachable under setup, ellers bouncer designs-galleriet til /admin/setup.
    expect(isSetupWhitelistedPath("/admin/designs")).toBe(true);
    expect(isSetupWhitelistedPath("/admin/indstillinger")).toBe(true);
    expect(isSetupWhitelistedPath("/admin/indstillinger/")).toBe(true);
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
