import { brand } from "@/brand.config";

/**
 * Indbygget moms (VAT) — single-rate baseline. Ren funktion, kan bruges både
 * server- og client-side (prisvisning + faktura). For multi-country/EU-OSS er
 * den managed vej Stripe Tax (features.stripeTax) — se lib/invoicing/README.
 *
 * Alle beløb i ØRE (minor units), samme konvention som resten af shoppen.
 */

export type VatBreakdown = {
  /** Beløb ekskl. moms (øre). */
  net: number;
  /** Moms-andel (øre). */
  vat: number;
  /** Beløb inkl. moms (øre). */
  gross: number;
  ratePct: number;
  pricesIncludeVat: boolean;
};

export function vatBreakdown(
  amountOere: number,
  opts?: { ratePct?: number; pricesIncludeVat?: boolean },
): VatBreakdown {
  const ratePct = opts?.ratePct ?? brand.policies.vatRatePct;
  const pricesIncludeVat = opts?.pricesIncludeVat ?? brand.policies.pricesIncludeVat;
  const rate = ratePct / 100;

  if (pricesIncludeVat) {
    // Prisen ER inkl. moms → træk momsen ud.
    const net = Math.round(amountOere / (1 + rate));
    return { net, vat: amountOere - net, gross: amountOere, ratePct, pricesIncludeVat };
  }
  // Prisen er ekskl. moms → læg moms ovenpå.
  const vat = Math.round(amountOere * rate);
  return { net: amountOere, vat, gross: amountOere + vat, ratePct, pricesIncludeVat };
}
