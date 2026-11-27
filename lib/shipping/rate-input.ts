/**
 * What a shipping rate offers beyond its price: how the parcel reaches the
 * customer, with which carrier, and which shipment template books its label.
 * Pure, so the admin action and its test share one reading of the form.
 *
 * A rate is the delivery method the customer picks in checkout's delivery
 * step (owner decision 2026-11-12). Checkout does not read these fields yet.
 */
export const RATE_KINDS = ["delivery", "pickup"] as const;
export type RateKind = (typeof RATE_KINDS)[number];

export type RateDeliveryInput = { kind?: string; carrierCode?: string; shipmentTemplateId?: string | number };

export type RateDelivery =
  | { ok: true; kind: RateKind; carrierCode: string | null; shipmentTemplateId: number | null }
  | { ok: false; error: string };

const MAX_INT32 = 2_147_483_647;

export function isRateKind(value: unknown): value is RateKind {
  return (RATE_KINDS as readonly unknown[]).includes(value);
}

export function readRateDelivery(input: RateDeliveryInput): RateDelivery {
  const kind = input.kind?.trim() || "delivery";
  if (!isRateKind(kind)) return { ok: false, error: "Delivery type must be 'delivery' or 'pickup'." };

  const carrier = input.carrierCode?.trim().toLowerCase() ?? "";
  if (carrier && !/^[a-z0-9_]{2,40}$/.test(carrier)) {
    return { ok: false, error: "Carrier code: lowercase letters, digits and _ (e.g. gls, postnord)." };
  }
  if (kind === "pickup" && !carrier) {
    return { ok: false, error: "A pickup rate needs a carrier code: it names whose pickup points to offer." };
  }

  const rawTemplate = String(input.shipmentTemplateId ?? "").trim();
  if (rawTemplate && !/^\d{1,10}$/.test(rawTemplate)) {
    return { ok: false, error: "Shipment template id must be a whole number." };
  }
  const template = rawTemplate ? Number(rawTemplate) : null;
  if (template === 0) return { ok: false, error: "Shipment template id must be a whole number above 0." };
  // The column is INTEGER, which Postgres stores in 32 bits: a larger id would
  // make the write throw instead of telling the merchant why.
  if (template !== null && template > MAX_INT32) {
    return { ok: false, error: "Shipment template id is too large." };
  }

  return { ok: true, kind, carrierCode: carrier || null, shipmentTemplateId: template };
}
