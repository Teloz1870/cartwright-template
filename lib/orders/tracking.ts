import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { sendShippingNotificationEmail } from "@/lib/mailer";

/**
 * One door for an order's tracking: the admin order page's tracking form
 * (app/admin/ordrer/actions.ts `setTracking`) and the `orders.set_tracking`
 * tool both write through here, so the order and its timeline note can never
 * disagree about which path set them.
 *
 * The write REPLACES all five fields, as the admin form always has: a field
 * left out is cleared. An agent that books a label elsewhere (a carrier or an
 * aggregator such as Shipmondo) sends the whole tracking in one call.
 */
export type TrackingFields = {
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estDeliveryFrom: Date | null;
  estDeliveryTo: Date | null;
};

/**
 * Pass `tx` to write inside a caller's transaction, together with its own rows
 * (the shipmondo plugin records the shipment it applied in the same commit).
 */
export async function writeTracking(
  orderId: string,
  actor: AuditActor,
  fields: TrackingFields,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const { carrier, trackingNumber, trackingUrl, estDeliveryFrom, estDeliveryTo } = fields;
  const note = {
    orderId,
    type: "system",
    author: actor,
    body: `Tracking updated: ${carrier ?? "—"} ${trackingNumber ?? ""}`.trim(),
    metaJson: JSON.stringify({ carrier, trackingNumber, trackingUrl }),
  };
  // Literal keys, never a spread: the one-door scans (tests/unit/orders/
  // lifecycle.test.ts) can then see that this write never touches status.
  if (tx) {
    await tx.order.update({
      where: { id: orderId },
      data: { carrier, trackingNumber, trackingUrl, estDeliveryFrom, estDeliveryTo },
    });
    await tx.orderNote.create({ data: note });
    return;
  }
  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { carrier, trackingNumber, trackingUrl, estDeliveryFrom, estDeliveryTo },
    }),
    prisma.orderNote.create({ data: note }),
  ]);
}

/** What the shipping email needs from an order; the caller has already loaded it. */
export type ShippableOrder = {
  id: string;
  email: string;
  shippingName: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  items: { productName: string; quantity: number }[];
};

/**
 * Emails the customer that the order has shipped, with its tracking, and notes
 * it on the order timeline (audited as `orders.notify_shipped`). Returns false,
 * having written nothing, when the mail could not be sent. A quote is not an
 * order yet: both callers refuse one before they get here.
 */
export async function notifyShipped(order: ShippableOrder, actor: AuditActor): Promise<boolean> {
  try {
    await sendShippingNotificationEmail({
      orderId: order.id,
      email: order.email,
      shippingName: order.shippingName,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      items: order.items.map((i) => ({ productName: i.productName, quantity: i.quantity })),
    });
  } catch {
    return false;
  }
  await withAudit({ actor, tool: "orders.notify_shipped", args: { orderId: order.id } }, () =>
    prisma.orderNote.create({
      data: {
        orderId: order.id,
        type: "system",
        author: actor,
        body: "Shipping notification sent to the customer",
      },
    }),
  );
  return true;
}
