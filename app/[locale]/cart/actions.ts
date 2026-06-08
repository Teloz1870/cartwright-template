"use server";

import { revalidatePath } from "next/cache";
import { addItem, updateItemQuantity, removeItem, getCart } from "@/lib/cart";

/**
 * Read-only cart-summary til WebMCP's get_cart-tool (og anden klient-brug).
 * Læser den cookie-bundne kurv server-side; ingen mutation.
 */
export async function getCartSummaryAction(): Promise<{
  count: number;
  subtotalDkk: number;
  items: { productName: string; quantity: number; unitPriceDkk: number }[];
}> {
  const cart = await getCart();
  const items = (cart?.items ?? []).map((i) => ({
    productName: i.product.name,
    quantity: i.quantity,
    unitPriceDkk: i.variant?.priceDkk ?? i.product.priceDkk,
  }));
  return {
    count: items.reduce((n, i) => n + i.quantity, 0),
    subtotalDkk: items.reduce((s, i) => s + i.unitPriceDkk * i.quantity, 0),
    items,
  };
}

export async function addToCartAction(
  productId: string,
  variantId: string | null = null,
): Promise<void> {
  await addItem(productId, 1, variantId);
  revalidatePath("/cart");
  revalidatePath("/", "layout");
}

export async function updateCartItemAction(
  cartItemId: string,
  quantity: number
): Promise<void> {
  await updateItemQuantity(cartItemId, quantity);
  revalidatePath("/cart");
  revalidatePath("/", "layout");
}

export async function removeCartItemAction(cartItemId: string): Promise<void> {
  await removeItem(cartItemId);
  revalidatePath("/cart");
  revalidatePath("/", "layout");
}
