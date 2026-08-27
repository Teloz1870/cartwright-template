/**
 * Order-status state machine — WooCommerce-HPOS-grade order handling.
 *
 * Pure transition rules for Order.status. Lives outside the Prisma layer (the
 * same pattern as lib/escrow/state-machine.ts) so that:
 *   1. The decision logic is testable without a DB.
 *   2. The set of legal transitions is documented in one place + exhaustively.
 *   3. Admin server actions + AI tools can consult the rules BEFORE they write,
 *      and reject illegal operator moves atomically.
 *
 * ── CRITICAL: who owns which transitions ───────────────────────────────────
 * This state machine validates ONLY *operator-initiated* moves (admin UI +
 * the AI tool `orders.update_status`). The Stripe webhook
 * (app/api/webhook/stripe/route.ts) writes `paid`/`refunded`/`partial_refund`/
 * `disputed`/`flagged_review` via an UNGUARDED `prisma.order.update` — those are
 * facts about the outside world (payment succeeded, the customer opened a
 * dispute), and a transition guard must NEVER reject them. So never move webhook
 * writes behind assertTransition(). The table below is for operator intent only.
 *
 * ── Status superset (NEVER rename an existing value) ────────────────────────
 * `pending_payment`, `pending`, `paid`, `flagged_review`, `shipped`,
 * `cancelled`, `refunded`, `partial_refund`, `disputed` are already written by
 * existing code (createOrder + webhook) → preserved verbatim.
 * `processing`, `delivered`, `completed` are NEW, additive, admin-only states.
 *
 * Pure module — no imports, no side effects.
 */

/** Canonical status names. The strings are stored in Order.status. */
export const ORDER_STATUSES = [
  // — written by existing code today; preserved verbatim —
  "pending_payment",
  "pending",
  "paid",
  "flagged_review",
  "shipped",
  "cancelled",
  "refunded",
  "partial_refund",
  "disputed",
  // — NEW, additive, admin-only —
  "processing",
  "delivered",
  "completed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Legal operator transitions. Reading: a `paid` order can be moved by an admin
 * be moved to `processing`, `shipped`, `cancelled`, `refunded` or
 * `partial_refund`.
 *
 * Terminal states (cancelled/refunded/partial_refund) have an empty next set —
 * they cannot be transitioned any further by the operator.
 */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: ["paid", "cancelled"],
  pending: ["paid", "processing", "cancelled"],
  paid: ["processing", "shipped", "cancelled", "refunded", "partial_refund"],
  processing: ["shipped", "cancelled", "refunded", "partial_refund"],
  shipped: ["delivered", "completed", "refunded", "partial_refund"],
  delivered: ["completed", "refunded", "partial_refund"],
  flagged_review: ["paid", "cancelled", "refunded"],
  disputed: ["refunded", "cancelled", "completed"],
  completed: ["refunded", "partial_refund"],
  cancelled: [], // terminal
  refunded: [], // terminal
  partial_refund: [], // terminal
};

/** True ⟺ `from → to` is a legal operator transition. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Error thrown when an operator transition is illegal. */
export class IllegalOrderTransitionError extends Error {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  constructor(from: OrderStatus, to: OrderStatus) {
    super(
      `Illegal order transition: ${from} → ${to}. Legal next states from ${from}: [${TRANSITIONS[from].join(", ") || "(terminal)"}]`,
    );
    this.from = from;
    this.to = to;
    this.name = "IllegalOrderTransitionError";
  }
}

/**
 * Validate that `to` is reachable from `from`. Throws IllegalOrderTransitionError
 * on violation. Returns void on success. Pure — no DB, no clock.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalOrderTransitionError(from, to);
  }
}

/** True ⟺ the state is terminal (no operator transitions left). */
export function isTerminal(state: OrderStatus): boolean {
  return TRANSITIONS[state].length === 0;
}

/** The set of legal next states from `from`, as an array. */
export function legalNextStates(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

/** Type guard for runtime validation of values from the DB / user input. */
export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Human-readable labels for all 12 statuses. Single source — used by the
 * table, the detail page and the status tabs.
 */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  pending: "Pending",
  paid: "Paid",
  flagged_review: "Needs review",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partial_refund: "Partially refunded",
  disputed: "Disputed",
};

/**
 * Badge colours (Tailwind) for all 12 statuses. The four original ones
 * (pending/paid/shipped/cancelled) are preserved IDENTICALLY to the former
 * STATUS_COLORS map in components/admin/OrderTableInline.tsx.
 */
export const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  shipped: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
  pending_payment: "bg-amber-100 text-amber-800",
  flagged_review: "bg-orange-100 text-orange-800",
  processing: "bg-indigo-100 text-indigo-800",
  delivered: "bg-teal-100 text-teal-800",
  completed: "bg-emerald-100 text-emerald-800",
  refunded: "bg-slate-100 text-slate-700",
  partial_refund: "bg-slate-100 text-slate-700",
  disputed: "bg-rose-100 text-rose-800",
};

/** Fallback colour for unknown/legacy status strings. */
export const STATUS_COLOR_FALLBACK = "bg-gray-100 text-gray-700";

/** Look up a badge colour, with a fallback for unknown values. */
export function statusColor(status: string): string {
  return isOrderStatus(status) ? STATUS_COLORS[status] : STATUS_COLOR_FALLBACK;
}

/** Look up a label, with a fallback (the raw string) for unknown values. */
export function statusLabel(status: string): string {
  return isOrderStatus(status) ? STATUS_LABELS[status] : status;
}

/**
 * WooCommerce-style tabs — VIEWS over the canonical statuses (not new states).
 * `statuses: null` ⇒ "All" (no status filter).
 */
export const ORDER_TABS = [
  { key: "all", label: "All", statuses: null },
  {
    key: "awaiting_payment",
    label: "Awaiting payment",
    statuses: ["pending_payment", "pending"],
  },
  { key: "processing", label: "Processing", statuses: ["paid", "processing"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped", "delivered"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
  {
    key: "closed",
    label: "Cancelled / refunded",
    statuses: ["cancelled", "refunded", "partial_refund"],
  },
  {
    key: "attention",
    label: "Needs action",
    statuses: ["flagged_review", "disputed"],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  statuses: readonly OrderStatus[] | null;
}>;

export type OrderTabKey = (typeof ORDER_TABS)[number]["key"];

/**
 * Statuses for a given tab key. Returns null for "all" (no filter) or for an
 * unknown key. Used by listOrdersPage for `status: { in: [...] }`.
 */
export function statusesForTab(tabKey: string): readonly OrderStatus[] | null {
  const tab = ORDER_TABS.find((t) => t.key === tabKey);
  return tab ? tab.statuses : null;
}
