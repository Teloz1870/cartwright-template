"use client";

/**
 * Client-helper for ønskelisten. Henter brugerens id-sæt ÉN gang pr. side (delt
 * promise → alle hjerte-knapper deler ét request) og toggler via API.
 */

let setPromise: Promise<Set<string>> | null = null;

export function getWishlistSet(): Promise<Set<string>> {
  if (!setPromise) {
    setPromise = fetch("/api/wishlist")
      .then((r) => (r.ok ? r.json() : { productIds: [] }))
      .then((d: { productIds?: string[] }) => new Set(d.productIds ?? []))
      .catch(() => new Set<string>());
  }
  return setPromise;
}

export async function toggleWishlistItem(
  productId: string,
): Promise<{ wishlisted: boolean; loginRequired?: boolean }> {
  const res = await fetch("/api/wishlist/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
  });
  if (res.status === 401) return { wishlisted: false, loginRequired: true };
  const data = (await res.json()) as { wishlisted?: boolean };
  const set = await getWishlistSet();
  if (data.wishlisted) set.add(productId);
  else set.delete(productId);
  return { wishlisted: Boolean(data.wishlisted) };
}
