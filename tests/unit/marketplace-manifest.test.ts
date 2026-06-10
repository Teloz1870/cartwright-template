import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DESIGN_OPTIONS } from "@/designs/options";
import { DESIGN_TOKENS } from "@/designs/tokens";
import { SCENE_IDS } from "@/lib/three/scenes/registry";
import { SVG_ITEMS } from "@/components/svg-items";
import { DESIGN_MOTIFS } from "@/components/svg-items/design-motifs";
import { LOOKS } from "@/verticals/looks";
import { ELEMENTS_CATALOG } from "@/lib/builder/elements-catalog";
import { buildManifest } from "../../scripts/gen-marketplace-manifests";

/**
 * The marketplace manifest is the single source of truth cartwright.app derives
 * its galleries from (designs, voices, scenes, svg-items, elements, looks).
 * These invariants make drift impossible:
 *  - every registered design has a token entry (so a new design can't ship
 *    without a palette/threeD),
 *  - the committed marketplace-manifest.json equals what the registries produce
 *    (so changing options/tokens/presets/registries without `pnpm gen:manifest`
 *    fails CI),
 *  - every cross-catalogue reference resolves (motifs → svg-items,
 *    looks → designs + voices), and every svg-item ships real rendered markup.
 */

describe("designs/tokens invariant", () => {
  it("every registered design (DESIGN_OPTIONS) has a token entry", () => {
    const missing = DESIGN_OPTIONS.filter((d) => !(d.slug in DESIGN_TOKENS)).map((d) => d.slug);
    expect(missing).toEqual([]);
  });
});

describe("marketplace-manifest.json", () => {
  it("matches the committed file — run `pnpm gen:manifest` if this fails", () => {
    const committed = JSON.parse(readFileSync("marketplace-manifest.json", "utf-8"));
    expect(buildManifest()).toEqual(committed);
  });

  it("declares the v2 schema", () => {
    expect(buildManifest().$schema).toBe("cartwright-marketplace-manifest-v2");
  });

  it("carries all designs (incl. the apex + fable flagships) + the 5 voices", () => {
    const m = buildManifest();
    expect(m.designs.length).toBe(DESIGN_OPTIONS.length);
    expect(m.designs.some((d) => d.slug === "apex")).toBe(true);
    expect(m.designs.some((d) => d.slug === "fable")).toBe(true);
    expect(m.voices.map((v) => v.slug).sort()).toEqual([
      "cafe",
      "carpenter",
      "fable",
      "kindergarten",
      "salon",
    ]);
  });

  it("carries every Live Canvas scene (one per SCENE_IDS entry)", () => {
    const m = buildManifest();
    expect(m.scenes.length).toBe(SCENE_IDS.length);
    expect(m.scenes.map((s) => s.slug).sort()).toEqual([...SCENE_IDS].sort());
    for (const scene of m.scenes) {
      expect(scene.label.length).toBeGreaterThan(0);
      expect(scene.description.length).toBeGreaterThan(0);
    }
  });

  it("carries every svg-item with non-empty rendered <svg> markup", () => {
    const m = buildManifest();
    expect(m.svgItems.length).toBe(SVG_ITEMS.length);
    for (const item of m.svgItems) {
      expect(item.markup.length).toBeGreaterThan(0);
      expect(item.markup).toContain("<svg");
      // No React render artifacts in static markup.
      expect(item.markup).not.toContain("data-react");
      expect(item.markup).not.toContain("[object Object]");
      // Every url(#id) paint reference must resolve to an id defined in the
      // SAME markup string (stable namespaced gradient/clip ids).
      const refs = [...item.markup.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]);
      for (const ref of refs) {
        expect(item.markup).toContain(`id="${ref}"`);
      }
    }
  });

  it("animated svg-items keep their scoped, reduced-motion-gated <style> blocks", () => {
    const m = buildManifest();
    const animated = m.svgItems.filter((item) => item.animated);
    expect(animated.length).toBe(SVG_ITEMS.filter((i) => i.animated).length);
    expect(animated.length).toBeGreaterThan(0);
    for (const item of animated) {
      // The rendered markup must carry the inline CSS verbatim — consumers
      // inline it without running React, so the animation must survive.
      expect(item.markup).toContain("<style>");
      expect(item.markup).toContain("@media (prefers-reduced-motion: no-preference)");
      expect(item.markup).toContain("@keyframes cwsi-");
    }
  });

  it("every design motif references an existing svg-item slug", () => {
    const svgSlugs = new Set(SVG_ITEMS.map((s) => s.slug));
    for (const [designSlug, motifSlug] of Object.entries(DESIGN_MOTIFS)) {
      expect(svgSlugs.has(motifSlug), `motif "${motifSlug}" (design "${designSlug}")`).toBe(true);
    }
    // …and every motif key is a registered design.
    const designSlugs = new Set(DESIGN_OPTIONS.map((d) => d.slug));
    for (const designSlug of Object.keys(DESIGN_MOTIFS)) {
      expect(designSlugs.has(designSlug), `DESIGN_MOTIFS key "${designSlug}"`).toBe(true);
    }
    // …and the manifest carries motifSlug per design (null when none).
    const m = buildManifest();
    for (const d of m.designs) {
      expect(d.motifSlug).toBe(DESIGN_MOTIFS[d.slug] ?? null);
    }
  });

  it("every look references an existing design slug + voice slug", () => {
    const m = buildManifest();
    expect(m.looks.length).toBe(LOOKS.length);
    const designSlugs = new Set(m.designs.map((d) => d.slug));
    const voiceSlugs = new Set(m.voices.map((v) => v.slug));
    for (const look of m.looks) {
      expect(designSlugs.has(look.designSlug), `look "${look.slug}" design`).toBe(true);
      expect(voiceSlugs.has(look.voiceSlug), `look "${look.slug}" voice`).toBe(true);
    }
  });

  it("carries the elements catalogue", () => {
    const m = buildManifest();
    expect(m.elements.length).toBe(ELEMENTS_CATALOG.length);
    for (const el of m.elements) {
      expect(el.slug.length).toBeGreaterThan(0);
      expect(el.name.length).toBeGreaterThan(0);
      expect(el.previewImage.startsWith("/")).toBe(true);
    }
  });
});
