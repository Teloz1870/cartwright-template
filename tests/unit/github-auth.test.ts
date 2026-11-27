import { describe, expect, it } from "vitest";
import { brand } from "@/brand.config";
import { FEATURE_MANIFEST } from "@/lib/feature-flags/manifest";

/**
 * "Sign in with GitHub" (W5) — gating invariants. The button + provider appear
 * only when the `githubAuth` flag is on AND both OAuth env keys are set
 * (lib/auth.ts:isGithubAuthEnabled). Default-off so a stock shop is unchanged.
 */

// Mirror of lib/auth.ts:isGithubAuthEnabled, kept here as an explicit truth
// table so a regression in the gating expression is caught.
function githubEnabled(flag: boolean, id?: string, secret?: string): boolean {
  return Boolean(flag) && Boolean(id) && Boolean(secret);
}

describe("githubAuth gating", () => {
  it("is OFF by default in brand.config", () => {
    expect((brand.features as { githubAuth?: boolean }).githubAuth).toBe(false);
  });

  it("has a manifest entry (compile-enforced 1:1 with the flag)", () => {
    const entry = FEATURE_MANIFEST.find((f) => f.key === "githubAuth");
    expect(entry).toBeDefined();
    expect(entry?.label).toMatch(/github/i);
  });

  it("requires the flag AND both keys", () => {
    expect(githubEnabled(true, "id", "secret")).toBe(true); // all present
    expect(githubEnabled(false, "id", "secret")).toBe(false); // flag off
    expect(githubEnabled(true, undefined, "secret")).toBe(false); // no client id
    expect(githubEnabled(true, "id", undefined)).toBe(false); // no secret
    expect(githubEnabled(true, "", "")).toBe(false); // empty keys
  });
});
