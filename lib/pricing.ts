import { brand } from "@/brand.config";

/**
 * Backward-kompat re-exports der nu læser fra `brand.policies` i stedet for
 * hardcoded constants. Cartwright-forks ændrer disse værdier i brand.config.ts,
 * IKKE ved at editere denne fil.
 */
export const SHIPPING_FEE_OERE = brand.policies.shippingDefaultDkk;
export const FREE_SHIPPING_THRESHOLD_OERE = brand.policies.shippingFreeThresholdDkk;

export type PriceLine = { unitPriceDkk: number; quantity: number };
export type DiscountInput = { type: "percent" | "fixed"; value: number } | null;
export type PriceBreakdown = {
  subtotalDkk: number;
  discountDkk: number;
  shippingDkk: number;
  totalDkk: number;
};

/** Summen af alle kurvlinjer i øre. */
export function calcSubtotal(lines: PriceLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceDkk * l.quantity, 0);
}

/**
 * Fragt i øre: fast sats fra brand.policies, gratis ved/over tærsklen.
 *
 * Bemærk: ShippingSettings-DB-singleton (lib/tools/settings.ts) kan
 * overstyre via en fremtidig async-variant. Sync-versionen her bruger
 * brand.config som compile-time default — godt nok til 99% af callers
 * (cart/checkout-render).
 */
export function calcShipping(subtotalDkk: number): number {
  return subtotalDkk >= brand.policies.shippingFreeThresholdDkk
    ? 0
    : brand.policies.shippingDefaultDkk;
}

/** Rabatbeløb i øre, anvendt på subtotal — aldrig mere end subtotal. */
export function calcDiscount(subtotalDkk: number, discount: DiscountInput): number {
  if (!discount) return 0;
  const raw =
    discount.type === "percent"
      ? Math.round((subtotalDkk * discount.value) / 100)
      : discount.value;
  return Math.min(Math.max(raw, 0), subtotalDkk);
}

/** Fuld prisopdeling. Fragt beregnes ud fra subtotal FØR rabat. */
export function calcPriceBreakdown(
  lines: PriceLine[],
  discount: DiscountInput,
): PriceBreakdown {
  const subtotalDkk = calcSubtotal(lines);
  const discountDkk = calcDiscount(subtotalDkk, discount);
  const shippingDkk = calcShipping(subtotalDkk);
  const totalDkk = subtotalDkk - discountDkk + shippingDkk;
  return { subtotalDkk, discountDkk, shippingDkk, totalDkk };
}
