"use client";

import { useEffect, useState } from "react";

import { getWishlistSet, toggleWishlistItem } from "@/plugins/wishlist/lib/wishlist-client";

/**
 * Hjerte-knap. Hydrerer initial-state fra det delte ønskeliste-sæt. Stopper
 * propagation/preventDefault så den kan ligge inde i et produktkort-link uden at
 * navigere. Ikke logget ind → sendes til login.
 */
export function WishlistButton({
  productId,
  className = "",
}: {
  productId: string;
  className?: string;
}) {
  const [on, setOn] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    getWishlistSet().then((set) => {
      if (active) setOn(set.has(productId));
    });
    return () => {
      active = false;
    };
  }, [productId]);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    const prev = on;
    setOn(!prev); // optimistisk
    const r = await toggleWishlistItem(productId);
    if (r.loginRequired) {
      setOn(prev);
      window.location.href = "/account/login";
      return;
    }
    setOn(r.wishlisted);
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? "Fjern fra ønskeliste" : "Føj til ønskeliste"}
      className={`grid h-9 w-9 place-items-center rounded-full bg-white/90 text-sol-ink shadow-sm backdrop-blur transition hover:bg-white disabled:opacity-60 ${className}`}
      disabled={pending}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
        style={{ color: on ? "#e11d48" : undefined }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21s-7.5-4.6-10-9.2C.6 9.1 2 6 5 6c2 0 3.2 1.3 4 2.5C9.8 7.3 11 6 13 6c3 0 4.4 3.1 3 5.8C19.5 16.4 12 21 12 21z"
        />
      </svg>
    </button>
  );
}
