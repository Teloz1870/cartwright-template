"use client";

import { useTransition } from "react";
import { updateCartItemAction, removeCartItemAction } from "@/app/cart/actions";

interface CartQuantityProps {
  cartItemId: string;
  quantity: number;
  max: number;
}

export function CartQuantity({ cartItemId, quantity, max }: CartQuantityProps) {
  const [isPending, startTransition] = useTransition();

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
    startTransition(() => {
      removeCartItemAction(cartItemId);
    });
  }

  return (
    <div className="flex items-center gap-3">
      {/* Stepper pill */}
      <div className="flex items-center rounded-full border border-sol-ink/20 overflow-hidden">
        <button
          onClick={handleDecrement}
          disabled={isPending}
          aria-label="Reducer antal"
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
          aria-label="Forøg antal"
          className="w-8 h-8 flex items-center justify-center text-sol-ink hover:bg-sol-cream transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>

      {/* Remove button */}
      <button
        onClick={handleRemove}
        disabled={isPending}
        className="text-xs text-sol-muted underline underline-offset-2 hover:text-sol-accent transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Fjern
      </button>
    </div>
  );
}
