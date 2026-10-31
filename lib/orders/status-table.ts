import {
  ORDER_STATUSES,
  STATUS_COLORS,
  STATUS_COLOR_FALLBACK,
  STATUS_LABELS,
  isOrderStatus,
  type OrderStatus,
} from "@/lib/orders/status";

/**
 * Order statuses as data with a meaning (ORD1-a1).
 *
 * A status is not a free string: it declares what it MEANS, and when the engine
 * comes to read this (ORD1-c), it keys on the meaning, never on the name. Label,
 * colour and order are the shop's. That is what lets a later slice add a quote as
 * a preset row (TIL1-a) instead of a special case.
 *
 * This file is the static definition: one row per status in ORDER_STATUSES,
 * saying what the code does today, also where that looks odd. An order awaiting
 * payment counts as revenue because `revenueOrderWhere` says so, and a paid order
 * that is cancelled keeps its stock out because only `isUnpaidCancel` gives it
 * back. tests/unit/orders/status-table.test.ts checks each field against that
 * code. lib/orders/status-reader.ts overlays a shop's `OrderStatus` rows on this
 * table for the admin's order pages.
 *
 * Nothing on the money path reads this file or the table behind it, so no row
 * can change a payment, a stock move or a refund (eslint.config.mjs). Pure
 * module: safe in a client component.
 */

export const STOCK_EFFECTS = ["reserve", "release", "none"] as const;
export type StockEffect = (typeof STOCK_EFFECTS)[number];

export type OrderStatusMeaning = {
  /** The order stands as paid: a payment was taken, not all of it went back, and it was not cancelled. */
  isPaid: boolean;
  /** No operator move leads out of it (`isTerminal`). */
  isFinal: boolean;
  /** Its orders are in the shop's totals (`revenueOrderWhere`). */
  countsAsRevenue: boolean;
  /**
   * `reserve`: it holds stock taken at checkout that a cancel gives back.
   * `release`: a move into it from a `reserve` status gives that stock back.
   * `none`: the stock stays where it is. Today that is one move, `isUnpaidCancel`.
   */
  stockEffect: StockEffect;
  /** An order paid into this status mails the customer: today only `paid`'s receipt, not an operator's move. */
  notifyCustomer: boolean;
  /** The customer sees it: today their account lists every order they have. */
  customerVisible: boolean;
};

/** One status: its meaning, and what a shop may make its own. */
export type OrderStatusRow = OrderStatusMeaning & {
  key: string;
  label: string;
  translations: unknown;
  color: string | null;
  sortOrder: number;
};

/** A row as the `OrderStatus` table holds it: `stockEffect` is any string there. */
export type OrderStatusDbRow = Omit<OrderStatusRow, "stockEffect"> & {
  stockEffect: string;
};

const MEANINGS: Readonly<Record<OrderStatus, OrderStatusMeaning>> = {
  pending_payment: { isPaid: false, isFinal: false, countsAsRevenue: true, stockEffect: "reserve", notifyCustomer: false, customerVisible: true },
  pending: { isPaid: false, isFinal: false, countsAsRevenue: true, stockEffect: "none", notifyCustomer: false, customerVisible: true },
  paid: { isPaid: true, isFinal: false, countsAsRevenue: true, stockEffect: "none", notifyCustomer: true, customerVisible: true },
  flagged_review: { isPaid: false, isFinal: false, countsAsRevenue: true, stockEffect: "none", notifyCustomer: false, customerVisible: true },
  shipped: { isPaid: true, isFinal: false, countsAsRevenue: true, stockEffect: "none", notifyCustomer: false, customerVisible: true },
  cancelled: { isPaid: false, isFinal: true, countsAsRevenue: false, stockEffect: "release", notifyCustomer: false, customerVisible: true },
  refunded: { isPaid: false, isFinal: true, countsAsRevenue: true, stockEffect: "none", notifyCustomer: false, customerVisible: true },
  partial_refund: { isPaid: true, isFinal: true, countsAsRevenue: true, stockEffect: "none", notifyCustomer: false, customerVisible: true },
  disputed: { isPaid: true, isFinal: false, countsAsRevenue: true, stockEffect: "none", notifyCustomer: false, customerVisible: true },
  processing: { isPaid: true, isFinal: false, countsAsRevenue: true, stockEffect: "none", notifyCustomer: false, customerVisible: true },
  delivered: { isPaid: true, isFinal: false, countsAsRevenue: true, stockEffect: "none", notifyCustomer: false, customerVisible: true },
  completed: { isPaid: true, isFinal: false, countsAsRevenue: true, stockEffect: "none", notifyCustomer: false, customerVisible: true },
};

/** In the order of ORDER_STATUSES, which is the one list the admin shows whole. */
export const STATIC_ORDER_STATUS_ROWS: readonly OrderStatusRow[] = ORDER_STATUSES.map((key, index) => ({
  key,
  label: STATUS_LABELS[key],
  translations: null,
  color: STATUS_COLORS[key],
  sortOrder: index * 10,
  ...MEANINGS[key],
}));

function isStockEffect(value: string): value is StockEffect {
  return (STOCK_EFFECTS as readonly string[]).includes(value);
}

/** A table row over the static row of the same key: what it leaves blank stays. */
function overlayRow(row: OrderStatusDbRow, base: OrderStatusRow | undefined): OrderStatusRow {
  return {
    key: row.key,
    label: row.label.trim() ? row.label : (base?.label ?? row.key),
    translations: row.translations ?? null,
    color: row.color?.trim() ? row.color : (base?.color ?? null),
    sortOrder: row.sortOrder,
    isPaid: row.isPaid,
    isFinal: row.isFinal,
    countsAsRevenue: row.countsAsRevenue,
    stockEffect: isStockEffect(row.stockEffect) ? row.stockEffect : (base?.stockEffect ?? "none"),
    notifyCustomer: row.notifyCustomer,
    customerVisible: row.customerVisible,
  };
}

/**
 * The shop's rows over the static table, sorted by `sortOrder`. All 12 statuses
 * are always there, because an order may carry one whose row is gone. A row with
 * a key of the shop's own comes along with its declared meaning.
 */
export function overlayOrderStatuses(rows: readonly OrderStatusDbRow[]): readonly OrderStatusRow[] {
  if (rows.length === 0) return STATIC_ORDER_STATUS_ROWS;
  const merged = new Map(STATIC_ORDER_STATUS_ROWS.map((row) => [row.key, row]));
  for (const row of rows) merged.set(row.key, overlayRow(row, merged.get(row.key)));
  return [...merged.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * How a list of rows reads on the admin's screens, on the server and in a client
 * component alike. With no rows given, the static table.
 */
export function orderStatusDisplay(rows: readonly OrderStatusRow[] = STATIC_ORDER_STATUS_ROWS) {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const rank = new Map(rows.map((row, index) => [row.key, index]));
  const shopOrdered = rows
    .map((row) => row.key)
    .filter(isOrderStatus)
    .some((key, index) => key !== ORDER_STATUSES[index]);

  return {
    /** A key with no row shows as itself, as `statusLabel` does. */
    label: (key: string): string => byKey.get(key)?.label ?? key,
    /** A key with no row, or a row with no colour, gets the neutral badge. */
    color: (key: string): string => byKey.get(key)?.color ?? STATUS_COLOR_FALLBACK,
    /**
     * The colour the shop set itself, or undefined. For the plain order table,
     * whose badges take a tone per status instead of the static colours: a row
     * carrying the static colour leaves that tone alone.
     */
    ownColor: (key: string): string | undefined => {
      const color = byKey.get(key)?.color ?? undefined;
      return isOrderStatus(key) && color === STATUS_COLORS[key] ? undefined : color;
    },
    /**
     * Keys in the shop's order. Until a shop has changed the order, the list
     * stays as the code wrote it: the machine's next steps cannot follow any one
     * order (`paid` lists cancelled before refunded, `disputed` the reverse).
     * This moves what a list shows, nothing else. Its first key is no default:
     * a status control opens on the machine's first step, because the numbers
     * are no workflow (`refunded` stands above `delivered`) and one click writes
     * what the control opens on.
     */
    inOrder: <T extends string>(keys: readonly T[]): readonly T[] =>
      shopOrdered
        ? [...keys].sort((a, b) => (rank.get(a) ?? rows.length) - (rank.get(b) ?? rows.length))
        : keys,
  };
}
