"use server";

import { revalidatePath } from "next/cache";
import { addItem, updateItemQuantity, removeItem } from "@/lib/cart";

export async function addToCartAction(
  productId: string,
  variantId: string | null = null,
): Promise<void> {
  await addItem(productId, 1, variantId);
  revalidatePath("/kurv");
  revalidatePath("/", "layout");
}

export async function updateCartItemAction(
  cartItemId: string,
  quantity: number
): Promise<void> {
  await updateItemQuantity(cartItemId, quantity);
  revalidatePath("/kurv");
  revalidatePath("/", "layout");
}

export async function removeCartItemAction(cartItemId: string): Promise<void> {
  await removeItem(cartItemId);
  revalidatePath("/kurv");
  revalidatePath("/", "layout");
}
