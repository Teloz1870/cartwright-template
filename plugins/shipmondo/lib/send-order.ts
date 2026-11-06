import "server-only";

import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { createSalesOrder, findSalesOrders, ShipmondoApiError, ShipmondoDeadlineError } from "./client";
import { requireShipmondoConfig, type ShipmondoConfig } from "./config";
import { orderRefOf, orderTag, toSalesOrder, type ShippableOrderRow } from "./sales-order";

/**
 * Hands a paid order to Shipmondo as a sales order, once.
 *
 * "Once" is kept on both sides, so neither a double click, a cron run that
 * overlaps an admin's click, nor our own note failing after Shipmondo said yes
 * can put an order in Shipmondo twice:
 *   1. the order's timeline: a system note starting SENT_NOTE records it;
 *   2. Shipmondo itself: before creating, it is asked for a sales order with
 *      this order's `order_id`, and one found there is adopted, not repeated —
 *      but only one carrying this order's tag (`cartwright:<order id>`, set
 *      when it is created): a shared Shipmondo account can hold another
 *      webshop's #1042, even for the same customer, and adopting that would
 *      mark this order sent when it never was.
 *
 * And only one run sends an order at a time: before asking Shipmondo, a run
 * claims the order with a note whose id is fixed per order (the primary key
 * makes the claim atomic). Two overlapping runs — the paid hook, the sweep, a
 * click — cannot both create it. A claim that wins becomes the "sent" note; one
 * that fails is removed; one older than CLAIM_STALE_MS was left by a run that
 * died, and is cleared.
 *
 * A failure is kept as one note per order (fixed id, rewritten each time), and
 * the sweep leaves an order alone for RETRY_AFTER_HOURS after it failed, so an
 * order Shipmondo keeps refusing cannot hold back the ones behind it.
 *
 * Only the built-in statuses that mean "paid, not yet shipped" are sent. An
 * order moved on (shipped, cancelled, refunded …) or still awaiting payment
 * is left alone. Nothing here writes the order itself: the note is the record.
 */
export const SENT_NOTE = "Sent to Shipmondo";
export const FAILED_NOTE = "Could not send to Shipmondo";
export const CLAIM_NOTE = "Sending to Shipmondo";
export const CLAIM_STALE_MS = 10 * 60_000;
export const RETRY_AFTER_HOURS = 6;
export const claimIdOf = (orderId: string) => `shipmondo-send-${orderId}`;
export const failureIdOf = (orderId: string) => `shipmondo-failed-${orderId}`;
export const SHIPPABLE_STATUSES = ["paid", "processing"] as const;
/** How far back the sweep and /admin/shipmondo look: an older order is the shop's to send by hand. */
export const SWEEP_DAYS = 14;
/** How many orders one "Send all" or one sweep sends; the admin list shows as many. */
export const BATCH = 50;

export type SendResult =
  | { outcome: "sent"; salesOrderId: number | null }
  | { outcome: "already_sent"; salesOrderId: number | null }
  | { outcome: "not_shippable"; reason: string }
  | { outcome: "in_progress" }
  /** The run's time budget ran out first: nothing was decided, the next run sends it. */
  | { outcome: "deferred" }
  | { outcome: "failed"; error: string };

type Options = { config?: ShipmondoConfig; fetchImpl?: typeof fetch; now?: Date; deadline?: number };

const ORDER_SELECT = {
  id: true,
  status: true,
  orderNumber: true,
  createdAt: true,
  paidAt: true,
  email: true,
  phoneNumber: true,
  shippingName: true,
  shippingAddress: true,
  shippingZip: true,
  shippingCity: true,
  billingName: true,
  billingAddress: true,
  billingZip: true,
  billingCity: true,
  billingCountry: true,
  shippingDkk: true,
  discountDkk: true,
  discountCode: true,
  totalDkk: true,
  vatOere: true,
  paymentMethod: true,
  paymentRef: true,
  stripePaymentIntentId: true,
  items: {
    select: {
      productName: true,
      sku: true,
      variantSku: true,
      quantity: true,
      unitPriceDkk: true,
      product: { select: { sku: true } },
    },
  },
} as const;

/** A sales order Shipmondo already has is this order only when it carries this order's tag. */
export function isSameOrder(salesOrder: { tags?: unknown }, orderId: string): boolean {
  return Array.isArray(salesOrder.tags) && salesOrder.tags.includes(orderTag(orderId));
}

const SALES_ORDER_PAGE = 25; // the spec's maximum per_page (default 10)

/**
 * The sales order Shipmondo already has for this order, if any: every page of
 * those with its order_id, archived ones too — a shared account can hold many
 * #1042s, and missing our own copy here is the one way to send an order twice.
 */
async function findOurSalesOrder(
  orderRef: string,
  orderId: string,
  client: { config: ShipmondoConfig; fetchImpl?: typeof fetch; deadline?: number },
) {
  for (const archived of [undefined, true] as const) {
    for (let page = 1; page <= 10; page++) {
      const batch = await findSalesOrders(
        { order_id: orderRef, per_page: SALES_ORDER_PAGE, page, ...(archived ? { archived } : {}) },
        client,
      );
      const ours = batch.find((so) => isSameOrder(so as { tags?: unknown }, orderId));
      if (ours) return ours;
      if (batch.length < SALES_ORDER_PAGE) break;
    }
  }
  return null;
}

function salesOrderIdOf(metaJson: string | null): number | null {
  try {
    const id = (JSON.parse(metaJson ?? "null") as { shipmondo?: { salesOrderId?: unknown } } | null)?.shipmondo
      ?.salesOrderId;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}

const isUniqueViolation = (err: unknown) => (err as { code?: unknown } | null)?.code === "P2002";

/** Claims the order for this run; false when another live run holds it. */
async function claim(orderId: string, actor: AuditActor, now: Date, retried = false): Promise<boolean> {
  try {
    await prisma.orderNote.create({
      data: { id: claimIdOf(orderId), orderId, type: "system", author: actor, body: `${CLAIM_NOTE}…` },
    });
    return true;
  } catch (err) {
    if (!isUniqueViolation(err) || retried) {
      if (isUniqueViolation(err)) return false;
      throw err;
    }
    // A claim left by a run that died between claiming and its outcome.
    const cleared = await prisma.orderNote.deleteMany({
      where: {
        id: claimIdOf(orderId),
        body: { startsWith: CLAIM_NOTE },
        createdAt: { lt: new Date(now.getTime() - CLAIM_STALE_MS) },
      },
    });
    return cleared.count > 0 ? claim(orderId, actor, now, true) : false;
  }
}

/** Turns this run's claim into the "sent" note: the record every path checks. */
async function recordSent(
  orderId: string,
  orderRef: string,
  salesOrderId: number | null,
  adopted: boolean,
): Promise<void> {
  await prisma.orderNote.update({
    where: { id: claimIdOf(orderId) },
    data: {
      body: `${SENT_NOTE}${salesOrderId !== null ? ` as sales order ${salesOrderId}` : ""}${
        adopted ? " (it was already there)" : ""
      }`,
      metaJson: JSON.stringify({ shipmondo: { salesOrderId, orderRef } }),
    },
  });
}

/** The order's one failure line, rewritten with the latest reason and time. */
export async function recordFailure(orderId: string, actor: AuditActor, error: string, now = new Date()): Promise<void> {
  const body = `${FAILED_NOTE}: ${error}`;
  await prisma.orderNote.upsert({
    where: { id: failureIdOf(orderId) },
    create: { id: failureIdOf(orderId), orderId, type: "system", author: actor, body, createdAt: now },
    update: { author: actor, body, createdAt: now },
  });
}

export async function sendOrderToShipmondo(
  orderId: string,
  actor: AuditActor,
  opts: Options = {},
): Promise<SendResult> {
  const config = opts.config ?? requireShipmondoConfig();
  const client = { config, fetchImpl: opts.fetchImpl, deadline: opts.deadline };

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
  if (!order) return { outcome: "not_shippable", reason: "Order not found" };
  // An order an operator marked paid (a bank transfer) has no paidAt: its status is the fact.
  if (!(SHIPPABLE_STATUSES as readonly string[]).includes(order.status)) {
    return { outcome: "not_shippable", reason: `Order is ${order.status}, not paid and awaiting shipment` };
  }

  const noted = await prisma.orderNote.findFirst({
    where: { orderId, type: "system", body: { startsWith: SENT_NOTE } },
    select: { metaJson: true },
  });
  if (noted) return { outcome: "already_sent", salesOrderId: salesOrderIdOf(noted.metaJson) };

  if (!(await claim(orderId, actor, opts.now ?? new Date()))) return { outcome: "in_progress" };

  const orderRef = orderRefOf(order);
  try {
    const existing = await findOurSalesOrder(orderRef, order.id, client);
    if (existing) {
      const salesOrderId = typeof existing.id === "number" ? existing.id : null;
      await recordSent(orderId, orderRef, salesOrderId, true);
      return { outcome: "already_sent", salesOrderId };
    }
    return await withAudit(
      { actor, tool: "shipmondo.send_order", args: { orderId, orderRef } },
      async () => {
        const created = await createSalesOrder(toSalesOrder(order as ShippableOrderRow), client);
        const salesOrderId = typeof created?.id === "number" ? created.id : null;
        await recordSent(orderId, orderRef, salesOrderId, false);
        return { outcome: "sent" as const, salesOrderId };
      },
    );
  } catch (err) {
    if (err instanceof ShipmondoDeadlineError) {
      // Not a failure: no request went out after the budget ran out. Free the
      // order without a failure line, so the sweep's pause does not apply.
      await prisma.orderNote.deleteMany({ where: { id: claimIdOf(orderId), body: { startsWith: CLAIM_NOTE } } });
      return { outcome: "deferred" };
    }
    const error =
      err instanceof ShipmondoApiError
        ? `Shipmondo answered ${err.status}: ${err.body.slice(0, 200)}`
        : err instanceof Error
          ? err.message
          : "Unknown error";
    // Free the order for the next attempt, then say why this one failed.
    await prisma.orderNote.deleteMany({ where: { id: claimIdOf(orderId), body: { startsWith: CLAIM_NOTE } } });
    await recordFailure(orderId, actor, error, opts.now);
    return { outcome: "failed", error };
  }
}

export type SweepSummary = {
  checked: number;
  sent: number;
  alreadySent: number;
  failed: { orderId: string; error: string }[];
  /** True when the time budget ran out first: the rest go on the next run. */
  stoppedEarly?: boolean;
};

/**
 * How long one sweep may talk to Shipmondo. The cron route has 60 s
 * (maxDuration): every request is bounded by what is left of this budget (and
 * none starts with under a second left), so a slow Shipmondo stops the sweep
 * at the budget instead of the platform killing it mid-order. An order the
 * budget cuts off is deferred, not failed: its claim is freed and the next run
 * sends it.
 */
export const SWEEP_BUDGET_MS = 45_000;

/**
 * Paid orders from the last SWEEP_DAYS that have no "sent" note, are not being
 * sent by a live run, and have not failed in the last RETRY_AFTER_HOURS, oldest first.
 */
/**
 * Paid within the window. An order an operator marked paid (a bank transfer)
 * has no paidAt; its payment is the "→ paid" note the status door wrote on its
 * timeline. An imported historic order has neither, so it is never swept.
 */
export function paidWithin(since: Date) {
  return {
    OR: [
      { paidAt: { gte: since } },
      { paidAt: null, notes: { some: { type: "system", metaJson: { contains: '"to":"paid"' }, createdAt: { gte: since } } } },
    ],
  };
}

export async function unsentOrderIds(
  limit: number,
  now = new Date(),
  opts: { retryRecentFailures?: boolean } = {},
): Promise<string[]> {
  const retryAfter = new Date(now.getTime() - RETRY_AFTER_HOURS * 3_600_000);
  const rows = await prisma.order.findMany({
    where: {
      status: { in: [...SHIPPABLE_STATUSES] },
      ...paidWithin(new Date(now.getTime() - SWEEP_DAYS * 86_400_000)),
      notes: {
        none: {
          type: "system",
          OR: [
            { body: { startsWith: SENT_NOTE } },
            // Being sent right now by a live run (a dead run's claim is older, and is taken over).
            { body: { startsWith: CLAIM_NOTE }, createdAt: { gte: new Date(now.getTime() - CLAIM_STALE_MS) } },
            // The sweep pauses an order after a failure; an operator's "Send all" retries it now.
            ...(opts.retryRecentFailures ? [] : [{ body: { startsWith: FAILED_NOTE }, createdAt: { gte: retryAfter } }]),
          ],
        },
      },
    },
    orderBy: { paidAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Sends every unsent paid order, one at a time (Shipmondo rate-limits), and says how it went. */
export async function sendUnsentOrders(
  actor: AuditActor,
  opts: Options & { limit?: number; now?: Date; retryRecentFailures?: boolean; budgetMs?: number } = {},
): Promise<SweepSummary> {
  const config = opts.config ?? requireShipmondoConfig();
  const deadline = Date.now() + (opts.budgetMs ?? SWEEP_BUDGET_MS);
  const ids = await unsentOrderIds(opts.limit ?? BATCH, opts.now, { retryRecentFailures: opts.retryRecentFailures });
  const summary: SweepSummary = { checked: 0, sent: 0, alreadySent: 0, failed: [] };
  for (const id of ids) {
    if (Date.now() >= deadline) {
      summary.stoppedEarly = true;
      break;
    }
    const result = await sendOrderToShipmondo(id, actor, { config, fetchImpl: opts.fetchImpl, now: opts.now, deadline });
    if (result.outcome === "deferred") {
      summary.stoppedEarly = true;
      break;
    }
    summary.checked++;
    if (result.outcome === "sent") summary.sent++;
    else if (result.outcome === "already_sent") summary.alreadySent++;
    else if (result.outcome === "failed") summary.failed.push({ orderId: id, error: result.error });
  }
  return summary;
}
