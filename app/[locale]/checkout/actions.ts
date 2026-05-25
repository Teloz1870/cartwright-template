"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getCartSessionId } from "@/lib/cart";
import { createOrder } from "@/lib/orders/create";
import { checkoutSchema } from "@/lib/validation";

export type PlaceOrderResult =
  | {
      ok: true;
      mode: "stripe";
      orderId: string;
      clientSecret: string;
      publishableKey: string;
      totalDkk: number;
    }
  | { ok: true; mode: "mock"; orderId: string }
  | { ok: false; error: string };

export async function placeOrder(
  formData: FormData,
): Promise<PlaceOrderResult> {
  const parsed = checkoutSchema.safeParse({
    shippingName: formData.get("shippingName"),
    email: formData.get("email"),
    shippingAddress: formData.get("shippingAddress"),
    shippingZip: formData.get("shippingZip"),
    shippingCity: formData.get("shippingCity"),
    discountCode: formData.get("discountCode"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ugyldige felter",
    };
  }

  const session = await auth();
  const cartSessionId = await getCartSessionId();
  const actor = session?.user?.id
    ? `user:${session.user.id}`
    : `cart:${cartSessionId}`;

  const result = await createOrder(parsed.data, { actor });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/kurv");
  revalidatePath("/konto/ordrer");

  // Discriminér på createOrder's `paymentMode`. Stripe-mode leverer
  // paymentIntentClientSecret + publishableKey + totalDkk; vi mapper
  // paymentIntentClientSecret → clientSecret ved boundary'en så frontend
  // (StripePaymentPanel) kan bruge det enklere navn.
  if (result.paymentMode === "stripe") {
    return {
      ok: true,
      mode: "stripe",
      orderId: result.orderId,
      clientSecret: result.paymentIntentClientSecret,
      publishableKey: result.publishableKey,
      totalDkk: result.totalDkk,
    };
  }

  // paymentMode === "mock"
  return { ok: true, mode: "mock", orderId: result.orderId };
}
