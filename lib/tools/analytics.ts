import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { defineTool } from "@/lib/tools/types";

const summaryInput = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  lowStockThreshold: z.number().int().min(0).max(100).default(3),
  topProductsLimit: z.number().int().min(1).max(20).default(5),
});

const analyticsSummaryOutput = z.strictObject({
  period: z.strictObject({
    from: z.iso.datetime().nullable(),
    to: z.iso.datetime().nullable(),
  }),
  orders: z.strictObject({
    count: z.number().int().min(0),
    revenueOere: z.number().int(),
    discountsGivenOere: z.number().int(),
    shippingCollectedOere: z.number().int(),
  }),
  catalog: z.strictObject({
    totalProducts: z.number().int().min(0),
    lowStock: z.array(
      z.strictObject({
        slug: z.string(),
        name: z.string(),
        brand: z.string().nullable(),
        stock: z.number().int(),
      }),
    ),
    lowStockCount: z.number().int().min(0),
  }),
  customers: z.strictObject({
    count: z.number().int().min(0),
  }),
  recentOrders: z.array(
    z.strictObject({
      id: z.string(),
      email: z.string(),
      status: z.string(),
      totalDkk: z.number().int(),
      createdAt: z.iso.datetime(),
    }),
  ),
  topProducts: z.array(
    z.strictObject({
      productId: z.string(),
      productName: z.string(),
      totalSold: z.number().int().min(0),
    }),
  ),
});

export const analyticsSummary = defineTool({
  name: "analytics.summary",
  description:
    "Realtime ops summary: order count, revenue, product count, low stock, customer count, top-selling products, and the latest 5 orders. Optional date range.",
  scope: "analytics:read",
  input: summaryInput,
  output: analyticsSummaryOutput,
  skipAudit: true,
  handler: async (args) => {
    const dateFilter: Record<string, unknown> = {};
    if (args.fromDate || args.toDate) {
      dateFilter.createdAt = {
        ...(args.fromDate ? { gte: new Date(args.fromDate) } : {}),
        ...(args.toDate ? { lte: new Date(args.toDate) } : {}),
      };
    }

    const [
      orderCount,
      revenue,
      productCount,
      lowStockProducts,
      customerCount,
      recentOrders,
      topItems,
    ] = await Promise.all([
      prisma.order.count({ where: dateFilter }),
      prisma.order.aggregate({
        _sum: { totalDkk: true, discountDkk: true, shippingDkk: true },
        where: { ...dateFilter, status: { not: "cancelled" } },
      }),
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.product.findMany({
        where: { stock: { lte: args.lowStockThreshold }, deletedAt: null },
        orderBy: { stock: "asc" },
        select: { slug: true, name: true, brand: true, stock: true },
        take: 20,
      }),
      prisma.user.count({ where: { role: "customer" } }),
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          email: true,
          status: true,
          totalDkk: true,
          createdAt: true,
        },
      }),
      // Top-sælgere via OrderItem grouped by productId
      prisma.orderItem.groupBy({
        by: ["productId", "productName"],
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: args.topProductsLimit,
      }),
    ]);

    return {
      period: {
        from: args.fromDate ?? null,
        to: args.toDate ?? null,
      },
      orders: {
        count: orderCount,
        revenueOere: revenue._sum.totalDkk ?? 0,
        discountsGivenOere: revenue._sum.discountDkk ?? 0,
        shippingCollectedOere: revenue._sum.shippingDkk ?? 0,
      },
      catalog: {
        totalProducts: productCount,
        lowStock: lowStockProducts,
        lowStockCount: lowStockProducts.length,
      },
      customers: {
        count: customerCount,
      },
      recentOrders,
      topProducts: topItems.map((t) => ({
        productId: t.productId,
        productName: t.productName,
        totalSold: t._sum.quantity ?? 0,
      })),
    };
  },
});

export const analyticsTools = [analyticsSummary];
