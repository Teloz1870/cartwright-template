import "server-only";

import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { withAudit, type AuditActor } from "@/lib/audit";

/**
 * When an operator cancels an order, its Stripe PaymentIntent is cancelled too.
 *
 * Without this the intent stayed live: a customer still on the payment page
 * could finish 3-D Secure and pay for an order the shop had already
 * cancelled. The webhook would (rightly) not mark that order paid — it leaves
 * a cancelled order alone and writes `orders.payment_not_applied` — so the
 * money sat in Stripe with nothing in the order saying so.
 *
 * Called by every operator cancel path (the admin status form, the bulk
 * action, the `orders.update_status` tool) AFTER the order's status is
 * written, so a cancel the state machine refused never touches Stripe.
 *
 * Fail-soft by contract: it never throws, and nothing it meets — Stripe not
 * configured, a network error, an intent that already succeeded — undoes or
 * blocks the order cancel. It never cancels an intent that has succeeded:
 * that money was captured, and a refund (the order page's refund action) is
 * how it goes back. Every outcome is logged, audited as
 * `orders.cancel_payment_intent`, and written to the order's timeline.
 */

export type PaymentIntentCancelOutcome =
  | "canceled"
  | "already_canceled"
  | "succeeded"
  | "failed";

export type PaymentIntentCancelResult = {
  outcome: PaymentIntentCancelOutcome;
  /** The order-timeline note — what the merchant reads. */
  note: string;
};

const NOTES: Record<Exclude<PaymentIntentCancelOutcome, "failed">, string> = {
  canceled:
    "Stripe payment cancelled — the customer can no longer pay for this order.",
  already_canceled: "The Stripe payment was already cancelled.",
  succeeded:
    "The customer had already paid, so the Stripe payment was left as it is. " +
    "Cancelling the order does not return the money — issue a refund from this order page.",
};

function failedNote(message: string): string {
  return (
    `Could not cancel the Stripe payment (${message}). Cancel it in the Stripe Dashboard; ` +
    "if the customer pays anyway, issue a refund from this order page."
  );
}

async function cancelInStripe(intentId: string): Promise<PaymentIntentCancelResult> {
  const stripe = await getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured");
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (intent.status === "succeeded") {
    return { outcome: "succeeded", note: NOTES.succeeded };
  }
  if (intent.status === "canceled") {
    return { outcome: "already_canceled", note: NOTES.already_canceled };
  }
  // Stripe refuses the cancel if the customer completed payment after the
  // retrieve above; that lands in the failed branch, with Stripe's reason.
  await stripe.paymentIntents.cancel(intentId);
  return { outcome: "canceled", note: NOTES.canceled };
}

/**
 * Cancel the PaymentIntent of an order an operator just cancelled. Returns
 * null when the order has no Stripe payment (mock or manual payment) —
 * nothing to cancel, nothing written.
 */
export async function cancelOrderPaymentIntent(args: {
  orderId: string;
  paymentIntentId: string | null | undefined;
  actor: AuditActor;
}): Promise<PaymentIntentCancelResult | null> {
  const { orderId, actor } = args;
  const intentId = args.paymentIntentId;
  if (!intentId) return null;

  let result: PaymentIntentCancelResult;
  try {
    result = await withAudit(
      { actor, tool: "orders.cancel_payment_intent", args: { orderId, intentId } },
      () => cancelInStripe(intentId),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result = { outcome: "failed", note: failedNote(message) };
  }

  const line = `[orders] payment intent ${intentId} of cancelled order ${orderId}: ${result.outcome}`;
  if (result.outcome === "failed") console.error(line);
  else console.info(line);

  await prisma.orderNote
    .create({
      data: {
        orderId,
        type: "system",
        author: actor,
        body: result.note,
        metaJson: JSON.stringify({ intentId, outcome: result.outcome }),
      },
    })
    .catch((err: unknown) => {
      console.error(`[orders] could not write the payment note for ${orderId}:`, err);
    });

  return result;
}
