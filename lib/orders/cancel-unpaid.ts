import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { restockLines } from "@/lib/orders/restock";
import { statusLabel } from "@/lib/orders/status";

/**
 * The one rule for an order cancelled before it was paid: checkout took its
 * stock (createOrder's decrement), so cancelling it gives that stock back —
 * exactly once, whichever path gets there first:
 *
 *   - an operator cancel: the admin status form, the bulk action and the
 *     `orders.update_status` tool;
 *   - Stripe's `payment_intent.canceled` webhook — which, since #623, every
 *     operator cancel of a Stripe order fires by cancelling the intent;
 *   - the reconcile cron, for an intent cancelled while the webhook was missed;
 *   - createOrder's rollback when the PaymentIntent could not be created.
 *
 * The anchor is the status write itself: conditional on `pending_payment`, with
 * the restock in the same transaction and only when that write landed. The
 * second path to arrive finds the order cancelled and writes nothing. A paid
 * order is never restocked here — a refund moves money, not stock; a return
 * (receiveAndRestock) is how paid stock comes back — and neither is an order
 * already cancelled.
 *
 * Call it inside a `$transaction`. Returns true when this call cancelled the
 * order and returned its stock; false when the order was not awaiting payment
 * (missing, paid, already cancelled, …) and nothing was written.
 */
export async function cancelUnpaidOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<boolean> {
  const flipped = await tx.order.updateMany({
    where: { id: orderId, status: "pending_payment" },
    data: { status: "cancelled" },
  });
  if (flipped.count === 0) return false;
  const lines = await tx.orderItem.findMany({
    where: { orderId },
    select: { productId: true, variantId: true, quantity: true },
  });
  await restockLines(tx, lines);
  return true;
}

/**
 * An operator moved an order on from the status they read, but by the time the
 * write ran the order was in another one: the webhook or the cron cancelled it,
 * the customer paid, another operator got there first. Nothing was written; the
 * operator re-reads and decides (lib/orders/operator-status.ts).
 */
export class OrderChangedError extends Error {
  constructor(orderId: string, readStatus: string, message?: string) {
    super(
      message ??
        `Order ${orderId} is no longer "${statusLabel(readStatus)}" — it changed while it was being updated. ` +
          "Reload the order and try again.",
    );
    this.name = "OrderChangedError";
  }
}

/**
 * An operator asked to cancel an order that was awaiting payment, but by the
 * time the write ran it no longer was: the webhook or the cron cancelled it,
 * or the customer paid. Nothing was written; the operator re-reads and decides.
 */
export class OrderNoLongerUnpaidError extends OrderChangedError {
  constructor(orderId: string) {
    super(
      orderId,
      "pending_payment",
      `Order ${orderId} is no longer awaiting payment — it changed while it was being cancelled. ` +
        "Reload the order and try again.",
    );
    this.name = "OrderNoLongerUnpaidError";
  }
}

/** Appended to the order-timeline note of an operator cancel that restocked. */
export const UNPAID_CANCEL_RESTOCK_NOTE = "items returned to stock";
