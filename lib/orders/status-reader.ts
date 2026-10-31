import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/db";
import {
  STATIC_ORDER_STATUS_ROWS,
  overlayOrderStatuses,
  type OrderStatusRow,
} from "@/lib/orders/status-table";

/**
 * The order statuses as this shop has them: its `OrderStatus` rows over the
 * static table (lib/orders/status-table.ts). An empty, missing or unreadable
 * table gives the static table, and this never throws: a status label must not
 * take an order page down. `cache()` makes it one query per request.
 *
 * For the admin's screens. The money path may not import this file
 * (eslint.config.mjs): what a row says never decides a payment.
 */
export const getOrderStatuses = cache(async (): Promise<readonly OrderStatusRow[]> => {
  try {
    return overlayOrderStatuses(await prisma.orderStatus.findMany({ orderBy: { key: "asc" } }));
  } catch (err) {
    console.warn(
      "[order-statuses] could not read the table, using the built-in statuses:",
      err instanceof Error ? err.message : err,
    );
    return STATIC_ORDER_STATUS_ROWS;
  }
});
