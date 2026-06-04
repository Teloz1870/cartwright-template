import "server-only";

import type { Prisma } from "@prisma/client";

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
 *   - createOrder-rollback: gated på status === "pending_payment" (en ordre
 *     rulles kun tilbage én gang fordi status straks bliver "cancelled").
 *   - retur-flow (receiveAndRestock): gated på Return.restocked-boolean inde i
 *     samme $transaction (re-læs + early-return hvis allerede restocked).
 */
export type RestockLine = {
  productId: string;
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
    } else {
      await tx.product.update({
        where: { id: line.productId },
        data: { stock: { increment: line.quantity } },
      });
    }
  }
}
