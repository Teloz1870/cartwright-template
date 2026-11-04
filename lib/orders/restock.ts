import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Delt, variant-aware restock-helper. Tidligere levede increment-loopet inline
 * i to steder (createOrder's rollback-path + den kommende retur-flow). Ét
 * testet sted nu — kaldes ALTID inde i en $transaction så et delvist restock
 * aldrig commit'es.
 *
 * Restock-target spejler decrement-target i createOrder: variant.stock hvis
 * variantId er sat, ellers product.stock. Dette er den eneste rigtige inverse
 * af anti-oversell-decrementet.
 *
 * ── Idempotens ──────────────────────────────────────────────────────────────
 * Denne funktion er IKKE selv idempotent (den øger bare stock). Idempotensen
 * skal ankres af KALDEREN:
 *   - enhver cancel af en ubetalt ordre (operatør, webhook, cron, createOrder-
 *     rollback): lib/orders/cancel-unpaid.ts — et betinget pending_payment →
 *     cancelled-skrive i samme $transaction; restock kun hvis det landede.
 *   - retur-flow (receiveAndRestock): gated på Return.restocked-boolean inde i
 *     samme $transaction (re-læs + early-return hvis allerede restocked), og på
 *     returnRestockRefusal nedenfor, så de to veje ikke giver samme varer tilbage.
 */
export type RestockLine = {
  // Null when the line outlived its product (schema batch A, B13): there is
  // no product stock to give back, so such a line restocks nothing unless it
  // names a variant.
  productId: string | null;
  variantId: string | null;
  quantity: number;
};

export async function restockLines(
  tx: Prisma.TransactionClient,
  lines: RestockLine[],
): Promise<void> {
  for (const line of lines) {
    if (line.variantId) {
      await tx.productVariant.update({
        where: { id: line.variantId },
        data: { stock: { increment: line.quantity } },
      });
    } else if (line.productId) {
      await tx.product.update({
        where: { id: line.productId },
        data: { stock: { increment: line.quantity } },
      });
    }
  }
}

/** A return was refused inside its transaction. The message is the operator's. */
export class ReturnRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReturnRefusedError";
  }
}

/** The status a cancel came from when it left no stock out: given back, or never drawn. */
const NO_STOCK_OUT_AFTER_CANCEL_FROM: unknown[] = ["pending_payment", "quote"];

function statusMove(metaJson: string | null): { from?: unknown; to?: unknown } | null {
  try {
    return JSON.parse(metaJson ?? "null") as { from?: unknown; to?: unknown } | null;
  } catch {
    return null;
  }
}

/**
 * Why a return may not bring this order's stock back, or null when it may.
 *
 * A return restocks what it names, so it needs stock that is still out. An order
 * awaiting payment has its stock reserved, and cancelling it gives all of it back.
 * An order cancelled from there has had it back already, whatever its status is
 * now: a refund or a dispute is a fact and moves an order on from `cancelled`. A
 * return on either would count the same units twice.
 *
 * An order that was paid keeps its return, because no cancel gives its stock back
 * (lib/orders/cancel-unpaid.ts). `paidAt` says so for a payment the webhook, the
 * cron or checkout recorded, and a `to: "paid"` note says so for one an operator
 * registered. Since #602 the webhook and since #630 an operator cannot mark a
 * cancelled order paid, so either one outranks an older cancel note.
 *
 * The rest is read from the timeline. An operator's cancel leaves a `{from, to}`
 * note in its own transaction (lib/orders/lifecycle.ts). A cancel by the webhook,
 * the cron or createOrder's rollback leaves none. It comes from pending_payment,
 * and its intent is cancelled or was never payable, so no refund can follow it.
 *
 * Some rows from before #630 look the same and are refused anyway, such as an
 * order marked paid and then cancelled, both through the tool, which left no trace
 * of either move. Their stock is corrected by hand on the product.
 */
export async function returnRestockRefusal(
  client: Prisma.TransactionClient,
  order: { id: string; status: string; paidAt: Date | null },
): Promise<string | null> {
  if (order.status === "pending_payment") {
    return "This order has not been paid, so there is nothing to return. Cancelling it puts its items back in stock.";
  }
  if (order.paidAt) return null;

  const notes = await client.orderNote.findMany({
    where: { orderId: order.id, type: "system" },
    select: { metaJson: true },
  });
  const moves = notes.map((note) => statusMove(note.metaJson));
  if (moves.some((move) => move?.to === "paid")) return null;

  const cancels = moves.filter((move) => move?.to === "cancelled");
  const stockIsBack =
    cancels.some((move) => NO_STOCK_OUT_AFTER_CANCEL_FROM.includes(move?.from)) ||
    (order.status === "cancelled" && cancels.length === 0);
  return stockIsBack
    ? "This order was cancelled before its payment was registered, so it has no stock to bring back. A return would add units the shop does not have."
    : null;
}
