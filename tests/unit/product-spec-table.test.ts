import { describe, expect, it } from "vitest";

import { cremaDesign } from "@/designs/crema";
import { specTableRows } from "@/lib/product-attributes";

/**
 * The PDP spec table, as a pure seam.
 *
 * Two things the PDP page cannot be unit-rendered to prove, and which two
 * independent falsifiers found were pinned by nothing:
 *
 *   1. that the table renders typed values at all — reverting it to
 *      `typeof v === "string"` (the original bug) left the whole suite green;
 *   2. that it SKIPS what the active design already draws — crema's PDP frame
 *      renders a roast band from `roast` and an eyebrow from `origin · process`,
 *      so the shared table printed those facts a second time. `origin` and
 *      `process` doubled up before typed values were rendered at all; `roast`
 *      joined them the moment numbers became visible.
 */

/** Verbatim from industry-templates/coffee/seed-data.ts (Ethiopia Yirgacheffe). */
const COFFEE = {
  origin: "Ethiopia",
  strength: "bright",
  process: "Washed",
  roast: 2,
  notes: ["bergamot", "jasmine", "lemon"],
  weightG: 250,
};

describe("specTableRows — typed values render", () => {
  it("shows the numbers and lists the string-only filter used to drop", () => {
    const rows = specTableRows(COFFEE);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(byKey.roast).toBe("2");
    expect(byKey.notes).toBe("bergamot, jasmine, lemon");
    expect(byKey.weightG).toBe("250");
    // ...without losing what already worked.
    expect(byKey.origin).toBe("Ethiopia");
  });

  it("drops values no reader can show, rather than printing junk", () => {
    const rows = specTableRows({ ok: "yes", nested: { a: 1 }, empty: "", list: [] });
    expect(rows.map((r) => r.key)).toEqual(["ok"]);
  });

  it("is empty for a product with no attributes", () => {
    expect(specTableRows(null)).toEqual([]);
    expect(specTableRows({})).toEqual([]);
  });
});

describe("specTableRows — the design's own attributes are skipped, but only what it DREW", () => {
  const owns = (attrs: Record<string, unknown>, hasVariants = false) =>
    cremaDesign.webshop?.ownsAttributes?.(attrs, { hasVariants }) ?? [];

  it("omits exactly what crema's PDP frame draws for this product", () => {
    expect([...owns(COFFEE)].sort()).toEqual(["origin", "process", "roast"]);
    const rows = specTableRows(COFFEE, owns(COFFEE)).map((r) => r.key);
    expect(rows).toEqual(["strength", "notes", "weightG"]);
  });

  it("KEEPS a roast the frame refuses to draw — it printed on main and must not vanish", () => {
    // parseCoffeeAttributes accepts integers 1–4 only ("never guess"). A
    // blanket key list would skip these in the table while the band drew
    // nothing, so the fact would render nowhere at all.
    for (const roast of ["Medium", "medium-dark", 5, 0, 2.5, true]) {
      const attrs = { ...COFFEE, roast };
      expect(owns(attrs), `roast=${String(roast)} is not drawn, so not owned`).not.toContain("roast");
      expect(
        specTableRows(attrs, owns(attrs)).map((r) => r.key),
        `roast=${String(roast)} must still reach the table`,
      ).toContain("roast");
    }
  });

  it("owns a numeric-string roast, because the frame coerces and draws it", () => {
    expect(owns({ ...COFFEE, roast: "3" })).toContain("roast");
  });

  it("stops owning origin/process when they are absent or blank", () => {
    expect(owns({ roast: 2 })).toEqual(["roast"]);
    expect(owns({ origin: "   ", process: "Washed" })).toEqual(["process"]);
  });

  it("hands pack size to the variant picker once a product has variants", () => {
    // Colombia Supremo (the seed's one variant-ful product) carries
    // weightG: 250 while its picker offers 250 g AND 1 kg — the shared table
    // would state a size the shopper is about to change. The variant labels
    // carry it, so nothing is lost.
    expect(owns(COFFEE, false)).not.toContain("weightG");
    expect(owns(COFFEE, true)).toContain("weightG");
    expect(specTableRows(COFFEE, owns(COFFEE, true)).map((r) => r.key)).toEqual([
      "strength",
      "notes",
    ]);
  });

  it("renders everything when the design declares nothing", () => {
    expect(specTableRows(COFFEE).map((r) => r.key)).toEqual(Object.keys(COFFEE));
  });
});
