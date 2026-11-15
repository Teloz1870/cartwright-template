import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { transitionOrder } from "@/lib/orders/lifecycle";

export { isUnpaidCancel, statusTransitionLine } from "@/lib/orders/lifecycle";

/**
 * Every operator status move: the admin status form, the bulk action and
 * `orders.update_status` (RACE-MARKPAID), through the door in
 * lib/orders/lifecycle.ts.
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
    /** The path it came through: "admin", "orders.update_status". */
    source?: string;
    /** Replaces the default note: a manual refund registration words its own. */
    note?: { body: string; meta: Record<string, unknown> };
  },
): Promise<{ restocked: boolean }> {
  return transitionOrder({ client: tx, source: "operator", ...input, kind: "operator" });
}
