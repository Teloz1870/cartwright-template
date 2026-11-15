import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { OrderChangedError } from "@/lib/orders/lifecycle";
import { writeOperatorStatus } from "@/lib/orders/operator-status";
import { QUOTE_STATUS } from "@/lib/orders/status";
import { notifyShipped, writeTracking } from "@/lib/orders/tracking";
import { getSalesOrder } from "./client";
import type { ShipmondoConfig } from "./config";
import { CLAIM_NOTE, SENT_NOTE, SHIPPABLE_STATUSES } from "./send-order";
import type { ShipmondoShipmentEvent } from "./webhook";

/**
 * A shipment Shipmondo reported (a verified webhook, ./webhook.ts) applied to
 * its order: the tracking is saved through lib/orders/tracking.ts, the order
 * moves to `shipped` through the operator door (the shop booked the label —
 * in Shipmondo), and the customer gets the shipping email with the tracking.
 *
 * One Shipmondo account often holds more than this shop's orders (a second
 * webshop, a WooCommerce site during a migration), and its webhook fires for
 * every shipment in it; order numbers can collide. So a shipment is applied
 * only when Shipmondo itself says it is this order's: the order was sent from
 * here (its "Sent to Shipmondo" note holds the sales order's id), and that
 * sales order's `order_fulfillments` list this shipment as outbound, not
 * cancelled (a return label is a fulfilment too).
 * Anything else is ignored, never guessed: a missed shipment costs a manual
 * tracking entry, a wrong one would mail a stranger's tracking to a customer.
 *
 * Each applied shipment leaves a marker note whose id is the shipment's,
 * written in the same transaction as the tracking, so a delivery Shipmondo
 * repeats — even a late one, after a newer parcel replaced its tracking — is
 * recognised. On an order that has moved on it is a no-op, so nobody is mailed
 * twice; on one still awaiting shipment it resumes what a failed attempt left
 * undone (the status move and the email). A second parcel (a new shipment) on
 * a shipped order updates the tracking without a second email. An email that
 * could not be sent is noted on the order, to be sent from there.
 */
const ACTOR = "system:shipmondo-webhook" as const;
export const APPLIED_NOTE = "Shipmondo shipment";

export type ApplyOutcome =
  | "shipped"
  | "tracking_updated"
  | "unchanged"
  | "unknown_order"
  | "not_ours"
  | "not_shippable"
  /** This shop is sending the order right now (a claim, no "sent" note yet): try again later. */
  | "awaiting_send";

/** The order a sales order's `order_id` names: its number, else its id (./sales-order.ts orderRefOf). */
const MAX_ORDER_NUMBER = 2_147_483_647; // Order.orderNumber is a 32-bit Int

function candidates(ref: string): Prisma.OrderWhereUniqueInput[] {
  // Another webshop's order_id in a shared account can be any digits; past the
  // column's range it can only be an id, never one of this shop's numbers.
  const n = /^\d+$/.test(ref) ? Number(ref) : NaN;
  return Number.isSafeInteger(n) && n <= MAX_ORDER_NUMBER ? [{ orderNumber: n }, { id: ref }] : [{ id: ref }];
}

const appliedPrefix = (shipmentId: number) => `${APPLIED_NOTE} ${shipmentId} applied`;
/** One marker per Shipmondo shipment: its fixed id makes "applied once" a primary key. */
export const appliedIdOf = (shipmentId: number) => `shipmondo-shipment-${shipmentId}`;
const isUniqueViolation = (err: unknown) => (err as { code?: unknown } | null)?.code === "P2002";

function salesOrderIdOf(metaJson: string | null): number | null {
  try {
    const id = (JSON.parse(metaJson ?? "null") as { shipmondo?: { salesOrderId?: unknown } } | null)?.shipmondo
      ?.salesOrderId;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}

async function findOrder(ref: string) {
  for (const where of candidates(ref)) {
    const order = await prisma.order.findUnique({
      where,
      select: {
        id: true,
        status: true,
        email: true,
        shippingName: true,
        estDeliveryFrom: true,
        estDeliveryTo: true,
        items: { select: { productName: true, quantity: true } },
        notes: {
          where: { type: "system", OR: [{ body: { startsWith: SENT_NOTE } }, { body: { startsWith: CLAIM_NOTE } }] },
          select: { body: true, metaJson: true },
        },
      },
    });
    if (order) return order;
  }
  return null;
}

/**
 * Does Shipmondo list this shipment on the sales order this shop created, as an
 * outbound fulfilment that is not cancelled? A return label is a fulfilment
 * too: it must never replace the customer's outbound tracking.
 */
async function isOurShipment(
  salesOrderId: number,
  shipmentId: number,
  opts: { config: ShipmondoConfig; fetchImpl?: typeof fetch; deadline?: number },
): Promise<boolean> {
  const salesOrder = (await getSalesOrder(salesOrderId, opts)) as {
    order_fulfillments?: { shipment_id?: unknown; cancelled?: unknown; type?: unknown }[] | null;
  };
  return (salesOrder.order_fulfillments ?? []).some(
    (f) => f.shipment_id === shipmentId && f.type === "outbound" && f.cancelled !== true,
  );
}

export async function applyShipment(
  event: ShipmondoShipmentEvent,
  opts: { config: ShipmondoConfig; fetchImpl?: typeof fetch; deadline?: number },
): Promise<{ outcome: ApplyOutcome; orderId?: string }> {
  const order = await findOrder(event.orderRef);
  if (!order) return { outcome: "unknown_order" };
  const sent = order.notes.find((n) => n.body.startsWith(SENT_NOTE));
  // Shipmondo can book a label before this shop has recorded the send it just made.
  if (!sent && order.notes.some((n) => n.body.startsWith(CLAIM_NOTE))) return { outcome: "awaiting_send", orderId: order.id };
  const salesOrderId = salesOrderIdOf(sent?.metaJson ?? null);
  if (event.shipmentId === null || salesOrderId === null) return { outcome: "not_ours", orderId: order.id };
  if (!(await isOurShipment(salesOrderId, event.shipmentId, opts))) return { outcome: "not_ours", orderId: order.id };

  const awaitingShipment = (SHIPPABLE_STATUSES as readonly string[]).includes(order.status);
  let applied = (await prisma.orderNote.findUnique({ where: { id: appliedIdOf(event.shipmentId) }, select: { id: true } })) !== null;
  if (applied && !awaitingShipment) return { outcome: "unchanged", orderId: order.id };
  if (order.status === QUOTE_STATUS || !["shipped", "delivered", ...SHIPPABLE_STATUSES].includes(order.status)) {
    return { outcome: "not_shippable", orderId: order.id };
  }

  const shipmentId = event.shipmentId;
  // Shipmondo's shipment ids only grow. One older than a shipment this order
  // already shows (its webhook missed, fetched later by the sweep) is recorded,
  // so it is not fetched again, but never replaces the newer tracking.
  if (!applied) {
    const markers = await prisma.orderNote.findMany({
      where: { orderId: order.id, id: { startsWith: "shipmondo-shipment-" } },
      select: { id: true },
    });
    const newest = Math.max(-Infinity, ...markers.map((m) => Number(m.id.slice("shipmondo-shipment-".length))).filter(Number.isFinite));
    if (newest > shipmentId) {
      try {
        await prisma.orderNote.create({
          data: {
            id: appliedIdOf(shipmentId),
            orderId: order.id,
            type: "system",
            author: ACTOR,
            body: `${appliedPrefix(shipmentId)} (older than the tracking shown): ${event.carrier ?? "—"} ${event.trackingNumber}`,
            metaJson: JSON.stringify({ shipmondo: { shipmentId, salesOrderId, superseded: true } }),
          },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
      return { outcome: "unchanged", orderId: order.id };
    }
  }
  return withAudit(
    { actor: ACTOR, tool: "shipmondo.apply_shipment", args: { ...event, orderId: order.id, salesOrderId } },
    async () => {
      const tracking = { carrier: event.carrier, trackingNumber: event.trackingNumber, trackingUrl: null };
      if (!applied) {
        // The marker and the tracking commit together; a second delivery of the
        // same shipment running at the same time hits the marker's primary key.
        try {
          await prisma.$transaction(async (tx) => {
            await tx.orderNote.create({
              data: {
                id: appliedIdOf(shipmentId),
                orderId: order.id,
                type: "system",
                author: ACTOR,
                body: `${appliedPrefix(shipmentId)}: ${event.carrier ?? "—"} ${event.trackingNumber}`,
                metaJson: JSON.stringify({ shipmondo: { shipmentId, salesOrderId } }),
              },
            });
            await writeTracking(
              order.id,
              ACTOR,
              { ...tracking, estDeliveryFrom: order.estDeliveryFrom, estDeliveryTo: order.estDeliveryTo },
              tx,
            );
          });
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          applied = true;
        }
        if (applied && !awaitingShipment) return { outcome: "unchanged" as const, orderId: order.id };
      }
      if (!awaitingShipment) return { outcome: "tracking_updated" as const, orderId: order.id };
      try {
        await prisma.$transaction((tx) =>
          writeOperatorStatus(tx, {
            orderId: order.id,
            from: order.status,
            to: "shipped",
            actor: ACTOR,
            source: "shipmondo.webhook",
          }),
        );
      } catch (err) {
        // Moved since it was read (another operator, a cancel): the tracking is
        // saved, the status and the email are theirs to decide.
        if (err instanceof OrderChangedError) return { outcome: "tracking_updated" as const, orderId: order.id };
        throw err;
      }
      if (!(await notifyShipped({ ...order, ...tracking }, ACTOR))) {
        await prisma.orderNote.create({
          data: {
            orderId: order.id,
            type: "system",
            author: ACTOR,
            body: "The shipping email could not be sent. Send it from this order.",
          },
        });
      }
      return { outcome: "shipped" as const, orderId: order.id };
    },
  );
}
