/**
 * Delte typer for ordre-workspace. Ligger i et plain modul (IKKE "use server")
 * så både server-actions og client-komponenter kan importere dem — en
 * "use server"-fil må kun eksportere async funktioner.
 */

/** Afledte advarsels-flag pr. ordre i listen (billige, beregnet server-side). */
export type OrderRowFlags = {
  /** shipped + ældre end N dage (proxy for "ikke leveret endnu"). */
  delayed: boolean;
  /** mindst én linjes nuværende lager ≤ tærskel. */
  lowStock: boolean;
  /** flagged_review eller disputed → kræver manuel handling. */
  attention: boolean;
};

export type OrderListRow = {
  id: string;
  email: string;
  shippingName: string;
  status: string;
  totalDkk: number;
  itemCount: number;
  createdAt: string; // ISO-string (serialiserbar til client)
  carrier: string | null;
  trackingNumber: string | null;
  flags: OrderRowFlags;
};

export type OrderListResult = {
  rows: OrderListRow[];
  /** id på sidste række hvis der (sandsynligvis) er flere — ellers null. */
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

// ── Serialiserbare view-typer til ordre-detalje-komponenterne ────────────────
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

/** Tærskler for de afledte ordre-flag. */
export const DELAYED_SHIPMENT_DAYS = 7;
export const LOW_STOCK_THRESHOLD = 3;
export const ORDER_PAGE_SIZE = 25;
