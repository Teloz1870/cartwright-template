import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { DESIGN_OPTIONS } from "@/designs/options";
import { DESIGN_TOKENS } from "@/designs/tokens";
import { SCENE_IDS } from "@/lib/three/scenes/registry";
import { SVG_ITEMS } from "@/components/svg-items";
import { DESIGN_MOTIFS } from "@/components/svg-items/design-motifs";
import { LOOKS } from "@/verticals/looks";
import { ELEMENTS_CATALOG } from "@/lib/builder/elements-catalog";
import { CHROME_CATALOG } from "@/lib/builder/chrome-catalog";
import { CompositionSchema } from "@/lib/compositions/spec";
import { PLUGINS } from "@/plugins/registry";
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
    // ENGINE ONLY. The committed manifest is the engine's full catalogue; a
    // pruned scaffold has fewer designs and chromes BY DESIGN, so rebuilding it
    // there legitimately differs and the mismatch says nothing about drift.
    // `.cartwright/profile.json` exists only in a scaffold, never in this repo.
    //
    // Measured: a `light` scaffold failed here on 30 designs vs its own pruned
    // set — a customer red-lit for the profile they chose. The guard keeps its
    // teeth where drift can actually be introduced: the engine, where CI runs.
    if (existsSync(".cartwright/profile.json")) return;
    const committed = JSON.parse(readFileSync("marketplace-manifest.json", "utf-8"));
    expect(buildManifest()).toEqual(committed);
  });

  it("declares the v3 schema (v2 + the chrome catalogue)", () => {
    expect(buildManifest().$schema).toBe("cartwright-marketplace-manifest-v3");
  });

  it("carries all designs (incl. the apex + fable flagships) + the 8 voices", () => {
    const m = buildManifest();
    expect(m.designs.length).toBe(DESIGN_OPTIONS.length);
    expect(m.designs.some((d) => d.slug === "apex")).toBe(true);
    expect(m.designs.some((d) => d.slug === "fable")).toBe(true);
    expect(m.voices.map((v) => v.slug).sort()).toEqual([
      "cafe",
      "carpenter",
      "dentist",
      "fable",
      "fitness",
      "kindergarten",
      "restaurant",
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

  it("every look ships a spec-valid composition artifact (Mixer 2.0 Phase 2)", () => {
    const m = buildManifest();
    for (const look of m.looks) {
      expect(look.composition, `look "${look.slug}" composition`).not.toBeNull();
      const parsed = CompositionSchema.safeParse(look.composition);
      expect(
        parsed.success,
        `look "${look.slug}" composition: ${parsed.success ? "" : parsed.error.issues[0]?.message}`,
      ).toBe(true);
      expect(look.composition?.skin).toBe(look.designSlug);
    }
  });

  it("carries the chrome catalogue (Mixer 2.0) — every entry resolvable", () => {
    const m = buildManifest();
    expect(m.chrome.length).toBe(CHROME_CATALOG.length);
    const designSlugs = new Set(m.designs.map((d) => d.slug));
    for (const c of m.chrome) {
      expect(["header", "footer"]).toContain(c.kind);
      expect(c.label.length).toBeGreaterThan(0);
      if (c.designSlug !== null) {
        // Design chromes reference a registered design that owns chrome.
        expect(designSlugs.has(c.designSlug), `chrome "${c.key}" design`).toBe(true);
      }
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

  it("carries the plugin catalogue (cartwright-plugin-v1) — compact entries only", () => {
    const m = buildManifest();
    expect(m.plugins.length).toBe(PLUGINS.length);
    expect(m.plugins.some((p) => p.slug === "phone-widget")).toBe(true);
    for (const p of m.plugins) {
      // Compact gallery shape: exactly slug/name/description/flag — the full
      // manifest (files/routeMounts/…) stays in the engine repo.
      expect(Object.keys(p).sort()).toEqual(["description", "flag", "name", "slug"]);
      const manifest = PLUGINS.find((reg) => reg.slug === p.slug);
      expect(manifest, `plugin "${p.slug}" registered`).toBeTruthy();
      expect(p.flag).toBe(manifest?.flag);
    }
  });
});
