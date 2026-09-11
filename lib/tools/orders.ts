import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import {
  ORDER_STATUSES,
  assertTransition,
  isOrderStatus,
} from "@/lib/orders/status";

// Ordrestyring: AI-tool'et adresserer hele det kanoniske supersæt (12
// statuses) så det kan filtrere på + flytte til de nye admin-states
// (processing/delivered/completed). Transitions valideres af samme state
// machine som admin-UI'et (assertTransition nedenfor).
const ORDER_STATUS = ORDER_STATUSES;

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

const updateStatusInput = z.object({
  orderId: z.string().min(1),
  status: z.enum(ORDER_STATUS),
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
  productId: z.string(),
  productName: z.string(),
  unitPriceDkk: z.number().int(),
  quantity: z.number().int(),
  variantId: z.string().nullable(),
  variantSku: z.string().nullable(),
  variantAttributes: z
    .json()
    .nullable()
    .describe("Opaque JSON snapshot of the selected product variant attributes."),
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
  items: z.array(orderItemOutput),
});

const orderStatusOutput = z.strictObject({
  id: z.string(),
  status: z.enum(ORDER_STATUS),
});

export const listOrders = defineTool({
  name: "orders.list",
  description:
    "List orders with optional filters (status, email, date range). Returns order summaries with items, totals, and status.",
  scope: "orders:read",
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
    "Changes the status of an order. Valid statuses: pending_payment, pending, paid, processing, shipped, delivered, completed, cancelled, refunded, partial_refund, flagged_review, disputed. The move must be a legal transition from the order's current status (operator state machine). Logs before state to audit.",
  scope: "orders:write",
  input: updateStatusInput,
  output: orderStatusOutput,
  examples: [
    {
      name: "Mark order as shipped",
      body: {
        orderId: "cuid-12345",
        status: "shipped"
      }
    }
  ],
  handler: async (args, ctx) => {
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
          select: { status: true },
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
        }
        const updated = await prisma.order.update({
          where: { id: args.orderId },
          data: { status: args.status },
          select: { id: true, status: true },
        });
        return updated;
      },
    );
  },
});

export const ordersTools = [listOrders, getOrder, updateOrderStatus];
