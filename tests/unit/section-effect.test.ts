import { describe, expect, it } from "vitest";

import {
  SECTION_EFFECTS,
  sectionEffectClass,
  sectionEffectSchema,
} from "@/lib/builder/effects";

/**
 * PART 4 Track B — the per-section motion vocabulary. Effects are a whitelisted
 * enum (the AI/UI can never emit a janky/off-brand animation). `sectionEffectClass`
 * is the single mapping section.effect → the themes/motion.css utility class, and
 * the wrapping decision in PageSections delegates to it: null ⇒ no wrapper ⇒
 * byte-identical render (the canary invariant on builder pages).
 */
describe("section effect vocabulary", () => {
  it("maps each whitelisted effect to its motion-* class", () => {
    for (const e of SECTION_EFFECTS) {
      expect(sectionEffectClass(e)).toBe(`motion-${e}`);
    }
    expect(sectionEffectClass("fade-up")).toBe("motion-fade-up");
    expect(sectionEffectClass("parallax")).toBe("motion-parallax");
  });

  it('returns null for "none", absent, or unknown effects (no wrapper)', () => {
    expect(sectionEffectClass("none")).toBeNull();
    expect(sectionEffectClass(undefined)).toBeNull();
    expect(sectionEffectClass(null)).toBeNull();
    expect(sectionEffectClass("")).toBeNull();
    expect(sectionEffectClass("wobble")).toBeNull();
  });

  it("zod enum accepts the vocabulary + 'none', rejects junk", () => {
    expect(sectionEffectSchema.safeParse("fade-up").success).toBe(true);
    expect(sectionEffectSchema.safeParse("none").success).toBe(true);
    expect(sectionEffectSchema.safeParse("wobble").success).toBe(false);
    expect(sectionEffectSchema.safeParse(42).success).toBe(false);
  });
});
