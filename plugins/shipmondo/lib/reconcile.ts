import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { appliedIdOf, applyShipment } from "./apply-shipment";
import { getSalesOrder, getShipment, ShipmondoDeadlineError } from "./client";
import type { ShipmondoConfig } from "./config";
import { orderRefOf } from "./sales-order";
import { BATCH, SENT_NOTE, SHIPPABLE_STATUSES, SWEEP_DAYS, paidWithin } from "./send-order";
import { carrierName } from "./webhook";

/**
 * Tracking Shipmondo has but this shop never heard of. Shipmondo's webhook
 * wants an answer within 3 seconds and documents no retries, so a delivery
 * that came too early, failed, or never came is not lost: the sweep asks
 * Shipmondo, for every order it sent that awaits shipment or has shipped in
 * the window (a second parcel, a replacement label), which
 * outbound fulfilments its sales order has, and hands each to the same
 * applyShipment as the webhook, so every check (ours, outbound, not cancelled,
 * once) holds here too. A shipment already marked on an order that still
 * awaits shipment is one whose status move or email failed: applyShipment
 * resumes it.
 *
 * The orders take turns, however often the sweep runs: each one checked keeps
 * one note with a fixed id whose metadata holds when it was last checked, and
 * a run asks first about the orders never checked, then the ones checked
 * longest ago (one checked within RECHECK_AFTER_MS waits). Orders that stay
 * unshipped (back orders, a parcel handed over in the shop) cannot keep newer
 * ones from being asked about. The note is written once and its time is kept
 * in metadata, so it does not climb the order's timeline on every run.
 */
export const RECHECK_AFTER_MS = 30 * 60_000;
/**
 * How many already-checked orders a run sorts by their last check (the newest
 * paid). A shop with more sent orders than this in SWEEP_DAYS — over 140 a day —
 * rechecks only these; never-checked orders are always reached (their own query).
 */
const CANDIDATES = 2_000;
const CHECKED_PREFIX = "shipmondo-tracking-checked-";
export const checkedIdOf = (orderId: string) => `${CHECKED_PREFIX}${orderId}`;

function lastCheckedOf(metaJson: string | null): number | null {
  try {
    const at = (JSON.parse(metaJson ?? "null") as { shipmondo?: { lastCheckedAt?: unknown } } | null)?.shipmondo?.lastCheckedAt;
    return typeof at === "string" && !Number.isNaN(Date.parse(at)) ? Date.parse(at) : null;
  } catch {
    return null;
  }
}
export type ReconcileSummary = { checked: number; applied: number; failed: { orderId: string; error: string }[]; stoppedEarly?: boolean };

type Options = { config: ShipmondoConfig; fetchImpl?: typeof fetch; deadline: number; now?: Date };

function salesOrderIdOf(metaJson: string | null): number | null {
  try {
    const id = (JSON.parse(metaJson ?? "null") as { shipmondo?: { salesOrderId?: unknown } } | null)?.shipmondo
      ?.salesOrderId;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}

export async function reconcileTracking(opts: Options): Promise<ReconcileSummary> {
  const now = opts.now ?? new Date();
  const where: Prisma.OrderWhereInput = {
    // Shipped ones too: a second parcel or a replacement label whose webhook was missed.
    status: { in: [...SHIPPABLE_STATUSES, "shipped"] },
    ...paidWithin(new Date(now.getTime() - SWEEP_DAYS * 86_400_000)),
    notes: { some: { type: "system", body: { startsWith: SENT_NOTE } } },
  };
  const select = {
    id: true,
    orderNumber: true,
    status: true,
    notes: {
      where: { OR: [{ type: "system", body: { startsWith: SENT_NOTE } }, { id: { startsWith: CHECKED_PREFIX } }] },
      select: { id: true, metaJson: true },
    },
  } satisfies Prisma.OrderSelect;
  // Never-checked orders come straight from the database, so they are reached however
  // many orders the window holds; the rest are sorted below by their last check.
  const [fresh, rechecks] = await Promise.all([
    prisma.order.findMany({
      where: { ...where, AND: [{ notes: { none: { id: { startsWith: CHECKED_PREFIX } } } }] },
      orderBy: { paidAt: "asc" },
      take: BATCH,
      select,
    }),
    prisma.order.findMany({
      where: { ...where, AND: [{ notes: { some: { id: { startsWith: CHECKED_PREFIX } } } }] },
      orderBy: { paidAt: "desc" },
      take: CANDIDATES,
      select,
    }),
  ]);
  const candidates = [...fresh, ...rechecks];
  const orders = candidates
    .map((order) => ({
      ...order,
      sent: order.notes.find((n) => !n.id.startsWith(CHECKED_PREFIX)) ?? null,
      lastChecked: lastCheckedOf(order.notes.find((n) => n.id.startsWith(CHECKED_PREFIX))?.metaJson ?? null),
    }))
    .filter((o) => o.lastChecked === null || now.getTime() - o.lastChecked >= RECHECK_AFTER_MS)
    // Never checked first, then the longest ago; the sort is stable, so paidAt order breaks ties.
    .sort((a, b) => (a.lastChecked ?? -Infinity) - (b.lastChecked ?? -Infinity))
    .slice(0, BATCH);
  const client = { config: opts.config, fetchImpl: opts.fetchImpl, deadline: opts.deadline };
  const summary: ReconcileSummary = { checked: 0, applied: 0, failed: [] };
  for (const order of orders) {
    if (Date.now() >= opts.deadline) {
      summary.stoppedEarly = true;
      break;
    }
    const salesOrderId = salesOrderIdOf(order.sent?.metaJson ?? null);
    if (salesOrderId === null) continue;
    summary.checked++;
    const metaJson = JSON.stringify({ shipmondo: { lastCheckedAt: now.toISOString() } });
    await prisma.orderNote.upsert({
      where: { id: checkedIdOf(order.id) },
      create: {
        id: checkedIdOf(order.id),
        orderId: order.id,
        type: "system",
        author: "system:shipmondo-cron",
        body: "Shipmondo is asked for this order's tracking until it ships",
        metaJson,
      },
      update: { metaJson },
    });
    try {
      const salesOrder = (await getSalesOrder(salesOrderId, client)) as {
        order_fulfillments?: { shipment_id?: unknown; type?: unknown; cancelled?: unknown }[] | null;
      };
      for (const f of salesOrder.order_fulfillments ?? []) {
        if (typeof f.shipment_id !== "number" || f.type !== "outbound" || f.cancelled === true) continue;
        // On an order still awaiting shipment a marked shipment is half applied: hand it on to
        // resume. On a shipped one it is done; only a shipment without a marker is news there.
        if (
          !(SHIPPABLE_STATUSES as readonly string[]).includes(order.status) &&
          (await prisma.orderNote.findUnique({ where: { id: appliedIdOf(f.shipment_id) }, select: { id: true } }))
        ) {
          continue;
        }
        const shipment = await getShipment(f.shipment_id, client);
        if (typeof shipment.pkg_no !== "string" || !shipment.pkg_no) continue;
        const result = await applyShipment(
          {
            shipmentId: f.shipment_id,
            orderRef: orderRefOf(order),
            carrierCode: shipment.carrier_code ?? null,
            carrier: carrierName(shipment.carrier_code),
            trackingNumber: shipment.pkg_no,
          },
          client,
        );
        if (result.outcome === "shipped" || (result.outcome === "tracking_updated" && order.status === "shipped")) {
          summary.applied++;
        }
      }
    } catch (err) {
      if (err instanceof ShipmondoDeadlineError) {
        summary.stoppedEarly = true;
        break;
      }
      summary.failed.push({ orderId: order.id, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }
  return summary;
}
