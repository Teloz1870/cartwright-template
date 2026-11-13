import type { PrismaClient } from "@/app/generated/prisma/client";
import { STATIC_ORDER_STATUS_ROWS } from "@/lib/orders/status-table";

/**
 * Writes the static table to `OrderStatus` for a fresh database. Safe to run
 * again: a row that is there already, changed by the shop or not, is left alone.
 */
export async function seedOrderStatuses(db: Pick<PrismaClient, "orderStatus">): Promise<void> {
  for (const { translations: _none, ...row } of STATIC_ORDER_STATUS_ROWS) {
    await db.orderStatus.upsert({ where: { key: row.key }, update: {}, create: row });
  }
}
