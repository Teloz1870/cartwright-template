import { describe, expect, it } from "vitest";

import {
  buildBrewRecommendation,
  packsFor,
  type CandidateProduct,
} from "@/designs/crema/webshop/brew-recommendation";

const fmt = (minor: number) =>
  `${(minor / 100).toFixed(2).replace(".", ",")} kr.`;

/** The real demo product, from industry-templates/coffee/seed-data.ts. */
const ETHIOPIA: CandidateProduct = {
  title: "Ethiopia Yirgacheffe",
  slug: "ethiopia-yirgacheffe",
  description:
    "Bright, floral single-origin from the Yirgacheffe region. Notes of bergamot, jasmine, and lemon. Best brewed as pour-over or AeroPress.",
  inStock: true,
  priceMinor: 14900,
  currency: "DKK",
  formattedPrice: "149,00 kr.",
  packSizeGrams: 250,
};

describe("packsFor", () => {
  it("rounds UP — you cannot buy 0.47 of a bag", () => {
    expect(packsFor(118, 250)).toEqual({ quantity: 1, remainingGrams: 132 });
    expect(packsFor(250, 250)).toEqual({ quantity: 1, remainingGrams: 0 });
    expect(packsFor(251, 250)).toEqual({ quantity: 2, remainingGrams: 249 });
  });

  it("never recommends zero bags", () => {
    // A tiny brew still needs a bag; `Math.ceil` alone would return 0 for 0 g.
    expect(packsFor(0, 250).quantity).toBe(1);
    expect(packsFor(1, 250)).toEqual({ quantity: 1, remainingGrams: 249 });
  });

  it("says nothing about leftovers when the pack size is unknown", () => {
    // Inventing a number would be worse than admitting the gap.
    expect(packsFor(118, null)).toEqual({ quantity: 1, remainingGrams: null });
    expect(packsFor(118, 0)).toEqual({ quantity: 1, remainingGrams: null });
  });
});

describe("the owner's target prompt: ten cups, bright", () => {
  const rec = buildBrewRecommendation(10, "bright", [ETHIOPIA], "/en", fmt);

  it("computes the recipe from the shop's own guide", () => {
    // 10 cups × 200 g = 2000 g water; 1:17 → 118 g coffee.
    expect(rec.recipe).toMatchObject({
      cups: 10,
      strength: "bright",
      ratio: "1:17",
      waterGrams: 2000,
      coffeeGrams: 118,
    });
  });

  it("resolves it to a real, buyable line", () => {
    expect(rec.items).toHaveLength(1);
    const [item] = rec.items;
    expect(item.title).toBe("Ethiopia Yirgacheffe");
    expect(item.requiredGrams).toBe(118);
    expect(item.packSizeGrams).toBe(250);
    expect(item.quantity).toBe(1);
    expect(item.remainingGrams).toBe(132);
    expect(item.inStock).toBe(true);
  });

  it("carries money an agent cannot misread", () => {
    const [item] = rec.items;
    // A bare `14900` reads as fourteen thousand nine hundred to a model.
    expect(item.unitPrice).toEqual({
      amountMinor: 14900,
      currency: "DKK",
      formatted: "149,00 kr.",
    });
    // The subtotal is COMPUTED, so its formatted string must come from the
    // shop's formatter rather than being borrowed or left blank.
    expect(item.subtotal.amountMinor).toBe(14900);
    expect(item.subtotal.formatted).toBe(fmt(14900));
  });

  it("builds the URL from the CURRENT route, not a store-wide default", () => {
    // The live bug this guards: search returned /da/product/... on /en,
    // because the URL came from getBrand().defaultLocale.
    expect(rec.items[0].url).toBe("/en/product/ethiopia-yirgacheffe");
    const da = buildBrewRecommendation(10, "bright", [ETHIOPIA], "/da", fmt);
    expect(da.items[0].url).toBe("/da/product/ethiopia-yirgacheffe");
  });

  it("has nothing to warn about when the shop can serve the brew", () => {
    expect(rec.warnings).toEqual([]);
  });
});

describe("the honest edges", () => {
  it("prefers an in-stock candidate over a better-ranked sold-out one", () => {
    const soldOut = { ...ETHIOPIA, title: "Sold out pick", inStock: false };
    const other: CandidateProduct = { ...ETHIOPIA, title: "In stock pick", slug: "b" };
    const rec = buildBrewRecommendation(10, "bright", [soldOut, other], "/en", fmt);
    expect(rec.items[0].title).toBe("In stock pick");
    expect(rec.warnings).toEqual([]);
  });

  it("reports a sold-out pick rather than refusing", () => {
    // The shop's own add-to-cart tool reports stock instead of blocking; two
    // stock policies in one shop is worse than an honest warning.
    const soldOut = { ...ETHIOPIA, inStock: false };
    const rec = buildBrewRecommendation(10, "bright", [soldOut], "/en", fmt);
    expect(rec.items).toHaveLength(1);
    expect(rec.items[0].inStock).toBe(false);
    expect(rec.warnings.join(" ")).toContain("out of stock");
  });

  it("still returns the recipe when the catalogue has nothing", () => {
    // The calculation is useful on its own; an empty shelf must not swallow it.
    const rec = buildBrewRecommendation(4, "balanced", [], "/en", fmt);
    expect(rec.recipe.coffeeGrams).toBe(50);
    expect(rec.items).toEqual([]);
    expect(rec.warnings.join(" ")).toContain("No matching coffee");
  });

  it("warns when it cannot know the pack size", () => {
    const noSize = { ...ETHIOPIA, packSizeGrams: null };
    const rec = buildBrewRecommendation(10, "bright", [noSize], "/en", fmt);
    expect(rec.items[0].quantity).toBe(1);
    expect(rec.items[0].remainingGrams).toBeNull();
    expect(rec.warnings.join(" ")).toContain("pack size");
  });
});

/**
 * One item, one spelling of money. The recommendation carries a `unitPrice`
 * the catalogue formatted and a `subtotal` this module formats, and for a
 * while those were different code: unitPrice read "149,00 kr." beside subtotal
 * "149.00 DKK". That is precisely the ambiguity `unitPrice` was added to
 * remove — a model quoting one of them back to a shopper picks a coin flip.
 */
describe("the two prices in an item are written the same way", () => {
  const shopFormat = (minor: number) =>
    new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(minor / 100);

  const bag = (over: Partial<CandidateProduct> = {}): CandidateProduct => ({
    title: "Ethiopia Yirgacheffe",
    slug: "ethiopia-yirgacheffe",
    description: "Bright and floral.",
    inStock: true,
    priceMinor: 14900,
    currency: "DKK",
    formattedPrice: shopFormat(14900),
    packSizeGrams: 250,
    ...over,
  });

  it("formats the subtotal with the same function as the unit price", () => {
    const rec = buildBrewRecommendation(10, "bright", [bag()], "/en", shopFormat);
    const item = rec.items[0];
    // Same shape of string: if one says "kr." the other must not say "DKK".
    expect(item.subtotal.formatted).toBe(shopFormat(item.subtotal.amountMinor));
    expect(item.unitPrice.formatted).toBe(shopFormat(item.unitPrice.amountMinor));
  });

  it("takes the currency from the CHOSEN product, not the first candidate", () => {
    // The caller once closed over `usable[0].currency`, which is wrong the
    // moment the first candidate is out of stock and a later one is picked.
    const rec = buildBrewRecommendation(
      4,
      "balanced",
      [bag({ inStock: false, currency: "SEK" }), bag({ title: "In stock", currency: "DKK" })],
      "/en",
      shopFormat,
    );
    expect(rec.items[0].title).toBe("In stock");
    expect(rec.items[0].unitPrice.currency).toBe("DKK");
    expect(rec.items[0].subtotal.currency).toBe("DKK");
  });

  it("does not cut the reason inside a decimal number", () => {
    const rec = buildBrewRecommendation(
      4,
      "balanced",
      [bag({ description: "Brewed at 92.5 °C. Bright and floral." })],
      "/en",
      shopFormat,
    );
    expect(rec.items[0].reason).toBe("Brewed at 92.5 °C.");
  });
});

/**
 * A shop with an embedding provider configured never returns an empty search.
 *
 * `lib/search/semantic.ts` scores EVERY candidate and returns the top N with
 * no relevance threshold, so on such a shop `products.length > 0` stops being
 * a match signal — and the coffee shop the crema pack ships for also stocks
 * kettles, grinders, drippers and filters. Without a domain constraint the
 * tool would answer "for 10 cups you need 118 g — buy 1 × Paper Filters".
 *
 * A pack size is the constraint, because coffee is what this shop sells by
 * weight, and `weightG` is the PACK's own vocabulary rather than a category
 * slug an owner can rename. It is a preference, not a filter: a bean with no
 * recorded pack size is still the right answer when it is the only one.
 */
describe("the recommendation picks coffee, not whatever ranked first", () => {
  const money = (minor: number) =>
    new Intl.NumberFormat("en", { style: "currency", currency: "DKK" }).format(minor / 100);
  const row = (over: Partial<CandidateProduct>): CandidateProduct => ({
    title: "row",
    slug: "row",
    description: null,
    inStock: true,
    priceMinor: 1000,
    currency: "DKK",
    formattedPrice: money(1000),
    packSizeGrams: null,
    ...over,
  });

  it("skips a top-ranked accessory for the coffee behind it", () => {
    const rec = buildBrewRecommendation(
      10,
      "bright",
      [
        row({ title: "Paper Filters (02, 100 pcs)", slug: "paper-filters" }),
        row({ title: "Ethiopia Yirgacheffe", slug: "ethiopia", packSizeGrams: 250 }),
      ],
      "/en",
      money,
    );
    expect(rec.items[0].title).toBe("Ethiopia Yirgacheffe");
  });

  it("still prefers IN STOCK over merely having a pack size", () => {
    // Stock is the stronger signal: recommending a sold-out bag helps nobody.
    const rec = buildBrewRecommendation(
      10,
      "bright",
      [
        row({ title: "Sold out bean", slug: "sold-out", packSizeGrams: 250, inStock: false }),
        row({ title: "In stock bean", slug: "in-stock", packSizeGrams: 250 }),
      ],
      "/en",
      money,
    );
    expect(rec.items[0].title).toBe("In stock bean");
  });

  it("falls back to a pack-size-less product rather than refusing", () => {
    const rec = buildBrewRecommendation(
      10,
      "bright",
      [row({ title: "Unmeasured bean", slug: "unmeasured" })],
      "/en",
      money,
    );
    expect(rec.items[0].title).toBe("Unmeasured bean");
    expect(rec.warnings.join(" ")).toContain("does not list a pack size");
  });

  it("prefers an out-of-stock COFFEE over an in-stock accessory only when nothing else fits", () => {
    // Ordering pinned end to end, so a later 'tidy-up' of the four groups
    // cannot silently reshuffle them.
    const rec = buildBrewRecommendation(
      10,
      "bright",
      [row({ title: "Accessory", slug: "acc" }), row({ title: "Bean", slug: "bean", packSizeGrams: 250 })],
      "/en",
      money,
    );
    expect(rec.items[0].title).toBe("Bean");
  });
});
