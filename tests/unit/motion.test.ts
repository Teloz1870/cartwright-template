import { describe, expect, it } from "vitest";

import { resolveMotionAttr } from "@/lib/motion";

/**
 * PART 4 Track A — the canary-safety hinge. `data-motion` on <html> drives the
 * whole motion engine (themes/motion.css). The master flag `motionEffects`
 * default-off MUST force "off" so canaries render byte-identical; when on, the
 * shop preset (subtle/bold/off) scales the feel. Invalid/absent preset fails
 * soft to "subtle" (never throws at render).
 */
describe("resolveMotionAttr — master-flag gate", () => {
  it('returns "off" when motionEffects is off (regardless of preset)', () => {
    expect(resolveMotionAttr({ motionEffects: false }, { preset: "bold" })).toBe("off");
    expect(resolveMotionAttr({}, { preset: "subtle" })).toBe("off");
  });

  it("passes through a valid preset when motionEffects is on", () => {
    expect(resolveMotionAttr({ motionEffects: true }, { preset: "subtle" })).toBe("subtle");
    expect(resolveMotionAttr({ motionEffects: true }, { preset: "bold" })).toBe("bold");
    expect(resolveMotionAttr({ motionEffects: true }, { preset: "off" })).toBe("off");
  });

  it('fails soft to "subtle" when on but preset is invalid/absent', () => {
    expect(resolveMotionAttr({ motionEffects: true }, { preset: "wobble" })).toBe("subtle");
    expect(resolveMotionAttr({ motionEffects: true }, {})).toBe("subtle");
    expect(resolveMotionAttr({ motionEffects: true }, null)).toBe("subtle");
    expect(resolveMotionAttr({ motionEffects: true }, undefined)).toBe("subtle");
  });
});
