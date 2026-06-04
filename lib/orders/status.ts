/**
 * Ordre-status state machine — WooCommerce-HPOS-grade ordrestyring.
 *
 * Pure transition-regler for Order.status. Lever uden for Prisma-laget (samme
 * mønster som lib/escrow/state-machine.ts) så:
 *   1. Beslutnings-logikken er testbar uden DB.
 *   2. Sættet af lovlige transitions er dokumenteret ét sted + udtømmende.
 *   3. Admin-server-actions + AI-tools kan konsultere reglerne FØR de skriver,
 *      og afvise ulovlige operatør-moves atomisk.
 *
 * ── KRITISK: hvem ejer hvilke transitions ──────────────────────────────────
 * Denne state machine validerer KUN *operatør-initierede* moves (admin-UI +
 * AI-tool `orders.update_status`). Stripe-webhooken
 * (app/api/webhook/stripe/route.ts) skriver `paid`/`refunded`/`partial_refund`/
 * `disputed`/`flagged_review` via UGUARDED `prisma.order.update` — det er
 * fakta om omverdenen (betaling lykkedes, kunden lavede en indsigelse), og en
 * transition-guard må ALDRIG afvise dem. Tilføj derfor aldrig webhook-skrivning
 * bag assertTransition(). Tabellen nedenfor er kun for operatør-intent.
 *
 * ── Status-supersæt (omdøb ALDRIG en eksisterende værdi) ────────────────────
 * `pending_payment`, `pending`, `paid`, `flagged_review`, `shipped`,
 * `cancelled`, `refunded`, `partial_refund`, `disputed` skrives allerede af
 * eksisterende kode (createOrder + webhook) → bevares ordret.
 * `processing`, `delivered`, `completed` er NYE, additive, kun-admin-states.
 *
 * Pure modul — ingen imports, ingen side-effects.
 */

/** Kanoniske status-navne. Strings gemmes i Order.status. */
export const ORDER_STATUSES = [
  // — skrives af eksisterende kode i dag; bevares ordret —
  "pending_payment",
  "pending",
  "paid",
  "flagged_review",
  "shipped",
  "cancelled",
  "refunded",
  "partial_refund",
  "disputed",
  // — NYE, additive, kun-admin —
  "processing",
  "delivered",
  "completed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Lovlige operatør-transitions. Læsning: en `paid` ordre kan af en admin
 * flyttes til `processing`, `shipped`, `cancelled`, `refunded` eller
 * `partial_refund`.
 *
 * Terminal-states (cancelled/refunded/partial_refund) har tomt next-set —
 * de kan ikke transitiones videre af operatøren.
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

/** True ⟺ `from → to` er en lovlig operatør-transition. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Fejl kastet når en operatør-transition er ulovlig. */
export class IllegalOrderTransitionError extends Error {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  constructor(from: OrderStatus, to: OrderStatus) {
    super(
      `Ulovlig ordre-transition: ${from} → ${to}. Lovlige næste states fra ${from}: [${TRANSITIONS[from].join(", ") || "(terminal)"}]`,
    );
    this.from = from;
    this.to = to;
    this.name = "IllegalOrderTransitionError";
  }
}

/**
 * Valider at `to` er nåelig fra `from`. Kaster IllegalOrderTransitionError
 * ved overtrædelse. Returnerer void ved succes. Pure — ingen DB, ingen tid.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalOrderTransitionError(from, to);
  }
}

/** True ⟺ staten er terminal (ingen operatør-transitions tilbage). */
export function isTerminal(state: OrderStatus): boolean {
  return TRANSITIONS[state].length === 0;
}

/** Sættet af lovlige næste states fra `from`, som array. */
export function legalNextStates(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

/** Type-guard til runtime-validering af værdier fra DB / bruger-input. */
export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Menneske-labels (da-DK) for alle 12 statuses. Single source — bruges af
 * tabellen, detalje-siden og status-fanerne.
 */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Afventer betaling",
  pending: "Afventer",
  paid: "Betalt",
  flagged_review: "Kræver gennemgang",
  processing: "Under behandling",
  shipped: "Afsendt",
  delivered: "Leveret",
  completed: "Gennemført",
  cancelled: "Annulleret",
  refunded: "Refunderet",
  partial_refund: "Delvist refunderet",
  disputed: "Indsigelse",
};

/**
 * Badge-farver (Tailwind) for alle 12 statuses. De fire oprindelige
 * (pending/paid/shipped/cancelled) er bevaret IDENTISK med den tidligere
 * STATUS_COLORS-map i components/admin/OrderTableInline.tsx.
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

/** Fallback-farve for ukendte/legacy status-strings. */
export const STATUS_COLOR_FALLBACK = "bg-gray-100 text-gray-700";

/** Slå badge-farve op med fallback for ukendte værdier. */
export function statusColor(status: string): string {
  return isOrderStatus(status) ? STATUS_COLORS[status] : STATUS_COLOR_FALLBACK;
}

/** Slå label op med fallback (rå string) for ukendte værdier. */
export function statusLabel(status: string): string {
  return isOrderStatus(status) ? STATUS_LABELS[status] : status;
}

/**
 * WooCommerce-style faner — VIEWS over de kanoniske statuses (ikke nye states).
 * `statuses: null` ⇒ "Alle" (intet status-filter).
 */
export const ORDER_TABS = [
  { key: "all", label: "Alle", statuses: null },
  {
    key: "awaiting_payment",
    label: "Afventer betaling",
    statuses: ["pending_payment", "pending"],
  },
  { key: "processing", label: "Til behandling", statuses: ["paid", "processing"] },
  { key: "shipped", label: "Afsendt", statuses: ["shipped", "delivered"] },
  { key: "completed", label: "Gennemført", statuses: ["completed"] },
  {
    key: "closed",
    label: "Annulleret / refunderet",
    statuses: ["cancelled", "refunded", "partial_refund"],
  },
  {
    key: "attention",
    label: "Kræver handling",
    statuses: ["flagged_review", "disputed"],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  statuses: readonly OrderStatus[] | null;
}>;

export type OrderTabKey = (typeof ORDER_TABS)[number]["key"];

/**
 * Statuses for en given fane-key. Returnerer null for "all" (intet filter)
 * eller ukendt key. Bruges af listOrdersPage til `status: { in: [...] }`.
 */
export function statusesForTab(tabKey: string): readonly OrderStatus[] | null {
  const tab = ORDER_TABS.find((t) => t.key === tabKey);
  return tab ? tab.statuses : null;
}
