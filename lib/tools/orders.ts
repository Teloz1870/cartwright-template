import "server-only";

import { z } from "zod";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import {
  MANUAL_REFUND_NOTE,
  ORDER_STATUSES,
  QUOTE_STATUS,
  REFUND_STATUSES,
  assertTransition,
  canTransition,
  isOperatorTarget,
  isOrderStatus,
  type OrderStatus,
} from "@/lib/orders/status";
import { cancelOrderPaymentIntent } from "@/lib/orders/cancel-payment";
import { writeOperatorStatus } from "@/lib/orders/operator-status";
import { notifyShipped, writeTracking } from "@/lib/orders/tracking";

// Ordrestyring: AI-tool'et adresserer hele det kanoniske supersæt (12
// statuses) så det kan filtrere på + flytte til de nye admin-states
// (processing/delivered/completed). Transitions valideres af samme state
// machine som admin-UI'et (assertTransition nedenfor).
// The `quotes` flag adds the quote to these schemas. They are frozen at module
// load (B22 = b), which is why the flag is compile-time. With it off, what the
// catalogue, OpenAPI and MCP publish here is what they published before it.
const ORDER_STATUS: readonly OrderStatus[] = brand.features.quotes
  ? [...ORDER_STATUSES, QUOTE_STATUS]
  : ORDER_STATUSES;

const listInput = z.object({
  status: z.enum(ORDER_STATUS).optional(),
  email: z.string().email().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const getInput = z.object({
  orderId: z.string().min(1),
});

// A status is not a payment. `refunded`/`partial_refund` written through this
// tool move no money. A card refund (admin order page `createRefund`, or the
// Stripe dashboard) sets the status itself via the charge.refunded webhook. So the tool refuses
// both targets unless the caller says, explicitly and confirmed, that it is
// recording a refund made outside the shop (invoice/EAN, bank transfer).
// REFUND_STATUSES + MANUAL_REFUND_NOTE are shared with the admin status form.

export const REFUND_REQUIRES_PAYMENT_PATH = "refund_requires_payment_path";

type RefundGuardArgs = {
  status: string;
  manual?: boolean;
  confirm?: boolean;
  refundDkk?: number;
};

/** Why these args may not run, or null. Shared by the schema and the handler. */
export function refundGuardIssue(args: RefundGuardArgs): string | null {
  if (
    args.refundDkk !== undefined &&
    !(Number.isInteger(args.refundDkk) && args.refundDkk > 0)
  ) {
    return "refundDkk must be a positive whole number of øre.";
  }
  if (!REFUND_STATUSES.has(args.status)) {
    return args.refundDkk === undefined
      ? null
      : "refundDkk is only accepted with status partial_refund.";
  }
  if (args.manual !== true || args.confirm !== true) {
    return `${REFUND_REQUIRES_PAYMENT_PATH}: setting '${args.status}' here moves no money. Refund the payment from the admin order page, or — to record a refund made outside the shop — send manual: true and confirm: true.`;
  }
  if (args.status === "partial_refund" && args.refundDkk === undefined) {
    return "A manual partial_refund needs refundDkk (the amount refunded, in øre).";
  }
  if (args.status === "refunded" && args.refundDkk !== undefined) {
    return "refundDkk is only accepted with status partial_refund.";
  }
  return null;
}

const updateStatusInput = z
  .object({
    orderId: z.string().min(1),
    status: z.enum(ORDER_STATUS),
    manual: z
      .boolean()
      .optional()
      .describe(
        "Required (true) for refunded/partial_refund: records a refund made outside the shop. No money is moved.",
      ),
    // boolean, not literal(true): `confirm: false` on an ordinary move must keep
    // passing as it did before this field existed; the guard reads `=== true`.
    confirm: z
      .boolean()
      .optional()
      .describe("Required (true) together with manual for refunded/partial_refund."),
    refundDkk: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Amount refunded outside the shop, in øre. Required for a manual partial_refund."),
  })
  .superRefine((args, ctx) => {
    const issue = refundGuardIssue(args);
    if (issue) ctx.addIssue({ code: "custom", message: issue, path: ["status"] });
  });

const orderSummaryItemOutput = z.strictObject({
  productName: z.string(),
  quantity: z.number().int(),
  unitPriceDkk: z.number().int(),
});

const orderSummaryOutput = z.strictObject({
  id: z.string(),
  email: z.string(),
  shippingName: z.string(),
  status: z.string(),
  subtotalDkk: z.number().int(),
  discountDkk: z.number().int(),
  shippingDkk: z.number().int(),
  totalDkk: z.number().int(),
  discountCode: z.string().nullable(),
  itemCount: z.number().int().min(0),
  items: z.array(orderSummaryItemOutput),
  createdAt: z.iso.datetime(),
});

const orderItemOutput = z.strictObject({
  id: z.string(),
  orderId: z.string(),
  // Null when the line outlived its product (an imported historic order).
  productId: z.string().nullable(),
  productName: z.string(),
  sku: z.string().nullable(),
  unitPriceDkk: z.number().int(),
  quantity: z.number().int(),
  variantId: z.string().nullable(),
  variantSku: z.string().nullable(),
  variantAttributes: z
    .json()
    .nullable()
    .describe("Opaque JSON snapshot of the selected product variant attributes."),
  optionSelections: z
    .json()
    .nullable()
    .describe("Opaque JSON snapshot of the options chosen on this line."),
});

const orderDetailOutput = z.strictObject({
  id: z.string(),
  userId: z.string().nullable(),
  email: z.string(),
  status: z.string(),
  shippingName: z.string(),
  shippingAddress: z.string(),
  shippingZip: z.string(),
  shippingCity: z.string(),
  billingName: z.string().nullable(),
  billingAddress: z.string().nullable(),
  billingZip: z.string().nullable(),
  billingCity: z.string().nullable(),
  billingCountry: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  subtotalDkk: z.number().int(),
  shippingDkk: z.number().int(),
  discountDkk: z.number().int(),
  totalDkk: z.number().int(),
  vatOere: z.number().int().nullable(),
  invoiceProvider: z.string().nullable(),
  invoiceId: z.string().nullable(),
  invoicePdfUrl: z.string().nullable(),
  discountCode: z.string().nullable(),
  isAiGenerated: z.boolean(),
  aiAgentSource: z.string().nullable(),
  carrier: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  estDeliveryFrom: z.iso.datetime().nullable(),
  estDeliveryTo: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  stripePaymentIntentId: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  paidAt: z.iso.datetime().nullable(),
  currency: z.string(),
  fxRate: z.number(),
  channel: z.string(),
  acpSessionId: z.string().nullable(),
  confirmationEmailSentAt: z.iso.datetime().nullable(),
  refundedAt: z.iso.datetime().nullable(),
  disputedAt: z.iso.datetime().nullable(),
  orderNumber: z.number().int().nullable(),
  termsVersion: z.string().nullable(),
  termsAcceptedAt: z.iso.datetime().nullable(),
  externalId: z.string().nullable(),
  source: z.string().nullable(),
  paymentProvider: z.string().nullable(),
  paymentRef: z.string().nullable(),
  cvr: z.string().nullable(),
  ean: z.string().nullable(),
  reference: z.string().nullable(),
  items: z.array(orderItemOutput),
});

const orderStatusOutput = z.strictObject({
  id: z.string(),
  status: z.enum(ORDER_STATUS),
  // Present only on a manual refund registration, and always false there.
  moneyMoved: z.literal(false).optional(),
  // Present only on a cancel of an order that was awaiting payment: its items
  // went back to stock (lib/orders/cancel-unpaid.ts).
  restocked: z.literal(true).optional(),
  // Present only on a cancel of an order with a Stripe payment: what happened
  // to that payment (lib/orders/cancel-payment.ts).
  paymentIntent: z
    .strictObject({
      outcome: z.enum(["canceled", "already_canceled", "succeeded", "failed"]),
      note: z.string(),
    })
    .optional(),
});

export const listOrders = defineTool({
  name: "orders.list",
  description:
    "List orders with optional filters (status, email, date range). Returns order summaries with items, totals, and status.",
  scope: "orders:read",
  gate: { ecommerce: true },
  input: listInput,
  output: z.array(orderSummaryOutput),
  examples: [
    {
      name: "List recent paid orders",
      body: {
        status: "paid",
        limit: 10
      }
    }
  ],
  skipAudit: true,
  handler: async (args) => {
    const where: Record<string, unknown> = {};
    if (args.status) where.status = args.status;
    if (args.email) where.email = args.email;
    if (args.fromDate || args.toDate) {
      where.createdAt = {
        ...(args.fromDate ? { gte: new Date(args.fromDate) } : {}),
        ...(args.toDate ? { lte: new Date(args.toDate) } : {}),
      };
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: args.limit,
      include: { items: { select: { productName: true, quantity: true, unitPriceDkk: true } } },
    });

    return orders.map((o) => ({
      id: o.id,
      email: o.email,
      shippingName: o.shippingName,
      status: o.status,
      subtotalDkk: o.subtotalDkk,
      discountDkk: o.discountDkk,
      shippingDkk: o.shippingDkk,
      totalDkk: o.totalDkk,
      discountCode: o.discountCode,
      itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
      items: o.items,
      createdAt: o.createdAt,
    }));
  },
});

export const getOrder = defineTool({
  name: "orders.get",
  description:
    "Get one order by ID with full details including customer info, items, and shipping address.",
  scope: "orders:read",
  gate: { ecommerce: true },
  input: getInput,
  output: orderDetailOutput,
  examples: [
    {
      name: "Get order details",
      body: {
        orderId: "cuid-12345"
      }
    }
  ],
  skipAudit: true,
  handler: async (args) => {
    const order = await prisma.order.findUnique({
      where: { id: args.orderId },
      include: { items: true },
    });
    if (!order) throw new Error(`Order not found: ${args.orderId}`);
    return order;
  },
});

export const updateOrderStatus = defineTool({
  name: "orders.update_status",
  description:
    `Changes the status of an order. Valid statuses: pending_payment, pending, paid, processing, shipped, delivered, completed, cancelled, refunded, partial_refund, flagged_review, disputed${
      brand.features.quotes
        ? `, ${QUOTE_STATUS}. A quote is no order yet: it moves to pending_payment or cancelled, and no move leads into one`
        : ""
    }. ` +
    "The move must be a legal transition from the order's current status (operator state machine). This tool moves no money: refunded/partial_refund are refused unless you are recording a refund made outside the shop (manual: true + confirm: true, plus refundDkk for partial_refund); the order then gets a note saying no money moved and the result carries moneyMoved: false. Refund a card payment from the admin order page instead. Every non-refund move writes the same order-timeline note as the admin status form, and is refused without writing anything if the order's status changed after this call read it (another cancel, a payment, another operator) — re-read the order and decide again. Cancelling an order that is still pending_payment returns its items to stock (the result carries restocked: true, and the timeline note says so). Cancelling an order with a Stripe payment also cancels that payment if it is still unpaid; one the customer already paid is left alone and must be refunded from the admin order page — the result's paymentIntent says which. Logs before state to audit.",
  scope: "orders:write",
  gate: { ecommerce: true },
  input: updateStatusInput,
  output: orderStatusOutput,
  examples: [
    {
      name: "Mark order as shipped",
      body: {
        orderId: "cuid-12345",
        status: "shipped"
      }
    },
    {
      name: "Record a refund made by bank transfer",
      body: {
        orderId: "cuid-12345",
        status: "refunded",
        manual: true,
        confirm: true
      }
    }
  ],
  handler: async (args, ctx) => {
    // The schema already refuses these args over REST/MCP; the handler repeats
    // the check so no caller that skips the schema can write a refund status.
    const issue = refundGuardIssue(args);
    if (issue) throw new Error(issue);
    const manualRefund = REFUND_STATUSES.has(args.status);
    return withAudit(
      {
        actor: ctx.actor,
        tool: "orders.update_status",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () =>
          prisma.order.findUnique({
            where: { id: args.orderId },
            select: { status: true },
          }),
      },
      async () => {
        const current = await prisma.order.findUnique({
          where: { id: args.orderId },
          select: { status: true, totalDkk: true, stripePaymentIntentId: true },
        });
        if (!current) throw new Error(`Order not found: ${args.orderId}`);
        // Samme operatør-state-machine som admin-UI'et. Hvis ordrens
        // nuværende status er en legacy/ukendt string, springer vi guarden
        // over (kan ikke validere fra en ukendt state) men tillader skiftet.
        // args.status er runtime-valideret af z.enum(ORDER_STATUS), men
        // defineTool's z.ZodType<TInput> udvisker literal-unionen til string
        // → cast er sikker (Zod garanterer værdien).
        if (isOrderStatus(current.status) && isOrderStatus(args.status)) {
          assertTransition(current.status, args.status);
        } else if (!isOperatorTarget(args.status)) {
          // The one thing a move out of a status the machine cannot validate may not do.
          throw new Error(`Illegal order transition: ${current.status} → ${args.status}. No operator move leads there.`);
        }
        if (manualRefund && args.refundDkk !== undefined && args.refundDkk >= current.totalDkk) {
          throw new Error(
            `refundDkk (${args.refundDkk}) must be below the order total (${current.totalDkk}); a full refund is status refunded.`,
          );
        }
        // The admin status form's own write (lib/orders/operator-status.ts):
        // conditional on the status read above — an order that moved on since
        // is refused, "reload" — with the same order-timeline note in the same
        // transaction. A cancel of an order awaiting payment returns its stock
        // there too, so the webhook this cancel fires can never restock it again.
        // refundedAt stays null on a manual refund: it records money that moved
        // (charge.refunded).
        const { restocked } = await prisma.$transaction((tx) =>
          writeOperatorStatus(tx, {
            orderId: args.orderId,
            from: current.status,
            to: args.status,
            actor: ctx.actor,
            source: "orders.update_status",
            note: manualRefund
              ? {
                  body: `${MANUAL_REFUND_NOTE}: status set to ${args.status}${
                    args.refundDkk !== undefined ? ` (${args.refundDkk} øre refunded outside the shop)` : ""
                  }.`,
                  meta: {
                    manual: true,
                    moneyMoved: false,
                    ...(args.refundDkk !== undefined ? { refundDkk: args.refundDkk } : {}),
                  },
                }
              : undefined,
          }),
        );
        const updated = {
          id: args.orderId,
          status: args.status,
          ...(restocked ? { restocked: true as const } : {}),
          ...(manualRefund ? { moneyMoved: false as const } : {}),
        };
        if (args.status !== "cancelled") return updated;
        // Same as the admin status form: the order's live PaymentIntent is
        // cancelled after the status is written (fail-soft, never throws).
        const paymentIntent = await cancelOrderPaymentIntent({
          orderId: args.orderId,
          paymentIntentId: current.stripePaymentIntentId,
          actor: ctx.actor,
        });
        return paymentIntent ? { ...updated, paymentIntent } : updated;
      },
    );
  },
});

// Bounded, trimmed text: these land in the customer's shipping email and on the
// packing slip. The mail escapes them; the bounds keep an agent's mistake small.
const trackingText = (max: number) => z.string().trim().min(1).max(max).optional();

// "Your order is on its way" to a customer whose order is cancelled, refunded or
// still unpaid would be false: the tool refuses the email there (the tracking
// alone can still be saved). Unpaid is the state machine's own reading: a status
// that may still become paid (pending_payment, pending, flagged_review — an
// order held for review). A quote is refused outright, below.
function refusesShippingEmail(status: string): boolean {
  if (status === "cancelled" || status === "refunded") return true;
  return isOrderStatus(status) && canTransition(status, "paid");
}

const setTrackingInput = z.object({
  orderId: z.string().min(1),
  carrier: trackingText(64).describe("Carrier as the customer should read it, e.g. 'PostNord' or 'GLS'."),
  trackingNumber: trackingText(128),
  trackingUrl: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .optional()
    .describe("The carrier's public tracking page for this parcel (http or https)."),
  estDeliveryFrom: z.iso.date().optional().describe("Earliest expected delivery day, YYYY-MM-DD."),
  estDeliveryTo: z.iso.date().optional().describe("Latest expected delivery day, YYYY-MM-DD."),
  notifyCustomer: z
    .boolean()
    .optional()
    .describe("True: also email the customer that the order has shipped, with this tracking. Refused for a cancelled, refunded or unpaid order."),
}).refine((a) => !a.estDeliveryFrom || !a.estDeliveryTo || a.estDeliveryFrom <= a.estDeliveryTo, {
  message: "estDeliveryFrom is after estDeliveryTo.",
  path: ["estDeliveryFrom"],
});

const setTrackingOutput = z.strictObject({
  id: z.string(),
  carrier: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  // Present only when notifyCustomer was true: false means the tracking was
  // saved but the email could not be sent.
  notified: z.boolean().optional(),
});

export const setOrderTracking = defineTool({
  name: "orders.set_tracking",
  description:
    "Sets an order's shipment tracking — carrier, tracking number, tracking link and expected delivery days — as the admin order page's tracking form does. " +
    "It REPLACES the order's tracking: a field you leave out is cleared, so send the whole tracking in one call. " +
    "Use it after booking a label outside the shop (a carrier, or an aggregator such as Shipmondo). " +
    "With notifyCustomer: true it also emails the customer that the order has shipped, with this tracking; that email is the only place the customer sees it, and it is refused for a cancelled, refunded or unpaid order. " +
    "It does not change the order's status: move the order to shipped with orders.update_status. A quote is refused (it is not an order yet). Logs the previous tracking to audit.",
  scope: "orders:write",
  gate: { ecommerce: true },
  input: setTrackingInput,
  output: setTrackingOutput,
  examples: [
    {
      name: "Save a PostNord parcel and tell the customer",
      body: {
        orderId: "cuid-12345",
        carrier: "PostNord",
        trackingNumber: "00370712345678901234",
        trackingUrl: "https://tracking.postnord.com/dk/?id=00370712345678901234",
        notifyCustomer: true,
      },
    },
  ],
  handler: async (args, ctx) =>
    withAudit(
      {
        actor: ctx.actor,
        tool: "orders.set_tracking",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () =>
          prisma.order.findUnique({
            where: { id: args.orderId },
            select: {
              carrier: true,
              trackingNumber: true,
              trackingUrl: true,
              estDeliveryFrom: true,
              estDeliveryTo: true,
            },
          }),
      },
      async () => {
        const order = await prisma.order.findUnique({
          where: { id: args.orderId },
          select: {
            id: true,
            status: true,
            email: true,
            shippingName: true,
            items: { select: { productName: true, quantity: true } },
          },
        });
        if (!order) throw new Error(`Order not found: ${args.orderId}`);
        if (order.status === QUOTE_STATUS) {
          throw new Error("This is a quote, not an order yet. Move it to pending_payment first.");
        }
        if (args.notifyCustomer === true && refusesShippingEmail(order.status)) {
          throw new Error(
            `The order is ${order.status}: no shipping email goes out for it. Save the tracking without notifyCustomer.`,
          );
        }
        const tracking = {
          carrier: args.carrier ?? null,
          trackingNumber: args.trackingNumber ?? null,
          trackingUrl: args.trackingUrl ?? null,
        };
        await writeTracking(order.id, ctx.actor, {
          ...tracking,
          estDeliveryFrom: args.estDeliveryFrom ? new Date(args.estDeliveryFrom) : null,
          estDeliveryTo: args.estDeliveryTo ? new Date(args.estDeliveryTo) : null,
        });
        const result = { id: order.id, ...tracking };
        if (args.notifyCustomer !== true) return result;
        return { ...result, notified: await notifyShipped({ ...order, ...tracking }, ctx.actor) };
      },
    ),
});

export const ordersTools = [listOrders, getOrder, updateOrderStatus, setOrderTracking];
