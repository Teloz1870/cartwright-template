import { describe, expect, it } from "vitest";

import {
  DESIGN_OPTIONS,
  MIXABLE_DESIGN_SLUGS,
  designIsMixable,
  designTracksPalette,
  resolveMixable,
} from "@/designs/options";

/**
 * Page-Mixer — `mixable` contract. The Mixer Parts (lib/builder/section-registry)
 * are cw-* atoms, so they only render coherently on designs whose cw-* tokens
 * track the active palette: the cw-prefix atom designs + applyPaletteAsTheme
 * packs that map onto cw-* too. This pins that set and guards against slug drift.
 */
describe("designIsMixable", () => {
  it("flags exactly the cw-coherent (palette-adaptive) skins as mixable", () => {
    expect(designIsMixable("aurora-site")).toBe(true);
    expect(designIsMixable("aurora-shop")).toBe(true);
    expect(designIsMixable("studio")).toBe(true);
    expect(designIsMixable("jungle")).toBe(true);
    expect(designIsMixable("hoptify")).toBe(true);
  });

  it("does NOT flag own-prefix / locked-theme premium packs", () => {
    for (const slug of [
      "engineered",
      "nocturne",
      "editorial-ink",
      "brutalist",
      "meridian",
      "saas-dark",
      "atelier",
      "stack",
      "webshop-bold",
    ]) {
      expect(designIsMixable(slug), `${slug} should not be mixable`).toBe(false);
    }
  });

  it("returns false for unknown slugs", () => {
    expect(designIsMixable("definitely-not-a-design")).toBe(false);
  });

  it("every mixable slug is a real registered design (no drift)", () => {
    const known = new Set(DESIGN_OPTIONS.map((d) => d.slug));
    for (const slug of MIXABLE_DESIGN_SLUGS) {
      expect(known.has(slug), `mixable slug '${slug}' is not in DESIGN_OPTIONS`).toBe(true);
    }
  });
});

/**
 * `resolveMixable` — effective mixability for a LOADED pack. The pack's own
 * `mixable` field (designs/types.ts override) must win in BOTH directions;
 * unset falls back to the built-in slug set.
 */
describe("resolveMixable", () => {
  it("pack override `mixable: true` wins over a slug outside the built-in set", () => {
    expect(designIsMixable("my-custom-pack")).toBe(false);
    expect(resolveMixable("my-custom-pack", true)).toBe(true);
  });

  it("pack override `mixable: false` wins over a slug inside the built-in set", () => {
    expect(designIsMixable("aurora-site")).toBe(true);
    expect(resolveMixable("aurora-site", false)).toBe(false);
  });

  it("unset falls back to the built-in slug set (both directions)", () => {
    expect(resolveMixable("aurora-site", undefined)).toBe(true);
    expect(resolveMixable("saas-dark", undefined)).toBe(false);
  });
});

/**
 * `designTracksPalette` — does a pack's rendering track an injected palette?
 * Deliberately BROADER than Parts mixability: paletteToFullThemeCss writes the
 * palette onto sol-* AND cw-* vars, so sol-prefix packs (webshop-classic
 * class) and cw-prefix packs outside the mixable set (blank) DO track it,
 * while private-prefix packs (saas-*, halo-*, …) never see it.
 */
describe("designTracksPalette", () => {
  const pack = (
    slug: string,
    prefix: string,
    extra: { mixable?: boolean; applyPaletteAsTheme?: boolean } = {},
  ) => ({ slug, tokens: { prefix }, ...extra });

  it("sol-prefix packs track the palette even though they are not Parts-mixable", () => {
    expect(designIsMixable("webshop-classic")).toBe(false);
    expect(designTracksPalette(pack("webshop-classic", "sol"))).toBe(true);
  });

  it("cw-prefix packs outside the mixable set track the palette (blank)", () => {
    expect(designIsMixable("blank")).toBe(false);
    expect(designTracksPalette(pack("blank", "cw"))).toBe(true);
  });

  it("applyPaletteAsTheme packs track the palette regardless of prefix", () => {
    expect(designTracksPalette(pack("imported-x", "imp", { applyPaletteAsTheme: true }))).toBe(
      true,
    );
  });

  it("mixable packs track the palette (built-in set and pack override)", () => {
    expect(designTracksPalette(pack("aurora-site", "cw"))).toBe(true);
    expect(designTracksPalette(pack("custom-pack", "cst", { mixable: true }))).toBe(true);
  });

  it("private-prefix packs with no adaptive signal do NOT track the palette", () => {
    expect(designTracksPalette(pack("saas-dark", "saas"))).toBe(false);
    expect(designTracksPalette(pack("halo", "halo", { mixable: false }))).toBe(false);
  });

  it("sol prefix wins even when the pack opts out of Parts mixing", () => {
    expect(designTracksPalette(pack("webshop-classic", "sol", { mixable: false }))).toBe(true);
  });
});
