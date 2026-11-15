/**
 * AI next steps for orders — RULE-BASED core. Pure module: no DB, no
 * imports, no clock (the caller supplies `ageDays`) → fully testable and without
 * LLM-omkostning. Den valgfri LLM-overbygning (orderAi-flag) lever et andet
 * place and uses this as the always-available foundation.
 *
 * Returns a ranked list of suggestions (most urgent first). Each suggestion
 * points to an action the operator can perform in the order detail.
 */

export type NextActionSeverity = "info" | "warn" | "urgent";

export type NextAction = {
  /** Stable key → the client can deep-link to the relevant form/button. */
  key: string;
  label: string;
  reason: string;
  severity: NextActionSeverity;
};

export type NextActionInput = {
  status: string;
  /** Days since the order was created (computed by the caller). */
  ageDays: number;
  /** Does at least one item have a supplier (→ fulfillment can be created)? */
  hasSupplier: boolean;
  /** At least one item's current stock is low. */
  lowStock: boolean;
  /** Number of open (unfinished) returns on the order. */
  openReturns: number;
  /** The order has a Stripe payment (→ a refund is possible). */
  hasStripePayment: boolean;
};

const DELAYED_TO_SHIP_DAYS = 2;
const DELAYED_DELIVERY_DAYS = 10;

const SEVERITY_RANK: Record<NextActionSeverity, number> = {
  urgent: 0,
  warn: 1,
  info: 2,
};

export function suggestNextActions(input: NextActionInput): NextAction[] {
  const out: NextAction[] = [];

  if (input.status === "flagged_review") {
    out.push({
      key: "review-mismatch",
      label: "Review amount mismatch",
      reason:
        "The amount paid did not match the order total — review before shipping.",
      severity: "urgent",
    });
  }

  if (input.status === "disputed") {
    out.push({
      key: "submit-dispute-evidence",
      label: "Indsend dispute-dokumentation",
      reason: "The customer has disputed the payment — meet Stripe's response deadline.",
      severity: "urgent",
    });
  }

  if (input.openReturns > 0) {
    out.push({
      key: "process-return",
      label: "Behandl retur",
      reason: `${input.openReturns} open return(s) awaiting handling.`,
      severity: "warn",
    });
  }

  if (
    (input.status === "paid" || input.status === "processing") &&
    input.ageDays > DELAYED_TO_SHIP_DAYS
  ) {
    out.push({
      key: "ship-now",
      label: "Afsend nu (forsinket)",
      reason: `Paid ${Math.floor(input.ageDays)} days ago and not yet shipped.`,
      severity: "warn",
    });
  } else if (
    (input.status === "paid" || input.status === "processing") &&
    input.hasSupplier
  ) {
    out.push({
      key: "create-fulfillment",
      label: "Create fulfillment",
      reason: "Items have a supplier — create supplier order(s).",
      severity: "info",
    });
  }

  if (input.status === "shipped" && input.ageDays > DELAYED_DELIVERY_DAYS) {
    out.push({
      key: "follow-up-delivery",
      label: "Follow up on delivery",
      reason: `Shipped more than ${DELAYED_DELIVERY_DAYS} days ago without confirmed delivery.`,
      severity: "info",
    });
  }

  if (input.status === "pending_payment") {
    out.push({
      key: "awaiting-payment",
      label: "Awaiting payment",
      reason: "The customer has not completed payment yet.",
      severity: "info",
    });
  }

  if (input.lowStock) {
    out.push({
      key: "low-stock",
      label: "Low stock on an item",
      reason: "At least one item in the order has low stock — consider reordering.",
      severity: "info",
    });
  }

  return out.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}
