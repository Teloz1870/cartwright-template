import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { statusLabel } from "@/lib/orders/status";
import {
  OrderChangedError,
  OrderNoLongerUnpaidError,
  UNPAID_CANCEL_RESTOCK_NOTE,
  cancelUnpaidOrder,
} from "@/lib/orders/cancel-unpaid";

/** The order-timeline line of an operator status move: "Status: Paid → Shipped". */
export function statusTransitionLine(from: string, to: string): string {
  return `Status: ${statusLabel(from)} → ${statusLabel(to)}`;
}

/** True ⟺ this move cancels an order still awaiting payment, so its stock goes back. */
export function isUnpaidCancel(from: string, to: string): boolean {
  return from === "pending_payment" && to === "cancelled";
}

/**
 * The one write behind every operator status move: the admin status form, the
 * bulk action and `orders.update_status` (RACE-MARKPAID).
 *
 * The write is conditional on `from` — the status the caller read and checked
 * the move against. Between that read and this write another path may have
 * moved the order: the webhook or the cron cancelled it and returned its stock,
 * the customer paid, another operator shipped it. An unconditional write would
 * apply a decision made about a state that no longer exists: a stale "mark
 * paid" turned a cancelled, restocked order back into a paid one, whose units
 * were then both shipped and on sale to the next checkout. A write that matches
 * no row is refused with OrderChangedError, and nothing is written.
 *
 * A cancel of an order awaiting payment goes through cancelUnpaidOrder, which
 * is conditional the same way and returns the stock. The order-timeline note
 * lands in the same transaction, so the timeline never shows a move that did
 * not happen, and every operator path writes the same one.
 *
 * Call it inside a `$transaction`.
 */
export async function writeOperatorStatus(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    from: string;
    to: string;
    actor: string;
    /** Replaces the default note: a manual refund registration words its own. */
    note?: { body: string; meta: Record<string, unknown> };
  },
): Promise<{ restocked: boolean }> {
  const { orderId, from, to, actor } = input;
  const restocked = isUnpaidCancel(from, to);
  if (restocked) {
    if (!(await cancelUnpaidOrder(tx, orderId))) throw new OrderNoLongerUnpaidError(orderId);
  } else {
    const written = await tx.order.updateMany({
      where: { id: orderId, status: from },
      data: { status: to },
    });
    if (written.count === 0) throw new OrderChangedError(orderId, from);
  }
  const line = statusTransitionLine(from, to);
  const note = input.note ?? {
    body: restocked ? `${line} — ${UNPAID_CANCEL_RESTOCK_NOTE}` : line,
    meta: { from, to, ...(restocked ? { restocked: true } : {}) },
  };
  await tx.orderNote.create({
    data: {
      orderId,
      type: "system",
      author: actor,
      body: note.body,
      metaJson: JSON.stringify(note.meta),
    },
  });
  return { restocked };
}
