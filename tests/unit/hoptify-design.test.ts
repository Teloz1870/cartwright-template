import { describe, expect, it } from "vitest";

import { DESIGN_OPTIONS } from "@/designs/options";

/**
 * Hoptify DesignPack (HOP0) — registreret i den client-safe option-liste.
 * (Den fulde getDesign + homepage-render dækkes af build/typecheck.)
 */
describe("Hoptify design registration", () => {
  it("er i DESIGN_OPTIONS som webshop", () => {
    const hop = DESIGN_OPTIONS.find((d) => d.slug === "hoptify");
    expect(hop).toBeDefined();
    expect(hop?.mode).toBe("webshop");
    expect(hop?.premium).toBe(false);
  });
});
