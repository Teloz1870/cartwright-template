import { describe, expect, it } from "vitest";

import { STRENGTH_RATIO } from "@/designs/crema/webshop/brew-math";
import { STRENGTH_TERMS } from "@/designs/crema/webshop/BrewWebMcpTools";
import { getIndustryTemplate } from "@/industry-templates";
import { matchesAllTokens, productHaystack } from "@/lib/search/lexical";

/**
 * Every strength the tool ADVERTISES must be able to find a coffee.
 *
 * The tool used to search for the strength's own name. Measured against the
 * live catalogue that worked for two of three: "bright" found the Yirgacheffe,
 * "balanced" the Colombia, and "strong" found NOTHING — so one of the three
 * documented options silently degraded to the bare recipe on every call. The
 * shop stocks the coffee; it just calls it "earthy, full-bodied … dark
 * chocolate" instead of strong.
 *
 * This runs each strength's terms against the SEEDED catalogue with the same
 * matcher the search route uses, so the promise in the tool's input schema is
 * checked against the products a fresh shop actually has.
 */
describe("every advertised brew strength resolves to a product", () => {
  const products = getIndustryTemplate("coffee").products;

  it("seeds a catalogue at all", () => {
    // Otherwise every assertion below passes on an empty list.
    expect(products.length).toBeGreaterThan(2);
  });

  it("covers exactly the strengths the calculator offers", () => {
    // A strength added to the math without terms here would be a dead option
    // again, and one removed would leave dead terms behind.
    expect(Object.keys(STRENGTH_TERMS).sort()).toEqual(Object.keys(STRENGTH_RATIO).sort());
  });

  for (const [strength, terms] of Object.entries(STRENGTH_TERMS)) {
    it(`"${strength}" finds a coffee in the seeded catalogue`, () => {
      const hit = terms.find((term) =>
        products.some((p) => matchesAllTokens(productHaystack(p), term)),
      );
      expect(
        hit,
        `none of [${terms.join(", ")}] matches any seeded product — "${strength}" is a dead option`,
      ).toBeDefined();
    });
  }

  /**
   * The assertions above cannot fail on their own, and saying so is the point.
   *
   * `STRENGTH_TERMS[s][0]` IS the strength word, and the seed now stores
   * `strength: "<that word>"`, which productHaystack reads — so a fresh shop
   * satisfies them by construction. That is the design working, not proof: the
   * fallback terms would never be exercised there, and could all be garbage.
   *
   * They are not decoration. Every shop seeded BEFORE this attribute existed
   * has no `strength` on any product, and those shops are exactly where
   * "strong" was a dead option. The live coffee demo is one of them, so its
   * real catalogue is the fixture — copied verbatim from
   * `demo.cartwright.app/api/products/search` on 2026-08-28, non-coffee rows
   * included, because a shop that also sells kettles and filters is the
   * situation that made this hard.
   */
  describe("the fallback terms carry shops seeded before the attribute existed", () => {
    const LIVE_DEMO = [
      ["Northbound Espresso Blend", "Our house blend, dialled for milk drinks. Chocolatey body with a stone-fruit lift. Roasted weekly."],
      ["Ethiopia Yirgacheffe", "Bright, floral single-origin from the Yirgacheffe region. Notes of bergamot, jasmine, and lemon."],
      ["Colombia Supremo", "Balanced washed Colombian with caramel sweetness and chocolate finish. Works equally well as filter or espresso."],
      ["Gooseneck Pour-Over Kettle", "1.0 L stainless gooseneck kettle with thermometer lid. Precise, slow pours for even extraction."],
      ["Steel Burr Hand Grinder", "48 mm steel burrs, stepless adjustment, magnetic catch cup. Grinds a V60 dose in under 30 seconds."],
      ["Hario V60 Dripper (02)", "The pour-over classic. Ceramic 02 dripper for 1-4 cups."],
      ["Paper Filters (02, 100 pcs)", "Oxygen-bleached cone filters for the 02 dripper. Rinse once, brew clean."],
      ["Kenya Nyeri AA", "Vivid blackcurrant acidity and a long, sweet finish. AA-grade lots from smallholder washing stations in Nyeri."],
      ["Sumatra Mandheling", "Earthy, full-bodied Sumatran with dark chocolate, cedar and a syrupy finish. Wet-hulled the traditional way."],
    ].map(([name, description]) => ({ name, description, slug: "", attributes: null }));

    it("carries no strength attribute (else this proves nothing)", () => {
      expect(JSON.stringify(LIVE_DEMO)).not.toContain("strength");
    });

    for (const [strength, terms] of Object.entries(STRENGTH_TERMS)) {
      it(`"${strength}" resolves from prose alone`, () => {
        const hit = terms.find((term) =>
          LIVE_DEMO.some((p) => matchesAllTokens(productHaystack(p), term)),
        );
        expect(
          hit,
          `on a pre-attribute shop, none of [${terms.join(", ")}] matches — "${strength}" is a dead option there`,
        ).toBeDefined();
      });
    }

    it("the FIRST term alone is not enough — which is why fallbacks exist", () => {
      // The measurement that started this: "strong" found nothing live.
      expect(
        LIVE_DEMO.some((p) => matchesAllTokens(productHaystack(p), "strong")),
      ).toBe(false);
    });
  });
});