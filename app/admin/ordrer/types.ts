/**
 * Shared types for the order workspace. Kept in a plain module (NOT "use server")
 * so both server actions and client components can import them — a
 * "use server" file may only export async functions.
 */

/** Derived warning flags per order in the list (cheap, computed server-side). */
export type OrderRowFlags = {
  /** shipped + older than N days (a proxy for "not delivered yet"). */
  delayed: boolean;
  /** at least one line's current stock is ≤ the threshold. */
  lowStock: boolean;
  /** flagged_review or disputed → requires manual action. */
  attention: boolean;
};

export type OrderListRow = {
  id: string;
  email: string;
  shippingName: string;
  status: string;
  totalDkk: number;
  itemCount: number;
  createdAt: string; // ISO string (serialisable to the client)
  carrier: string | null;
  trackingNumber: string | null;
  flags: OrderRowFlags;
};

export type OrderListResult = {
  rows: OrderListRow[];
  /** id of the last row if there are (probably) more — otherwise null. */
  nextCursor: string | null;
};

export type OrderListQuery = {
  tab?: string;
  q?: string;
  fromDate?: string;
  toDate?: string;
  cursor?: string;
  take?: number;
};

export type ActionResult = { ok: true } | { ok: false; error: string };

export type BulkResult = {
  updated: number;
  skipped: { id: string; reason: string }[];
};

// ── Serialisable view types for the order-detail components ─────────────────
export type OrderNoteView = {
  id: string;
  type: string; // "system" | "private"
  body: string;
  author: string;
  createdAt: string; // ISO
};

export type ReturnItemView = {
  id: string;
  productName: string;
  quantity: number;
};

export type ReturnView = {
  id: string;
  status: string;
  reason: string;
  refundDkk: number;
  restocked: boolean;
  createdAt: string; // ISO
  items: ReturnItemView[];
};

export type OrderItemView = {
  id: string;
  productName: string;
  quantity: number;
  unitPriceDkk: number;
  variantId: string | null;
};

/** Thresholds for the derived order flags. */
export const DELAYED_SHIPMENT_DAYS = 7;
export const LOW_STOCK_THRESHOLD = 3;
export const ORDER_PAGE_SIZE = 25;
