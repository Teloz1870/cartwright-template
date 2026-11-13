import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { auditProfile } from "../../scripts/site-profile-audit";

/**
 * B3 falsifier — "a no-DB `site` materialization compiles".
 *
 * Simulates the materializer's file math (exclusions + seam-static copies +
 * registry codemods) and walks EVERY included code file's imports; any import
 * that resolves into an excluded module's claim is exactly a `tsc` error a
 * materialized scaffold would hit. See scripts/site-profile-audit.ts for the
 * interactive triage CLI (`pnpm exec tsx scripts/site-profile-audit.ts`).
 *
 * Deliberately site-only in B3: the bigger profiles' materializations are
 * proven by the B4 CI workflow; their known edges live in knownDeviations.
 */
describe("site-profile import closure", () => {
  // Both materializer outputs must close: the bare core-only site AND the
  // contact-form variant (codex #385 fold-in: auditing only the superset
  // would hide a core import that the optional module happens to satisfy).
  for (const withModules of [[], ["contact-form"]] as const) {
    const label = withModules.length ? `site --with ${withModules.join(",")}` : "site (bare)";
    it(`${label} has zero cross-module import leaks`, () => {
      const result = auditProfile("site", { withModules });
      const lines = result.violations.map(
        (v) => `${v.importer} → ${v.specifier} (${v.owner})`,
      );
      expect(lines, lines.join("\n")).toEqual([]);
      // Sanity: the walk actually covered the storefront surface.
      expect(result.walked).toBeGreaterThan(200);
    });
  }

  it("keeps the static info seam API used by canonical trust routes", () => {
    const staticInfo = readFileSync(
      new URL("../../app/[locale]/info/[slug]/page.static.tsx", import.meta.url),
      "utf8",
    );

    for (const exportedHelper of [
      "buildPublicInfoMetadata",
      "renderPublicInfoPage",
    ]) {
      expect(staticInfo).toMatch(
        new RegExp(`export\\s+async\\s+function\\s+${exportedHelper}\\b`),
      );
    }
  });
});
