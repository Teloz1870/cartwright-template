"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { formatPriceDkk } from "@/lib/format";
import { createRefund } from "@/lib/stripe";
import { restockLines } from "@/lib/orders/restock";
import { createFulfillmentOrders } from "@/lib/fulfillment";
import {
  mailer,
  sendShippingNotificationEmail,
  sendRefundConfirmationEmail,
  sendReturnReceivedEmail,
} from "@/lib/mailer";
import {
  assertTransition,
  isOrderStatus,
  statusesForTab,
  statusLabel,
} from "@/lib/orders/status";
import {
  type ActionResult,
  type BulkResult,
  type OrderListQuery,
  type OrderListResult,
  DELAYED_SHIPMENT_DAYS,
  LOW_STOCK_THRESHOLD,
  ORDER_PAGE_SIZE,
} from "./types";

// ─── helpers (ikke-eksporterede; en "use server"-fil må kun eksportere async) ─

async function adminActor(): Promise<AuditActor> {
  const session = await requireAdmin();
  return `user:${session.user.id}` as AuditActor;
}

/**
 * Kerne-transition: bruges af både updateOrderStatusAdmin og bulkUpdateStatus.
 * Validerer mod operatør-state-machinen, skriver status + en system-timeline-
 * note atomisk, og auditerer. Returnerer ActionResult (kaster ikke til UI).
 */
async function transitionCore(
  actor: AuditActor,
  orderId: string,
  toStatus: string,
): Promise<ActionResult> {
  if (!isOrderStatus(toStatus)) {
    return { ok: false, error: `Ugyldig status: ${toStatus}` };
  }
  const current = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!current) return { ok: false, error: "Ordren blev ikke fundet" };

  // Validér kun hvis nuværende status er en kendt kanonisk state. Legacy/
  // ukendte strings kan vi ikke validere fra → tillad skiftet.
  if (isOrderStatus(current.status)) {
    try {
      assertTransition(current.status, toStatus);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Ulovlig transition",
      };
    }
  }

  const from = current.status;
  await withAudit(
    {
      actor,
      tool: "orders.update_status",
      args: { orderId, from, to: toStatus },
      before: () => ({ status: from }),
    },
    async () => {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: orderId },
          data: { status: toStatus },
        }),
        prisma.orderNote.create({
          data: {
            orderId,
            type: "system",
            author: actor,
            body: `Status: ${statusLabel(from)} → ${statusLabel(toStatus)}`,
            metaJson: JSON.stringify({ from, to: toStatus }),
          },
        }),
      ]);
    },
  );
  return { ok: true };
}

// ─── Phase A: order workspace ─────────────────────────────────────────────────

export async function listOrdersPage(
  query: OrderListQuery,
): Promise<OrderListResult> {
  await requireAdmin();

  const take = query.take ?? ORDER_PAGE_SIZE;
  const where: Prisma.OrderWhereInput = {};

  const statuses = statusesForTab(query.tab ?? "all");
  if (statuses) where.status = { in: [...statuses] };

  const q = query.q?.trim();
  if (q) {
    where.OR = [{ email: { contains: q } }, { id: { startsWith: q } }];
  }

  if (query.fromDate || query.toDate) {
    let toBound: Date | undefined;
    if (query.toDate) {
      toBound = new Date(query.toDate);
      // En "YYYY-MM-DD"-only værdi parses som midnat → inkludér hele dagen.
      if (query.toDate.length <= 10) toBound.setHours(23, 59, 59, 999);
    }
    where.createdAt = {
      ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
      ...(toBound ? { lte: toBound } : {}),
    };
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      email: true,
      shippingName: true,
      status: true,
      totalDkk: true,
      createdAt: true,
      carrier: true,
      trackingNumber: true,
      items: {
        select: {
          quantity: true,
          product: { select: { stock: true } },
          variant: { select: { stock: true } },
        },
      },
    },
  });

  const now = Date.now();
  const rows = orders.map((o) => {
    const itemCount = o.items.reduce((sum, i) => sum + i.quantity, 0);
    const ageDays = (now - o.createdAt.getTime()) / 86_400_000;
    const lowStock = o.items.some(
      (i) => (i.variant?.stock ?? i.product.stock) <= LOW_STOCK_THRESHOLD,
    );
    return {
      id: o.id,
      email: o.email,
      shippingName: o.shippingName,
      status: o.status,
      totalDkk: o.totalDkk,
      itemCount,
      createdAt: o.createdAt.toISOString(),
      carrier: o.carrier,
      trackingNumber: o.trackingNumber,
      flags: {
        delayed: o.status === "shipped" && ageDays > DELAYED_SHIPMENT_DAYS,
        lowStock,
        attention: o.status === "flagged_review" || o.status === "disputed",
      },
    };
  });

  return {
    rows,
    nextCursor: rows.length === take ? rows[rows.length - 1].id : null,
  };
}

export async function updateOrderStatusAdmin(
  orderId: string,
  toStatus: string,
): Promise<ActionResult> {
  const actor = await adminActor();
  const result = await transitionCore(actor, orderId, toStatus);
  if (result.ok) {
    revalidatePath(`/admin/ordrer/${orderId}`);
    revalidatePath("/admin/ordrer");
  }
  return result;
}

export async function bulkUpdateStatus(
  orderIds: string[],
  toStatus: string,
): Promise<BulkResult> {
  const actor = await adminActor();
  let updated = 0;
  const skipped: { id: string; reason: string }[] = [];
  for (const id of orderIds) {
    const r = await transitionCore(actor, id, toStatus);
    if (r.ok) updated++;
    else skipped.push({ id, reason: r.error });
  }
  revalidatePath("/admin/ordrer");
  return { updated, skipped };
}

export async function addOrderNote(
  orderId: string,
  body: string,
): Promise<ActionResult> {
  const actor = await adminActor();
  const trimmed = body?.trim();
  if (!trimmed) return { ok: false, error: "Noten er tom" };
  await withAudit(
    { actor, tool: "orders.note", args: { orderId } },
    () =>
      prisma.orderNote.create({
        data: { orderId, type: "private", author: actor, body: trimmed },
      }),
  );
  revalidatePath(`/admin/ordrer/${orderId}`);
  return { ok: true };
}

export async function setTracking(
  orderId: string,
  data: {
    carrier?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    estDeliveryFrom?: string;
    estDeliveryTo?: string;
  },
): Promise<ActionResult> {
  const actor = await adminActor();
  const carrier = data.carrier?.trim() || null;
  const trackingNumber = data.trackingNumber?.trim() || null;
  const trackingUrl = data.trackingUrl?.trim() || null;
  const estFrom = data.estDeliveryFrom ? new Date(data.estDeliveryFrom) : null;
  const estTo = data.estDeliveryTo ? new Date(data.estDeliveryTo) : null;

  await withAudit(
    {
      actor,
      tool: "orders.set_tracking",
      args: { orderId, carrier, trackingNumber },
    },
    async () => {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: orderId },
          data: {
            carrier,
            trackingNumber,
            trackingUrl,
            estDeliveryFrom: estFrom,
            estDeliveryTo: estTo,
          },
        }),
        prisma.orderNote.create({
          data: {
            orderId,
            type: "system",
            author: actor,
            body: `Tracking opdateret: ${carrier ?? "—"} ${trackingNumber ?? ""}`.trim(),
            metaJson: JSON.stringify({ carrier, trackingNumber, trackingUrl }),
          },
        }),
      ]);
    },
  );
  revalidatePath(`/admin/ordrer/${orderId}`);
  return { ok: true };
}

export async function resendConfirmation(orderId: string): Promise<ActionResult> {
  const actor = await adminActor();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { ok: false, error: "Ordren blev ikke fundet" };
  try {
    await mailer.sendOrderConfirmation({
      orderId: order.id,
      email: order.email,
      shippingName: order.shippingName,
      items: order.items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        unitPriceDkk: i.unitPriceDkk,
      })),
      subtotalDkk: order.subtotalDkk,
      discountDkk: order.discountDkk,
      shippingDkk: order.shippingDkk,
      totalDkk: order.totalDkk,
    });
  } catch {
    return { ok: false, error: "Kunne ikke sende kvittering" };
  }
  await withAudit(
    { actor, tool: "orders.resend_confirmation", args: { orderId } },
    () =>
      prisma.orderNote.create({
        data: {
          orderId,
          type: "system",
          author: actor,
          body: "Ordrekvittering gensendt til kunden",
        },
      }),
  );
  revalidatePath(`/admin/ordrer/${orderId}`);
  return { ok: true };
}

export async function sendShippingNotification(
  orderId: string,
): Promise<ActionResult> {
  const actor = await adminActor();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { ok: false, error: "Ordren blev ikke fundet" };
  try {
    await sendShippingNotificationEmail({
      orderId: order.id,
      email: order.email,
      shippingName: order.shippingName,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      items: order.items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
      })),
    });
  } catch {
    return { ok: false, error: "Kunne ikke sende forsendelses-notifikation" };
  }
  await withAudit(
    { actor, tool: "orders.notify_shipped", args: { orderId } },
    () =>
      prisma.orderNote.create({
        data: {
          orderId,
          type: "system",
          author: actor,
          body: "Forsendelses-notifikation sendt til kunden",
        },
      }),
  );
  revalidatePath(`/admin/ordrer/${orderId}`);
  return { ok: true };
}

/**
 * Manuel refund. Kalder Stripe og STAMPER metadata.orderId, men sætter IKKE
 * Order.status/refundedAt — det gør charge.refunded-webhooken (single writer →
 * idempotent partial-vs-full-logik bevares ét sted). Restock sker IKKE her;
 * kun via retur-flowet (refund = penge tilbage, retur = penge + lager tilbage).
 */
export async function issueRefund(
  orderId: string,
  args: { amountOere?: number; reason?: string },
): Promise<ActionResult> {
  const actor = await adminActor();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, stripePaymentIntentId: true, totalDkk: true },
  });
  if (!order) return { ok: false, error: "Ordren blev ikke fundet" };
  if (!order.stripePaymentIntentId) {
    return {
      ok: false,
      error: "Ordre uden Stripe-betaling — refundér manuelt i Stripe Dashboard.",
    };
  }
  const amountOere = args.amountOere;
  if (amountOere != null) {
    if (!Number.isInteger(amountOere) || amountOere <= 0) {
      return { ok: false, error: "Ugyldigt refund-beløb" };
    }
    if (amountOere > order.totalDkk) {
      return { ok: false, error: "Refund-beløb overstiger ordretotal" };
    }
  }

  let refund: Awaited<ReturnType<typeof createRefund>>;
  try {
    refund = await createRefund({
      orderId: order.id,
      paymentIntentId: order.stripePaymentIntentId,
      amountOere,
      reason: args.reason,
    });
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Stripe-refund fejlede: ${err.message}`
          : "Stripe-refund fejlede",
    };
  }
  if (!refund) return { ok: false, error: "Stripe er ikke konfigureret" };

  const r = refund;
  await withAudit(
    {
      actor,
      tool: "orders.refund",
      args: { orderId, amountOere: amountOere ?? null, reason: args.reason ?? null },
    },
    () =>
      prisma.orderNote.create({
        data: {
          orderId,
          type: "system",
          author: actor,
          body: `Refund udstedt: ${formatPriceDkk(r.amount)}${
            args.reason ? ` (${args.reason})` : ""
          }. Status finaliseres af Stripe-webhook.`,
          metaJson: JSON.stringify({ refundId: r.refundId, amount: r.amount }),
        },
      }),
  );
  revalidatePath(`/admin/ordrer/${orderId}`);
  return { ok: true };
}

// ─── Phase B: fulfillment ─────────────────────────────────────────────────────

export async function createFulfillment(orderId: string): Promise<ActionResult> {
  const actor = await adminActor();
  const res = await createFulfillmentOrders(orderId, actor);
  await prisma.orderNote
    .create({
      data: {
        orderId,
        type: "system",
        author: actor,
        body: `Fulfillment oprettet: ${res.created} leverandør-ordre(r)`,
      },
    })
    .catch(() => {});
  revalidatePath(`/admin/ordrer/${orderId}`);
  return { ok: true };
}

// ─── Phase C: returneringer (RMA, admin-initieret) ────────────────────────────

export async function createReturn(
  orderId: string,
  input: { items: { orderItemId: string; quantity: number }[]; reason: string },
): Promise<ActionResult> {
  const actor = await adminActor();
  const reason = input.reason?.trim();
  if (!reason) return { ok: false, error: "Angiv en årsag" };
  if (!input.items?.length) return { ok: false, error: "Vælg mindst én vare" };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { ok: false, error: "Ordren blev ikke fundet" };

  const itemMap = new Map(order.items.map((i) => [i.id, i]));
  const returnItemsData: {
    orderItemId: string;
    quantity: number;
    productName: string;
    variantId: string | null;
  }[] = [];
  for (const ri of input.items) {
    if (ri.quantity <= 0) continue; // spring 0-mængder over
    const oi = itemMap.get(ri.orderItemId);
    if (!oi) return { ok: false, error: "Ukendt ordre-linje" };
    if (!Number.isInteger(ri.quantity) || ri.quantity > oi.quantity) {
      return { ok: false, error: `Antal overstiger bestilt (${oi.productName})` };
    }
    returnItemsData.push({
      orderItemId: oi.id,
      quantity: ri.quantity,
      productName: oi.productName,
      variantId: oi.variantId,
    });
  }
  if (returnItemsData.length === 0) {
    return { ok: false, error: "Vælg mindst én vare" };
  }

  await withAudit(
    { actor, tool: "orders.return_create", args: { orderId, reason } },
    async () => {
      await prisma.$transaction(async (tx) => {
        const ret = await tx.return.create({
          data: {
            orderId,
            status: "requested",
            reason,
            createdBy: actor,
            items: { create: returnItemsData },
          },
        });
        await tx.orderNote.create({
          data: {
            orderId,
            type: "system",
            author: actor,
            body: `Retur oprettet (${returnItemsData.length} vare(r)): ${reason}`,
            metaJson: JSON.stringify({ returnId: ret.id }),
          },
        });
      });
    },
  );
  revalidatePath(`/admin/ordrer/${orderId}`);
  return { ok: true };
}

export async function approveReturn(returnId: string): Promise<ActionResult> {
  const actor = await adminActor();
  const ret = await prisma.return.findUnique({
    where: { id: returnId },
    select: { orderId: true, status: true },
  });
  if (!ret) return { ok: false, error: "Returen blev ikke fundet" };
  if (ret.status !== "requested") {
    return { ok: false, error: "Kun anmodede returneringer kan godkendes" };
  }
  await withAudit(
    { actor, tool: "orders.return_approve", args: { returnId } },
    async () => {
      await prisma.$transaction([
        prisma.return.update({ where: { id: returnId }, data: { status: "approved" } }),
        prisma.orderNote.create({
          data: {
            orderId: ret.orderId,
            type: "system",
            author: actor,
            body: "Retur godkendt",
          },
        }),
      ]);
    },
  );
  revalidatePath(`/admin/ordrer/${ret.orderId}`);
  return { ok: true };
}

export async function rejectReturn(
  returnId: string,
  reason: string,
): Promise<ActionResult> {
  const actor = await adminActor();
  const ret = await prisma.return.findUnique({
    where: { id: returnId },
    select: { orderId: true },
  });
  if (!ret) return { ok: false, error: "Returen blev ikke fundet" };
  const note = reason?.trim() ? `Retur afvist: ${reason.trim()}` : "Retur afvist";
  await withAudit(
    { actor, tool: "orders.return_reject", args: { returnId } },
    async () => {
      await prisma.$transaction([
        prisma.return.update({ where: { id: returnId }, data: { status: "rejected" } }),
        prisma.orderNote.create({
          data: { orderId: ret.orderId, type: "system", author: actor, body: note },
        }),
      ]);
    },
  );
  revalidatePath(`/admin/ordrer/${ret.orderId}`);
  return { ok: true };
}

/**
 * Modtag retur + genindsæt lager. Idempotent via Return.restocked-boolean inde
 * i transaktionen: et dobbeltklik / retry øger lager præcis én gang.
 */
export async function receiveAndRestock(returnId: string): Promise<ActionResult> {
  const actor = await adminActor();
  let payload: {
    restockedNow: boolean;
    order: { id: string; email: string; shippingName: string };
    items: { productName: string; quantity: number }[];
  };
  try {
    payload = await withAudit(
      { actor, tool: "orders.return_restock", args: { returnId } },
      () =>
        prisma.$transaction(async (tx) => {
          const ret = await tx.return.findUnique({
            where: { id: returnId },
            include: {
              items: { include: { orderItem: { select: { productId: true } } } },
              order: { select: { id: true, email: true, shippingName: true } },
            },
          });
          if (!ret) throw new Error("RETURN_NOT_FOUND");
          const items = ret.items.map((i) => ({
            productName: i.productName,
            quantity: i.quantity,
          }));
          if (ret.restocked) {
            return { restockedNow: false, order: ret.order, items };
          }
          await restockLines(
            tx,
            ret.items.map((i) => ({
              productId: i.orderItem.productId,
              variantId: i.variantId,
              quantity: i.quantity,
            })),
          );
          await tx.return.update({
            where: { id: returnId },
            data: { restocked: true, status: "received" },
          });
          await tx.orderNote.create({
            data: {
              orderId: ret.orderId,
              type: "system",
              author: actor,
              body: `Retur modtaget + lager genindsat (${items.length} vare(r))`,
            },
          });
          return { restockedNow: true, order: ret.order, items };
        }),
    );
  } catch (err) {
    if (err instanceof Error && err.message === "RETURN_NOT_FOUND") {
      return { ok: false, error: "Returen blev ikke fundet" };
    }
    return { ok: false, error: "Kunne ikke registrere retur" };
  }

  if (payload.restockedNow) {
    await sendReturnReceivedEmail({
      orderId: payload.order.id,
      email: payload.order.email,
      shippingName: payload.order.shippingName,
      items: payload.items,
    }).catch(() => {});
  }
  revalidatePath(`/admin/ordrer/${payload.order.id}`);
  return { ok: true };
}

export async function refundReturn(
  returnId: string,
  amountOere: number,
): Promise<ActionResult> {
  const actor = await adminActor();
  const ret = await prisma.return.findUnique({
    where: { id: returnId },
    include: {
      order: {
        select: {
          id: true,
          email: true,
          shippingName: true,
          stripePaymentIntentId: true,
          totalDkk: true,
        },
      },
    },
  });
  if (!ret) return { ok: false, error: "Returen blev ikke fundet" };
  if (!ret.order.stripePaymentIntentId) {
    return { ok: false, error: "Ordre uden Stripe-betaling — refundér manuelt." };
  }
  if (!Number.isInteger(amountOere) || amountOere <= 0) {
    return { ok: false, error: "Ugyldigt refund-beløb" };
  }
  if (amountOere > ret.order.totalDkk) {
    return { ok: false, error: "Refund-beløb overstiger ordretotal" };
  }

  let refund: Awaited<ReturnType<typeof createRefund>>;
  try {
    refund = await createRefund({
      orderId: ret.order.id,
      paymentIntentId: ret.order.stripePaymentIntentId,
      amountOere,
      reason: `return:${returnId}`,
    });
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Stripe-refund fejlede: ${err.message}`
          : "Stripe-refund fejlede",
    };
  }
  if (!refund) return { ok: false, error: "Stripe er ikke konfigureret" };

  const r = refund;
  await withAudit(
    { actor, tool: "orders.return_refund", args: { returnId, amountOere } },
    async () => {
      await prisma.$transaction([
        prisma.return.update({
          where: { id: returnId },
          data: { status: "refunded", refundDkk: r.amount, stripeRefundId: r.refundId },
        }),
        prisma.orderNote.create({
          data: {
            orderId: ret.order.id,
            type: "system",
            author: actor,
            body: `Retur refunderet: ${formatPriceDkk(r.amount)}`,
            metaJson: JSON.stringify({ refundId: r.refundId, returnId }),
          },
        }),
      ]);
    },
  );
  await sendRefundConfirmationEmail({
    orderId: ret.order.id,
    email: ret.order.email,
    shippingName: ret.order.shippingName,
    refundDkk: r.amount,
    partial: r.amount < ret.order.totalDkk,
  }).catch(() => {});
  revalidatePath(`/admin/ordrer/${ret.order.id}`);
  return { ok: true };
}
