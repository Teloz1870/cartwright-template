import "server-only";

import {
  calcDiscount,
  calcSubtotal,
  type DiscountInput,
  type PriceBreakdown,
  type PriceLine,
} from "@/lib/pricing";
import { resolveShipping, shippingChoices, type ShippingQuote } from "@/lib/shipping/zones";

/** A cart line as pricing needs it, plus its product's weight when known. */
export type CartPriceLine = PriceLine & { weightGram?: number | null };

export type CartPrice = PriceBreakdown & {
  /** The rate charged, by its name in /admin/shipping; null for the flat rate. */
  shippingRateName: string | null;
  /** The zone rate charged, whole (null for the flat rate): what an order records. */
  shippingRate: ShippingQuote | null;
};

/**
 * The one price of a cart, shipping included (SHIP0-b). Order creation, the
 * cart and checkout pages, and every agent quote use it, so what a customer or
 * agent is shown is what the order charges.
 *
 * Shipping is resolveShipping's: the flat rate unless the shop has shipping
 * zones on and a zone for its country, then that zone's cheapest rate for the
 * parcel's known weight. As before, it is decided on the subtotal BEFORE a discount.
 * With zones off this equals calcPriceBreakdown(lines, discount) exactly.
 *
 * Throws ShippingUnavailableError when the zones cannot be read.
 */
export async function priceCart(
  lines: CartPriceLine[],
  discount: DiscountInput,
  /** The delivery option the customer chose; none = the cheapest. */
  opts: { rateId?: string | null } = {},
): Promise<CartPrice> {
  const subtotalDkk = calcSubtotal(lines);
  const discountDkk = calcDiscount(subtotalDkk, discount);
  const quote = await resolveShipping({ subtotalDkk, weightGram: knownWeight(lines), rateId: opts.rateId });
  return {
    subtotalDkk,
    discountDkk,
    shippingDkk: quote.feeDkk,
    totalDkk: subtotalDkk - discountDkk + quote.feeDkk,
    shippingRateName: quote.source === "zone" ? (quote.rateName ?? null) : null,
    shippingRate: quote.source === "zone" ? quote : null,
  };
}

/**
 * The delivery options for a cart (checkout's delivery step): the zone rates
 * that fit its parcel, cheapest first, or none when the flat rate applies.
 */
export async function cartShippingOptions(lines: CartPriceLine[]): Promise<ShippingQuote[]> {
  const choices = await shippingChoices({ subtotalDkk: calcSubtotal(lines), weightGram: knownWeight(lines) });
  return choices.source === "zone" ? choices.options : [];
}

/**
 * The parcel's known weight in grams: every line that has a weight, the rest
 * counted as 0. It is a lower bound, so a weight band is never chosen below
 * what the parcel is known to weigh: one unweighed accessory must not turn a
 * 20 kg pallet order into a light parcel.
 */
function knownWeight(lines: CartPriceLine[]): number {
  let grams = 0;
  for (const line of lines) {
    if (typeof line.weightGram === "number" && line.weightGram > 0) grams += line.weightGram * line.quantity;
  }
  return grams;
}
