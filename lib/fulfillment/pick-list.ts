/**
 * Pluk-/pakkeseddel — pure model-builder. Ingen DB, ingen rendering: tager en
 * ordre-snapshot og producerer en flad, print-venlig model. Print-ruten
 * (app/admin/ordrer/[id]/pakkeseddel) renderer modellen som @media print-HTML
 * → operatøren bruger Cmd-P → "Gem som PDF" (ingen PDF-dependency på serverless).
 */

export type PackingSlipInput = {
  id: string;
  createdAt: Date | string;
  shippingName: string;
  shippingAddress: string;
  shippingZip: string;
  shippingCity: string;
  carrier: string | null;
  trackingNumber: string | null;
  items: {
    productName: string;
    quantity: number;
    variantSku: string | null;
    variantAttributes: unknown;
  }[];
};

export type PickListLine = {
  productName: string;
  variant: string | null;
  sku: string | null;
  quantity: number;
};

export type PackingSlipModel = {
  orderId: string;
  shortId: string;
  createdAtIso: string;
  shipping: { name: string; address: string; zip: string; city: string };
  carrier: string | null;
  trackingNumber: string | null;
  lines: PickListLine[];
  totalUnits: number;
};

/** Render variant-attributes som "2m · 3m · grå", eller null hvis ingen. */
function formatVariant(attrs: unknown): string | null {
  if (!attrs || typeof attrs !== "object") return null;
  const values = Object.values(attrs as Record<string, unknown>)
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .map(String);
  return values.length ? values.join(" · ") : null;
}

export function buildPackingSlip(order: PackingSlipInput): PackingSlipModel {
  const createdAtIso =
    typeof order.createdAt === "string"
      ? order.createdAt
      : order.createdAt.toISOString();

  const lines: PickListLine[] = order.items.map((i) => ({
    productName: i.productName,
    variant: formatVariant(i.variantAttributes),
    sku: i.variantSku,
    quantity: i.quantity,
  }));

  return {
    orderId: order.id,
    shortId: order.id.slice(0, 8),
    createdAtIso,
    shipping: {
      name: order.shippingName,
      address: order.shippingAddress,
      zip: order.shippingZip,
      city: order.shippingCity,
    },
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    lines,
    totalUnits: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}
