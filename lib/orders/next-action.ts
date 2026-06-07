/**
 * AI næste-skridt på ordrer — REGELBASERET kerne. Pure modul: ingen DB, ingen
 * imports, ingen tid (kalderen leverer `ageDays`) → fuldt testbar og uden
 * LLM-omkostning. Den valgfri LLM-overbygning (orderAi-flag) lever et andet
 * sted og bruger denne som det altid-tilgængelige fundament.
 *
 * Returnerer en rangeret liste af forslag (mest hastende først). Hvert forslag
 * peger på en handling operatøren kan udføre i ordre-detaljen.
 */

export type NextActionSeverity = "info" | "warn" | "urgent";

export type NextAction = {
  /** Stabil nøgle → klienten kan deep-linke til den relevante form/knap. */
  key: string;
  label: string;
  reason: string;
  severity: NextActionSeverity;
};

export type NextActionInput = {
  status: string;
  /** Dage siden ordren blev oprettet (kalderen beregner). */
  ageDays: number;
  /** Har mindst én vare en leverandør (→ fulfillment kan oprettes). */
  hasSupplier: boolean;
  /** Mindst én vares nuværende lager er lavt. */
  lowStock: boolean;
  /** Antal åbne (ikke-afsluttede) returneringer på ordren. */
  openReturns: number;
  /** Ordren har en Stripe-betaling (→ refund er muligt). */
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
      label: "Gennemgå beløbs-mismatch",
      reason:
        "Betalt beløb matchede ikke ordretotalen — gennemgå før forsendelse.",
      severity: "urgent",
    });
  }

  if (input.status === "disputed") {
    out.push({
      key: "submit-dispute-evidence",
      label: "Indsend dispute-dokumentation",
      reason: "Kunden har bestridt betalingen — overhold Stripes svarfrist.",
      severity: "urgent",
    });
  }

  if (input.openReturns > 0) {
    out.push({
      key: "process-return",
      label: "Behandl retur",
      reason: `${input.openReturns} åben retur afventer behandling.`,
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
      reason: `Betalt for ${Math.floor(input.ageDays)} dage siden og endnu ikke afsendt.`,
      severity: "warn",
    });
  } else if (
    (input.status === "paid" || input.status === "processing") &&
    input.hasSupplier
  ) {
    out.push({
      key: "create-fulfillment",
      label: "Opret fulfillment",
      reason: "Varer har en leverandør — opret leverandør-ordre(r).",
      severity: "info",
    });
  }

  if (input.status === "shipped" && input.ageDays > DELAYED_DELIVERY_DAYS) {
    out.push({
      key: "follow-up-delivery",
      label: "Følg op på levering",
      reason: `Afsendt for over ${DELAYED_DELIVERY_DAYS} dage siden uden bekræftet levering.`,
      severity: "info",
    });
  }

  if (input.status === "pending_payment") {
    out.push({
      key: "awaiting-payment",
      label: "Afventer betaling",
      reason: "Kunden har endnu ikke gennemført betalingen.",
      severity: "info",
    });
  }

  if (input.lowStock) {
    out.push({
      key: "low-stock",
      label: "Lavt lager på en vare",
      reason: "Mindst én vare i ordren har lavt lager — overvej genbestilling.",
      severity: "info",
    });
  }

  return out.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}
