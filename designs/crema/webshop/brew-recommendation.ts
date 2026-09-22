import { computeBrew, STRENGTH_RATIO, type Strength } from "./brew-math";

/**
 * Turn a brew recipe into a BUYABLE recommendation: how much coffee, which
 * bag on this shop's shelf, how many of them, and what is left over.
 *
 * WHY THIS SHAPE, and not a stored "plan" the agent applies by id.
 *
 * The obvious design is a server-stored plan plus a mutation tool that applies
 * it. Four measurements against this codebase argued against it, and each one
 * is worth keeping written down:
 *
 * 1. The entry's thesis is progressive disclosure — an agent only sees the
 *    tools that make sense on the page it is on, and "the PDP sells its own
 *    product". A homepage tool that puts arbitrary catalogue SKUs in the cart
 *    is the first tool whose effect is not about its own page. It would
 *    contradict the claim the work is judged on.
 * 2. `calculate_brew_ratio` is annotated `readOnlyHint: true`, and clients use
 *    that hint to decide whether a call needs human approval. A tool that
 *    writes a plan row on every invocation must drop the hint. Reading the
 *    catalogue keeps it honest.
 * 3. Plan ownership has no safe key here. Guest identity is the `cart_session`
 *    cookie, but signing in DELETES the guest cart row (`mergeGuestCartIntoUser`),
 *    so a plan keyed on the cart evaporates mid-flow and a retry double-adds.
 *    And minting the cookie during a mere calculation would provision a 30-day
 *    identifier for every visitor of a shop that ships a consent banner.
 * 4. The apparatus would do no work. Cups are capped at 12, a cup is 200 g,
 *    and the strongest ratio is 1:15 — so at most 160 g of coffee, against a
 *    catalogue where every bag is 250 g. Quantity is 1 for every legal input.
 *
 * So the recommendation is READ-ONLY and the mutation stays where the shop
 * already put it: the agent navigates to the product and uses that page's own
 * add-to-cart tool. Intent in, verified cart out — through the shop's existing
 * doors, not a new one that bypasses them.
 */

/** Money as an agent should receive it — never a bare number. */
export type RecommendationMoney = {
  amountMinor: number;
  currency: string;
  formatted: string;
};

export type RecommendedItem = {
  title: string;
  /** Locale-prefixed product URL, built from the CURRENT route. */
  url: string;
  /** Why this product, in the shop's own words. */
  reason: string;
  requiredGrams: number;
  packSizeGrams: number | null;
  quantity: number;
  /** Coffee left in the bag(s) after this brew, when the size is known. */
  remainingGrams: number | null;
  inStock: boolean;
  unitPrice: RecommendationMoney;
  subtotal: RecommendationMoney;
};

export type BrewRecommendation = {
  recipe: ReturnType<typeof computeBrew> & { strength: Strength };
  items: RecommendedItem[];
  /** Anything the agent should say out loud rather than silently absorb. */
  warnings: string[];
};

/** A catalogue row, reduced to what a recommendation needs. */
export type CandidateProduct = {
  title: string;
  slug: string;
  description?: string | null;
  inStock: boolean;
  priceMinor: number;
  currency: string;
  formattedPrice: string;
  packSizeGrams?: number | null;
};

/**
 * How many bags, and what is left over.
 *
 * Exported because the arithmetic is the part worth testing on its own: the
 * ceiling is the difference between "you need 118 g" and "buy one 250 g bag".
 */
export function packsFor(
  requiredGrams: number,
  packSizeGrams: number | null | undefined,
): { quantity: number; remainingGrams: number | null } {
  if (!packSizeGrams || packSizeGrams <= 0) {
    // Unknown pack size: recommend one and say nothing about leftovers rather
    // than inventing a number.
    return { quantity: 1, remainingGrams: null };
  }
  const quantity = Math.max(1, Math.ceil(requiredGrams / packSizeGrams));
  return {
    quantity,
    remainingGrams: quantity * packSizeGrams - requiredGrams,
  };
}

/**
 * Build the recommendation from a recipe and the candidates a search returned.
 *
 * Pure: no DB, no network, no DOM — the same property that lets `brew-math`
 * serve both the human's calculator and the agent's tool. The caller does the
 * catalogue read and hands the rows in.
 */
/**
 * The first sentence of a description, for the "why this one" line.
 *
 * Splitting on "." alone cuts inside numbers: a roaster who writes "Brewed at
 * 92.5 °C. Bright and floral." got the reason "Brewed at 92". A sentence end
 * is a period followed by whitespace or the end of the string.
 */
function firstSentence(text: string | null | undefined): string {
  if (!text) return "";
  const end = text.search(/[.!?](\s|$)/);
  return (end === -1 ? text : text.slice(0, end + 1)).trim();
}

export function buildBrewRecommendation(
  cups: number,
  strength: Strength,
  candidates: CandidateProduct[],
  localePrefix: string,
  /**
   * The shop's own money formatter. Passed in rather than imported so this
   * module stays pure and isomorphic — and so the SUBTOTAL, which is computed
   * here and therefore has no formatted string to borrow from the catalogue
   * row, is rendered by the same code as every other price on the site.
   */
  formatMoney: (amountMinor: number) => string,
): BrewRecommendation {
  const recipe = { strength, ...computeBrew(cups, STRENGTH_RATIO[strength]) };
  const warnings: string[] = [];

  // Coffee first, and the ordering matters more than it looks.
  //
  // The tool asks the catalogue "what matches 'bright'?" and used to trust
  // that the answer was coffee. On a shop with an embedding provider
  // configured, it is not: lib/search/semantic.ts scores EVERY candidate and
  // returns the top N with no relevance threshold, so a non-empty query can
  // never come back empty. The recommendation would then cheerfully answer
  // "for 10 cups you need 118 g — buy 1 × Paper Filters (02, 100 pcs)".
  //
  // A pack size is the signal, because coffee is the thing this shop sells by
  // weight — and it is the pack's OWN vocabulary (weightG), not a category
  // slug a shop owner can rename. Preference, not a filter: a bean whose
  // pack size is simply unrecorded is still the right answer when it is all
  // there is, and it still gets its honest "no pack size" warning below.
  const byPreference = [
    ...candidates.filter((c) => c.inStock && c.packSizeGrams != null),
    ...candidates.filter((c) => c.inStock && c.packSizeGrams == null),
    ...candidates.filter((c) => !c.inStock && c.packSizeGrams != null),
    ...candidates.filter((c) => !c.inStock && c.packSizeGrams == null),
  ];
  const chosen = byPreference[0];
  if (!chosen) {
    warnings.push(
      "No matching coffee is listed right now — the recipe still stands.",
    );
    return { recipe, items: [], warnings };
  }
  if (!chosen.inStock) {
    // Reported, not refused: the shop's own add-to-cart tool reports stock
    // rather than blocking, and two stock policies in one shop is worse than
    // an honest warning.
    warnings.push(`${chosen.title} is out of stock.`);
  }

  const { quantity, remainingGrams } = packsFor(
    recipe.coffeeGrams,
    chosen.packSizeGrams,
  );
  if (chosen.packSizeGrams == null) {
    warnings.push(
      `${chosen.title} does not list a pack size, so this recommends one of it.`,
    );
  }

  const money = (amountMinor: number, formatted: string): RecommendationMoney => ({
    amountMinor,
    currency: chosen.currency,
    formatted,
  });

  return {
    recipe,
    items: [
      {
        title: chosen.title,
        url: `${localePrefix}/product/${chosen.slug}`,
        reason: firstSentence(chosen.description) || chosen.title,
        requiredGrams: recipe.coffeeGrams,
        packSizeGrams: chosen.packSizeGrams ?? null,
        quantity,
        remainingGrams,
        inStock: chosen.inStock,
        unitPrice: money(chosen.priceMinor, chosen.formattedPrice),
        subtotal: money(
          chosen.priceMinor * quantity,
          formatMoney(chosen.priceMinor * quantity),
        ),
      },
    ],
    warnings,
  };
}
