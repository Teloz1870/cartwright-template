/**
 * Canonical shop-mode predicates — the single place that answers "what kind of
 * site is this?".
 *
 * Historically three fields all signalled "is this a shop?": `brand.mode`,
 * `brand.ecommerceEnabled`, and `brand.features.webshop`. That redundancy was a
 * real source of drift + confusion (Phase G/H incidents). These helpers make
 * `mode` the canonical identity and encode which underlying field is
 * authoritative for each question, so call sites stop hand-rolling
 * `!brand.features.webshop` vs `!brand.ecommerceEnabled` vs `mode === "website"`.
 *
 * Behaviour-preserving: `isEcommerce()` reads the already-guarded
 * `ecommerceEnabled` field (computed once in lib/brand.ts with the website-mode
 * guard), it does NOT recompute it. The invariant test
 * (tests/unit/mode-invariants.test.ts) locks the relationship so the three can
 * never silently diverge again.
 *
 * Works with both the static `brand` (brand.config.ts) and the merged runtime
 * brand (lib/brand.ts getBrand()).
 */

export type ShopMode = "website" | "webshop" | "agent-marketplace";

/** Minimal structural shape these predicates read — satisfied by brand + MergedBrand. */
export type ModeLike = {
  mode: string;
  ecommerceEnabled?: boolean;
  features?: { webshop?: boolean };
};

/** Corporate / marketing site — no cart. */
export function isWebsite(b: ModeLike): boolean {
  return b.mode === "website";
}

/** Full e-commerce storefront (cart/checkout/PLP/PDP). */
export function isWebshop(b: ModeLike): boolean {
  return b.mode === "webshop";
}

/** Agent-first / A2A marketplace. */
export function isAgentMarketplace(b: ModeLike): boolean {
  return b.mode === "agent-marketplace";
}

/**
 * Does this site sell? Canonical gate for cart/checkout/product UI. Reads the
 * guarded `ecommerceEnabled` field (website-mode forces it false in lib/brand.ts)
 * and falls back to deriving from mode when the field is absent.
 */
export function isEcommerce(b: ModeLike): boolean {
  if (typeof b.ecommerceEnabled === "boolean") return b.ecommerceEnabled;
  return b.mode !== "website";
}
