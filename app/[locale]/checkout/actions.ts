"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getCartSessionId } from "@/lib/cart";
import { createOrder } from "@/lib/orders/create";
import { checkoutSchema } from "@/lib/validation";

/**
 * Stable, language-neutral failure codes so the client can render a localized
 * message (the `error` string stays English for logs/tests/non-UI callers).
 * Mirrors createOrder's code union + a VALIDATION code for the schema step.
 */
export type OrderErrorCode =
  | "VALIDATION"
  | "EMPTY_CART"
  | "OUT_OF_STOCK"
  | "INVALID_DISCOUNT"
  | "PAYMENT_INIT_FAILED"
  | "INTERNAL";

export type PlaceOrderResult =
  | {
      ok: true;
      mode: "stripe";
      orderId: string;
      clientSecret: string;
      publishableKey: string;
      totalDkk: number;
      /**
       * What the card is charged, in the currency it is charged in — passed
       * through from createOrder rather than re-derived. `totalDkk` is the
       * base-currency ledger figure and is NOT the Stripe amount whenever
       * multiCurrency puts the shopper in another currency.
       */
      chargeAmountMinor: number;
      chargeCurrency: string;
    }
  | { ok: true; mode: "mock"; orderId: string }
  | { ok: false; error: string; code: OrderErrorCode };

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
      error: parsed.error.issues[0]?.message ?? "Invalid fields",
      code: "VALIDATION",
    };
  }

  const session = await auth();
  const cartSessionId = await getCartSessionId();
  const actor = session?.user?.id
    ? `user:${session.user.id}`
    : `cart:${cartSessionId}`;

  const result = await createOrder(parsed.data, { actor });
  if (!result.ok) {
    return { ok: false, error: result.error, code: result.code };
  }

  revalidatePath("/cart");
  revalidatePath("/account/orders");

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
      chargeAmountMinor: result.chargeAmountMinor,
      chargeCurrency: result.chargeCurrency,
    };
  }

  // paymentMode === "mock"
  return { ok: true, mode: "mock", orderId: result.orderId };
}
