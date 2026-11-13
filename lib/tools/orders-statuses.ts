import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { canTransition, isOrderStatus } from "@/lib/orders/status";
import { getOrderStatuses } from "@/lib/orders/status-reader";
import { STOCK_EFFECTS } from "@/lib/orders/status-table";

// A file of its own because it reads the status table: orders.update_status, in
// lib/tools/orders.ts, cancels payments, so that file is on the money path and may
// not (eslint.config.mjs, tests/unit/orders/status-money-path.test.ts). This tool is
// for an agent to read. No code calls it: only the registry takes its pack, and no
// other file spells its name (same test).

// One status as orders.list_statuses reports it. Its moves are the state machine's
// for exactly that key, its meaning is what its row declares, and no label or
// look-alike key changes either. `usableByUpdateStatus` follows orders.update_status's
// fixed enum: owner decision B22 keeps that schema static, and generating it at
// build from the table is a later slice, so a status of the shop's own cannot be
// set yet.
const orderStatusListingOutput = z.strictObject({
  key: z.string(),
  label: z.string(),
  color: z.string().nullable(),
  moveAllowedFrom: z
    .array(z.string())
    .describe(
      "The statuses the operator state machine allows a move to this one from. The machine knows only the built-in statuses, so this is empty for a status of the shop's own and never names one. orders.update_status does not check a move out of a status the machine does not know.",
    ),
  usableByUpdateStatus: z
    .boolean()
    .describe(
      "False for a status of the shop's own: orders.update_status takes a fixed list of statuses and refuses it for now.",
    ),
  isPaid: z.boolean(),
  isFinal: z.boolean(),
  countsAsRevenue: z.boolean(),
  stockEffect: z.enum(STOCK_EFFECTS),
  notifyCustomer: z.boolean(),
  customerVisible: z.boolean(),
});

export const listOrderStatuses = defineTool({
  name: "orders.list_statuses",
  description:
    "List this shop's order statuses in the shop's order: key, label, colour, what each one declares it means (isPaid, isFinal, countsAsRevenue, stockEffect, notifyCustomer, customerVisible) and moveAllowedFrom, the statuses the operator state machine allows a move to it from. Read a status's meaning from these fields, never from its key or label. They are what the status table declares: no payment, stock move or refund reads them. A status of the shop's own has usableByUpdateStatus: false, because orders.update_status takes a fixed list of statuses and refuses it for now. That tool also refuses refunded/partial_refund unless you are recording a refund made outside the shop. Read-only.",
  scope: "orders:read",
  gate: { ecommerce: true },
  input: z.object({}),
  output: z.array(orderStatusListingOutput),
  examples: [
    {
      name: "List this shop's order statuses",
      body: {},
    },
  ],
  skipAudit: true,
  handler: async () => {
    const rows = await getOrderStatuses();
    const machineKeys = rows.map((row) => row.key).filter(isOrderStatus);
    return rows.map((row) => {
      const { key } = row;
      return {
        key,
        label: row.label,
        color: row.color,
        moveAllowedFrom: isOrderStatus(key) ? machineKeys.filter((from) => canTransition(from, key)) : [],
        usableByUpdateStatus: isOrderStatus(key),
        isPaid: row.isPaid,
        isFinal: row.isFinal,
        countsAsRevenue: row.countsAsRevenue,
        stockEffect: row.stockEffect,
        notifyCustomer: row.notifyCustomer,
        customerVisible: row.customerVisible,
      };
    });
  },
});

export const ordersStatusesTools = [listOrderStatuses];
