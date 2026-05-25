"use client";

import { AddToCartButton } from "@/components/AddToCartButton";
import { formatPriceDkk } from "@/lib/format";

type Props = {
  productId: string;
  name: string;
  priceDkk: number;
  inStock: boolean;
};

/**
 * Phase 7 Task E — sticky add-to-cart-bar for mobile (≤768px). Vises kun
 * under md-breakpoint (md:hidden). Genbruger AddToCartButton 1:1 så feedback-
 * state ("Lagt i kurv ✓") matcher inline-knappen på desktop.
 *
 * iOS safe-area-inset håndteres med max() så bar'en ikke ligger under home-
 * indikatoren på iPhone X+. Fallback til 0.75rem på ældre browsere/Android.
 *
 * z-40 = under modale dialoger (z-50 fx AI Stylist Panel) men over normal
 * content. backdrop-blur giver kontekst-bevidst look uden at slå hele
 * bagvedliggende UI ihjel.
 */
export default function PDPStickyAtcBar({ productId, name, priceDkk, inStock }: Props) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-sol-glass-border-dark bg-sol-cream/85 px-4 pt-3 backdrop-blur-xl backdrop-saturate-150 md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-sol-muted">{name}</p>
          <p className="text-base font-black text-sol-accent">
            {formatPriceDkk(priceDkk)}
          </p>
        </div>
        <div className="shrink-0">
          <AddToCartButton productId={productId} disabled={!inStock} />
        </div>
      </div>
    </div>
  );
}
