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
 *     samme $transaction (re-læs + early-return hvis allerede restocked).
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
