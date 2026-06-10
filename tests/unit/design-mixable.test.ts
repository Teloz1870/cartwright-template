import { describe, expect, it } from "vitest";

import {
  DESIGN_OPTIONS,
  MIXABLE_DESIGN_SLUGS,
  designIsMixable,
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
