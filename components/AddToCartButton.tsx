"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addToCartAction } from "@/app/[locale]/cart/actions";
import { useAnnounce } from "@/lib/a11y/announcement-context";

interface AddToCartButtonProps {
  productId: string;
  /** Task B: optional variant — null betyder "produkt uden variant" (default). */
  variantId?: string | null;
  disabled?: boolean;
  /**
   * Optional product name. When provided, the button gains a state-aware
   * accessible name ("Add/Adding/Added <name> to cart") so screen-reader users
   * know WHICH product they are adding — the visible label alone ("Add to cart")
   * carries no product context. Omitted (default) → no aria-label is emitted →
   * byte-identical to the legacy render.
   */
  productName?: string;
}

export function AddToCartButton({
  productId,
  variantId = null,
  disabled,
  productName,
}: AddToCartButtonProps) {
  const t = useTranslations("Cart");
  const [isPending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const announce = useAnnounce();

  function handleClick() {
    startTransition(async () => {
      await addToCartAction(productId, variantId);
      setAdded(true);
      announce(t("added"));
      setTimeout(() => setAdded(false), 2000);
    });
  }

  const isDisabled = disabled || isPending;

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={
        productName
          ? added
            ? t("addedNamed", { name: productName })
            : isPending
            ? t("addingNamed", { name: productName })
            : t("addNamed", { name: productName })
          : undefined
      }
      className={
        isDisabled && !isPending
          ? "bg-sol-muted/30 text-sol-muted font-black text-lg px-8 py-4 rounded-full cursor-not-allowed"
          : added
          ? "bg-green-600 text-white font-black text-lg px-8 py-4 rounded-full transition-colors"
          : "bg-sol-accent text-white font-black text-lg px-8 py-4 rounded-full hover:bg-sol-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      }
    >
      {added ? t("added") : isPending ? t("adding") : t("add")}
    </button>
  );
}
