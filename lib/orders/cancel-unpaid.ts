import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { transitionOrder } from "@/lib/orders/lifecycle";

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
 * The same holds for a discount code: checkout counted one use of it
 * (createOrder / createAcpOrder increment `usageCount`), so the cancel that
 * won the status write gives that one use back — never below 0, and never for
 * a paid or already-cancelled order. A code deleted since is simply skipped.
 *
 * transitionOrder (lib/orders/lifecycle.ts) does the writing; this names the rule
 * and the fact it records. `by` says which path it was.
 *
 * Call it inside a `$transaction`. Returns true when this call cancelled the
 * order and returned its stock; false when the order was not awaiting payment
 * (missing, paid, already cancelled, …) and nothing was written.
 */
export async function cancelUnpaidOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  by: { actor: string; source: string } = { actor: "system:cancel-unpaid", source: "cancel-unpaid" },
): Promise<boolean> {
  const { written } = await transitionOrder({
    client: tx,
    kind: "fact",
    ...by,
    orderId,
    from: "pending_payment",
    to: "cancelled",
  });
  return written;
}
