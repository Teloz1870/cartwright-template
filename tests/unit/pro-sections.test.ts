import { describe, expect, it } from "vitest";

import {
  SECTION_REGISTRY,
  PRO_SECTION_KEYS,
  isProSection,
} from "@/lib/builder/section-registry";

/**
 * Cartwright Pro Parts — the `pro` flag on a section def drives the "Pro" badge +
 * the cartwrightPlus tier. This pins which Parts are Pro and the helper contract.
 */
describe("Pro sections", () => {
  it("flags the configurator as a Pro Part", () => {
    expect(isProSection("configurator")).toBe(true);
    expect(PRO_SECTION_KEYS).toContain("configurator");
  });

  it("does not flag free Parts as Pro", () => {
    for (const k of ["hero", "bento", "marquee", "faq", "ctaFooter"] as const) {
      expect(isProSection(k)).toBe(false);
    }
  });

  it("PRO_SECTION_KEYS matches the registry's pro:true entries", () => {
    const fromRegistry = (Object.keys(SECTION_REGISTRY) as (keyof typeof SECTION_REGISTRY)[]).filter(
      (k) => SECTION_REGISTRY[k].pro === true,
    );
    expect([...PRO_SECTION_KEYS].sort()).toEqual(fromRegistry.sort());
  });
});
