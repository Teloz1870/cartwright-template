import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";

const ORDER_STATUS = ["pending", "paid", "shipped", "cancelled"] as const;

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

export const listOrders = defineTool({
  name: "orders.list",
  description:
    "List orders with optional filters (status, email, date range). Returns order summaries with items, totals, and status.",
  scope: "orders:read",
  input: listInput,
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
    "Changes the status of an order. Valid statuses: pending, paid, shipped, cancelled. Logs before state to audit.",
  scope: "orders:write",
  input: updateStatusInput,
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
