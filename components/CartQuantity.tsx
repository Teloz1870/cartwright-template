"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateCartItemAction, removeCartItemAction } from "@/app/[locale]/cart/actions";
import { useAnnounce } from "@/lib/a11y/announcement-context";

interface CartQuantityProps {
  cartItemId: string;
  quantity: number;
  max: number;
  /**
   * Optional product name. When provided, the otherwise context-free "Remove"
   * button and the −/+ steppers gain a line-specific, localized accessible name
   * ("Fjern <name> fra kurven", "Reducér/Forøg antal af <name>" — English on the
   * `en` locale) so screen-reader users — who navigate button-by-button across
   * cart lines — know WHICH line each control acts on. Omitted (default) → the
   * Remove button emits no aria-label and the steppers fall back to their
   * context-free (still translated) labels.
   */
  itemName?: string;
}

export function CartQuantity({
  cartItemId,
  quantity,
  max,
  itemName,
}: CartQuantityProps) {
  const t = useTranslations("Cart");
  const [isPending, startTransition] = useTransition();
  const announce = useAnnounce();

  function handleDecrement() {
    startTransition(() => {
      updateCartItemAction(cartItemId, quantity - 1);
    });
  }

  function handleIncrement() {
    startTransition(() => {
      updateCartItemAction(cartItemId, quantity + 1);
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removeCartItemAction(cartItemId);
      announce(t("announceRemoved"));
    });
  }

  return (
    <div className="flex items-center gap-3">
      {/* Stepper pill */}
      <div className="flex items-center rounded-full border border-sol-ink/20 overflow-hidden">
        <button
          onClick={handleDecrement}
          disabled={isPending}
          aria-label={itemName ? t("decreaseQuantityOf", { name: itemName }) : t("decreaseQuantity")}
          className="w-8 h-8 flex items-center justify-center text-sol-ink hover:bg-sol-cream transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-bold text-sol-ink select-none">
          {quantity}
        </span>
        <button
          onClick={handleIncrement}
          disabled={isPending || quantity >= max}
          aria-label={itemName ? t("increaseQuantityOf", { name: itemName }) : t("increaseQuantity")}
          className="w-8 h-8 flex items-center justify-center text-sol-ink hover:bg-sol-cream transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>

      {/* Remove button */}
      <button
        onClick={handleRemove}
        disabled={isPending}
        aria-label={itemName ? t("removeItemNamed", { name: itemName }) : undefined}
        className="text-xs text-sol-muted underline underline-offset-2 hover:text-sol-accent transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t("remove")}
      </button>
    </div>
  );
}
