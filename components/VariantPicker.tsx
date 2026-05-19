"use client";

import { useMemo, useState } from "react";
import { formatPriceDkk } from "@/lib/format";
import { AddToCartButton } from "@/components/AddToCartButton";

export type VariantOption = {
  id: string;
  sku: string;
  priceDkk: number;
  stock: number;
  /** Flat key→string mapping. Fx {højde: "2m", bredde: "3m", farve: "grå"}. */
  attributes: Record<string, string>;
};

type Props = {
  productId: string;
  /** Fallback-pris hvis ingen variant er valgt endnu (= laveste variant-pris). */
  basePriceDkk: number;
  variants: VariantOption[];
};

/**
 * Task B variant-picker — renderes på PDP når product.variants.length > 0.
 *
 * UX-pattern: én <select> pr. unique attribute-key på tværs af alle variants.
 * Valgt-kombination resolveres mod variants[] — hvis match, vis pris + add-to-cart;
 * hvis ingen match (ugyldig kombination), vis fejl-besked.
 *
 * Pris-/lager-display opdateres reaktivt ved hvert valg. Add-to-cart bruger
 * variantId så server-action gemmer korrekt CartItem.
 */
export default function VariantPicker({ productId, basePriceDkk, variants }: Props) {
  // Saml unique values pr. attribute-key (rækkefølge bevaret fra første variant).
  const attributeKeys = useMemo(() => {
    const keys: string[] = [];
    for (const v of variants) {
      for (const k of Object.keys(v.attributes)) {
        if (!keys.includes(k)) keys.push(k);
      }
    }
    return keys;
  }, [variants]);

  const valuesByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const key of attributeKeys) {
      const values: string[] = [];
      for (const v of variants) {
        const val = v.attributes[key];
        if (typeof val === "string" && !values.includes(val)) values.push(val);
      }
      map[key] = values;
    }
    return map;
  }, [attributeKeys, variants]);

  const [selection, setSelection] = useState<Record<string, string>>({});

  // Resolve match: alle keys skal være valgt OG matche samme variant.
  const selectedVariant = useMemo(() => {
    if (Object.keys(selection).length !== attributeKeys.length) return null;
    return (
      variants.find((v) =>
        attributeKeys.every((k) => v.attributes[k] === selection[k]),
      ) ?? null
    );
  }, [selection, attributeKeys, variants]);

  const displayPrice = selectedVariant?.priceDkk ?? basePriceDkk;
  const inStock = selectedVariant ? selectedVariant.stock > 0 : true;
  const isComplete = Object.keys(selection).length === attributeKeys.length;
  const invalidCombo = isComplete && !selectedVariant;

  return (
    <div className="flex flex-col gap-3">
      {attributeKeys.map((key) => (
        <label key={key} className="flex flex-col gap-1 text-sm">
          <span className="font-bold uppercase tracking-wider text-sol-muted text-xs">
            {key}
          </span>
          <select
            value={selection[key] ?? ""}
            onChange={(e) =>
              setSelection((prev) => ({ ...prev, [key]: e.target.value }))
            }
            className="rounded-lg border border-sol-ink/15 bg-white px-3 py-2 font-semibold text-sol-ink focus:border-sol-accent focus:outline-none focus:ring-2 focus:ring-sol-accent/25"
          >
            <option value="" disabled>
              Vælg {key}
            </option>
            {valuesByKey[key].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ))}

      {/* Reaktiv pris-visning når en variant er valgt. */}
      <p className="text-sol-accent font-black text-2xl">
        {formatPriceDkk(displayPrice)}
      </p>

      {invalidCombo && (
        <p className="text-sm font-bold text-red-700">
          Den valgte kombination findes ikke. Prøv et andet valg.
        </p>
      )}
      {selectedVariant && !inStock && (
        <p className="text-sm font-bold text-sol-accent">
          Den valgte variant er udsolgt.
        </p>
      )}

      <AddToCartButton
        productId={productId}
        variantId={selectedVariant?.id ?? null}
        disabled={!selectedVariant || !inStock}
      />
    </div>
  );
}
