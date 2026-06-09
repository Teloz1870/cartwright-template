import { describe, expect, it } from "vitest";

import { parseThreeDConfig } from "@/lib/three/resolve";
import { SCENE_IDS, SCENE_REGISTRY, isSceneId } from "@/lib/three/scenes/registry";

/**
 * Live Canvas config invariants. The fail-soft parse is the render-safety
 * guarantee — a corrupt/hostile threeDConfigJson must never break the hero.
 */

describe("scene registry", () => {
  it("has exactly the registered scenes", () => {
    expect([...SCENE_IDS].sort()).toEqual(
      [
        "aurora",
        "blob",
        "floating-geometry",
        "gridflow",
        "orb",
        "particles",
        "waves",
        "wireframe",
      ].sort(),
    );
  });

  it("every registry entry has a loader + labels", () => {
    for (const id of SCENE_IDS) {
      expect(typeof SCENE_REGISTRY[id].load).toBe("function");
      expect(SCENE_REGISTRY[id].label.length).toBeGreaterThan(0);
    }
  });

  it("isSceneId guards correctly", () => {
    expect(isSceneId("blob")).toBe(true);
    expect(isSceneId("nope")).toBe(false);
    expect(isSceneId(42)).toBe(false);
    expect(isSceneId(null)).toBe(false);
  });
});

describe("parseThreeDConfig — fail-soft", () => {
  it("null/empty/garbage → null", () => {
    expect(parseThreeDConfig(null)).toBeNull();
    expect(parseThreeDConfig("")).toBeNull();
    expect(parseThreeDConfig("{ not json")).toBeNull();
    expect(parseThreeDConfig("[1,2]")).toBeNull();
    expect(parseThreeDConfig("42")).toBeNull();
  });

  it("accepts a valid scene", () => {
    expect(parseThreeDConfig(JSON.stringify({ scene: "blob" }))).toEqual({
      scene: "blob",
    });
  });

  it("drops an unknown scene", () => {
    expect(parseThreeDConfig(JSON.stringify({ scene: "lava-lamp" }))).toEqual({});
  });

  it("clamps intensity to 0..1", () => {
    expect(parseThreeDConfig(JSON.stringify({ intensity: 5 }))?.intensity).toBe(1);
    expect(parseThreeDConfig(JSON.stringify({ intensity: -3 }))?.intensity).toBe(0);
    expect(parseThreeDConfig(JSON.stringify({ intensity: 0.4 }))?.intensity).toBe(0.4);
  });

  it("ignores non-number intensity and bad paletteSource", () => {
    expect(parseThreeDConfig(JSON.stringify({ intensity: "loud" }))).toEqual({});
    expect(parseThreeDConfig(JSON.stringify({ paletteSource: "rainbow" }))).toEqual({});
    expect(
      parseThreeDConfig(JSON.stringify({ paletteSource: "theme" })),
    ).toEqual({ paletteSource: "theme" });
  });
});
