import { describe, expect, it } from "vitest";
import { getDesign } from "@/designs";
// Registry-map'et er internt — invariantens adgang går via getDesign, og
// nøgle-listen læses fra DESIGN_OPTIONS (den offentlige katalog-kontrakt).
import { DESIGN_OPTIONS } from "@/designs";

/**
 * Registry-invariant: hver nøgle i DESIGNS-map'et SKAL være pakkens egen slug.
 *
 * Fødsel: crema-registreringen (#460) ramte den forkerte linje og efterlod
 * `"northern-coffee": cremaDesign` plus en shorthand-nøgle
 * `northernCoffeeDesign` — TypeScript var ligeglad, alle tests grønne, og
 * produktionens homepage svarede 404 fordi getDesign("crema") var null.
 * Denne test gør den klasse af fejl umulig at merge igen.
 */
describe("DESIGNS registry", () => {
  it("resolves every catalogued slug to a pack whose slug matches", () => {
    for (const option of DESIGN_OPTIONS) {
      const pack = getDesign(option.slug);
      expect(pack, `getDesign("${option.slug}") must resolve`).not.toBeNull();
      expect(pack?.slug, `map key "${option.slug}" → pack.slug`).toBe(option.slug);
    }
  });

  it("registers crema and northern-coffee as themselves (when the profile ships them)", () => {
    // Scaffold profiles prune design packs by codemodding designs/index.ts +
    // options.ts — the #463 keying regression is only assertable for packs the
    // profile actually registered. The general invariant above already holds
    // every REGISTERED slug to `pack.slug === key`; this pin adds the two
    // packs whose mis-keying shipped a 404 homepage, wherever they exist.
    const registered = new Set(DESIGN_OPTIONS.map((d) => d.slug));
    for (const slug of ["crema", "northern-coffee"]) {
      if (!registered.has(slug)) continue; // pruned by this scaffold profile
      expect(getDesign(slug)?.slug).toBe(slug);
    }
  });
});
