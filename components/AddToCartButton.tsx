"use client";

import { useState, useTransition } from "react";
import { addToCartAction } from "@/app/cart/actions";

interface AddToCartButtonProps {
  productId: string;
  /** Task B: optional variant — null betyder "produkt uden variant" (default). */
  variantId?: string | null;
  disabled?: boolean;
}

export function AddToCartButton({
  productId,
  variantId = null,
  disabled,
}: AddToCartButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);

  function handleClick() {
    startTransition(async () => {
      await addToCartAction(productId, variantId);
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    });
  }

  const isDisabled = disabled || isPending;

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={
        isDisabled && !isPending
          ? "bg-sol-muted/30 text-sol-muted font-black text-lg px-8 py-4 rounded-full cursor-not-allowed"
          : added
          ? "bg-green-600 text-white font-black text-lg px-8 py-4 rounded-full transition-colors"
          : "bg-sol-accent text-white font-black text-lg px-8 py-4 rounded-full hover:bg-sol-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      }
    >
      {added ? "Lagt i kurv ✓" : isPending ? "Tilføjer…" : "Læg i kurv"}
    </button>
  );
}
