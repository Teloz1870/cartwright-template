import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { restockLines } from "@/lib/orders/restock";
import { assertTransition, isOrderStatus, statusLabel } from "@/lib/orders/status";

/** The order-timeline line of an operator status move: "Status: Paid → Shipped". */
export function statusTransitionLine(from: string, to: string): string {
  return `Status: ${statusLabel(from)} → ${statusLabel(to)}`;
}

/** True ⟺ this move cancels an order still awaiting payment, so its stock goes back. */
export function isUnpaidCancel(from: string, to: string): boolean {
  return from === "pending_payment" && to === "cancelled";
}

/**
 * An operator moved an order on from the status they read, but by the time the
 * write ran the order was in another one: the webhook or the cron cancelled it,
 * the customer paid, another operator got there first. Nothing was written; the
 * operator re-reads and decides.
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

type MoveBase = {
  /** The `tx` of the caller's `$transaction`, or `prisma` for a fact that is one write. */
  client: Prisma.TransactionClient;
  orderId: string;
  /** Who moved it. An operator move's note is signed with it. */
  actor: string;
  /** The path it came through: "admin", "stripe-webhook", "reconcile-cron", … */
  source: string;
};

export type OperatorMove = MoveBase & {
  kind: "operator";
  /** The status the caller read and decided on. */
  from: string;
  to: string;
  /** Replaces the default note: a manual refund registration words its own. */
  note?: { body: string; meta: Record<string, unknown> };
};

/**
 * What a path can report, and what each write is conditional on. `from: null` is
 * unconditional: money went back or a dispute was opened, whatever the order says now.
 */
export type FactMove = MoveBase & { kind: "fact" } & (
    | { to: "refunded" | "partial_refund" | "disputed"; from: null }
    | { to: "flagged_review"; from: string }
    | { to: "paid"; from: string; paymentMethod: string }
    | { to: "cancelled"; from: "pending_payment" }
  );

/**
 * The one door for Order.status on an order that exists (ORD0-b). Creating one is
 * not a move: createOrder and createOrderFromAcpSession set the first status
 * themselves. It moves no money and sends nothing: a path that records `paid` calls
 * onOrderPaid itself, and only when `written` says its write landed.
 *
 * kind "operator" is a decision someone took (lib/orders/operator-status.ts). The
 * table in lib/orders/status.ts guards it, apart from a status the engine does not
 * know (legacy data), which it cannot read and so lets through. The write is
 * conditional on `from` and the timeline note lands with it. A refused move throws
 * IllegalOrderTransitionError and a stale one OrderChangedError; neither wrote
 * anything. It writes several rows, so call it inside a `$transaction`.
 *
 * kind "fact" is what happened outside. The table NEVER refuses one (the doctrine in
 * lib/orders/status.ts) and the door decides nothing: whether an order may still
 * become paid is the webhook's own check, where a refusal also means a log line and
 * an audit row. `written` is false when a conditional write matched no row, and then
 * nothing was written. An unpaid cancel writes several rows too: hand it a `tx`.
 *
 * The kinds differ in what they leave behind because the paths did, and ORD0 keeps
 * behaviour: ORD1-c decides the note on a fact and the restock on any other cancel.
 * `actor` and `source` are named at every call for that note; today only an operator
 * move's `actor` is written.
 */
export function transitionOrder(move: OperatorMove): Promise<{ restocked: boolean }>;
export function transitionOrder(move: FactMove): Promise<{ written: boolean }>;
export function transitionOrder(
  move: OperatorMove | FactMove,
): Promise<{ restocked: boolean } | { written: boolean }> {
  return move.kind === "operator" ? moveAsOperator(move) : recordFact(move);
}

async function moveAsOperator(move: OperatorMove): Promise<{ restocked: boolean }> {
  const { client, orderId, from, to, actor } = move;
  // Both callers read the table first, for a refusal of their own: the admin form
  // before its audit row opens, the tool inside it. This is what no caller can skip.
  if (isOrderStatus(from) && isOrderStatus(to)) assertTransition(from, to);

  const restocked = isUnpaidCancel(from, to);
  if (restocked) {
    if (!(await cancelUnpaid(client, orderId))) throw new OrderNoLongerUnpaidError(orderId);
  } else if (!(await writeIfStill(client, orderId, from, { status: to }))) {
    throw new OrderChangedError(orderId, from);
  }

  const line = statusTransitionLine(from, to);
  const note = move.note ?? {
    body: restocked ? `${line} — items returned to stock` : line,
    meta: { from, to, ...(restocked ? { restocked: true } : {}) },
  };
  await client.orderNote.create({
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

async function recordFact(move: FactMove): Promise<{ written: boolean }> {
  const { client, orderId } = move;
  if (move.to === "cancelled") return { written: await cancelUnpaid(client, orderId) };

  const data = { status: move.to, ...factColumns(move) };
  if (move.from === null) {
    await client.order.update({ where: { id: orderId }, data });
    return { written: true };
  }
  return { written: await writeIfStill(client, orderId, move.from, data) };
}

/** What a fact records beside the status. */
function factColumns(move: FactMove): Prisma.OrderUpdateManyMutationInput {
  switch (move.to) {
    case "paid":
      return { paymentMethod: move.paymentMethod, paidAt: new Date() };
    case "refunded":
    case "partial_refund":
      return { refundedAt: new Date() };
    case "disputed":
      return { disputedAt: new Date() };
    default:
      return {};
  }
}

/** The conditional write: true when the order was still in `from`, and is moved now. */
async function writeIfStill(
  client: Prisma.TransactionClient,
  orderId: string,
  from: string,
  data: Prisma.OrderUpdateManyMutationInput,
): Promise<boolean> {
  const written = await client.order.updateMany({ where: { id: orderId, status: from }, data });
  return written.count > 0;
}

/** The cancel of an unpaid order. The rule is written up at cancelUnpaidOrder (cancel-unpaid.ts). */
async function cancelUnpaid(tx: Prisma.TransactionClient, orderId: string): Promise<boolean> {
  if (!(await writeIfStill(tx, orderId, "pending_payment", { status: "cancelled" }))) return false;
  const lines = await tx.orderItem.findMany({
    where: { orderId },
    select: { productId: true, variantId: true, quantity: true },
  });
  await restockLines(tx, lines);
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { discountCode: true },
  });
  if (order?.discountCode) {
    await tx.discountCode.updateMany({
      where: { code: order.discountCode, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
  }
  return true;
}
