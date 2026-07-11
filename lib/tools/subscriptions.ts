import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/db";
import { defineTool } from "@/lib/tools/types";
import {
  cancelSubscription,
  subscriptionsFeatureEnabled,
} from "@/lib/subscriptions";

const listInput = z.object({
  status: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const cancelInput = z.object({
  id: z.string().min(1),
});

export const listSubscriptions = defineTool({
  name: "subscriptions.list",
  description:
    "List Stripe Billing subscriptions with status, customer, Stripe price, and current period end.",
  scope: "orders:read",
  input: listInput,
  skipAudit: true,
  examples: [
    {
      name: "List active subscriptions",
      body: { status: "active", limit: 10 },
    },
  ],
  handler: async (args) => {
    if (!subscriptionsFeatureEnabled()) {
      throw new Error("Subscriptions feature is disabled.");
    }

    return prisma.subscription.findMany({
      where: {
        ...(args.status ? { status: args.status } : {}),
        ...(args.userId ? { userId: args.userId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: args.limit,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  },
});

export const cancelSubscriptionTool = defineTool({
  name: "subscriptions.cancel",
  description:
    "Cancel a Stripe Billing subscription at period end and sync local subscription state.",
  scope: "orders:write",
  input: cancelInput,
  examples: [
    {
      name: "Cancel a subscription",
      body: { id: "sub-row-id" },
    },
  ],
  handler: async (args, ctx) => {
    return cancelSubscription({
      id: args.id,
      actor: ctx.actor,
    });
  },
});

export const subscriptionsTools = [listSubscriptions, cancelSubscriptionTool];
