import "server-only";

import { randomUUID } from "crypto";

import type Stripe from "stripe";

import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import type { AuditActor } from "@/lib/audit";

const ACTIVE_LIKE_STATUSES = ["active", "trialing", "past_due", "paused"];

type StripeSubscriptionForSync = Stripe.Subscription & {
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  pause_collection?: { behavior?: string | null } | null;
  customer?: string | { id: string } | null;
  items: Stripe.Subscription["items"] & {
    data: Array<
      Stripe.SubscriptionItem & {
        current_period_end?: number;
        price?: Stripe.Price | null;
      }
    >;
  };
};

export function subscriptionsFeatureEnabled(): boolean {
  return Boolean(
    brand.features.subscriptions &&
      (brand.ecommerceEnabled || brand.features.webshop),
  );
}

export function assertSubscriptionsEnabled(): void {
  if (!subscriptionsFeatureEnabled()) {
    throw new Error("Subscriptions feature is disabled.");
  }
}

function getCustomerId(subscription: StripeSubscriptionForSync): string | null {
  const customer = subscription.customer;
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function getPriceId(subscription: StripeSubscriptionForSync): string {
  return subscription.items.data[0]?.price?.id ?? "unknown";
}

function getCurrentPeriodEnd(subscription: StripeSubscriptionForSync): Date {
  const seconds =
    subscription.current_period_end ??
    subscription.items.data[0]?.current_period_end ??
    Math.floor(Date.now() / 1000);
  return new Date(seconds * 1000);
}

function getUserId(
  subscription: StripeSubscriptionForSync,
  fallbackUserId?: string | null,
): string | null {
  const metadataUserId =
    typeof subscription.metadata?.userId === "string"
      ? subscription.metadata.userId
      : null;
  return metadataUserId || fallbackUserId || null;
}

function getLocalStatus(subscription: StripeSubscriptionForSync): string {
  if (
    subscription.status === "canceled" ||
    subscription.status === "incomplete_expired"
  ) {
    return subscription.status;
  }
  return subscription.pause_collection ? "paused" : subscription.status;
}

export async function syncStripeSubscription(
  input: Stripe.Subscription,
  options: {
    fallbackUserId?: string | null;
    fallbackCustomerId?: string | null;
  } = {},
) {
  assertSubscriptionsEnabled();

  const subscription = input as StripeSubscriptionForSync;
  const existing = await prisma.subscription.findUnique({
    where: { stripeSubId: subscription.id },
    select: { id: true, userId: true },
  });

  const userId = existing?.userId ?? getUserId(subscription, options.fallbackUserId);
  if (!userId) {
    console.warn(
      `[subscriptions] Stripe subscription ${subscription.id} has no userId metadata; skipping local sync.`,
    );
    return null;
  }

  const stripeCustomerId =
    getCustomerId(subscription) ?? options.fallbackCustomerId ?? "unknown";
  const data = {
    stripeCustomerId,
    stripePriceId: getPriceId(subscription),
    status: getLocalStatus(subscription),
    currentPeriodEnd: getCurrentPeriodEnd(subscription),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    pauseCollectionBehavior: subscription.pause_collection?.behavior ?? null,
  };

  if (existing) {
    return prisma.subscription.update({
      where: { stripeSubId: subscription.id },
      data,
    });
  }

  return prisma.subscription.create({
    data: {
      userId,
      stripeSubId: subscription.id,
      ...data,
    },
  });
}

export async function syncStripeSubscriptionById(
  stripeSubId: string,
  options: { fallbackUserId?: string | null; fallbackCustomerId?: string | null } = {},
) {
  assertSubscriptionsEnabled();
  const stripe = await getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured.");

  const subscription = await stripe.subscriptions.retrieve(stripeSubId);
  return syncStripeSubscription(subscription, options);
}

function parsePriceId(value: unknown): string | null {
  const priceId = typeof value === "string" ? value.trim() : "";
  if (!priceId) return null;
  if (!priceId.startsWith("price_")) {
    throw new Error("Subscription priceId must be a Stripe Price ID.");
  }
  return priceId;
}

export function resolveSubscriptionPriceId(value?: unknown): string {
  const priceId =
    parsePriceId(value) ??
    parsePriceId(process.env.STRIPE_SUBSCRIPTION_PRICE_ID) ??
    parsePriceId(process.env.STRIPE_STARTER_PRICE_ID);
  if (!priceId) {
    throw new Error(
      "No subscription price configured. Set STRIPE_SUBSCRIPTION_PRICE_ID or submit priceId.",
    );
  }
  return priceId;
}

export async function createSubscriptionCheckoutSession(args: {
  userId: string;
  email: string;
  priceId: string;
  baseUrl: string;
}) {
  assertSubscriptionsEnabled();

  const existing = await prisma.subscription.findFirst({
    where: {
      userId: args.userId,
      status: { in: ACTIVE_LIKE_STATUSES },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    throw new Error("Customer already has an active subscription.");
  }

  const stripe = await getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured.");

  const previous = await prisma.subscription.findFirst({
    where: {
      userId: args.userId,
      stripeCustomerId: { not: "unknown" },
    },
    orderBy: { createdAt: "desc" },
    select: { stripeCustomerId: true },
  });

  const baseUrl = args.baseUrl.replace(/\/+$/, "");
  return stripe.checkout.sessions.create({
    mode: "subscription",
    ...(previous?.stripeCustomerId
      ? { customer: previous.stripeCustomerId }
      : { customer_email: args.email }),
    line_items: [{ price: args.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${baseUrl}/account/subscriptions?success=subscription_created`,
    cancel_url: `${baseUrl}/account/subscriptions?cancel=subscription_checkout`,
    metadata: {
      userId: args.userId,
      type: "subscription",
      priceId: args.priceId,
    },
    subscription_data: {
      metadata: {
        userId: args.userId,
        priceId: args.priceId,
      },
    },
  });
}

async function auditSubscriptionAction(args: {
  actor: AuditActor;
  tool: string;
  subscriptionId: string;
  stripeSubId: string;
  ok: boolean;
  requestId?: string;
}) {
  await prisma.auditLog
    .create({
      data: {
        actor: args.actor,
        tool: args.tool,
        argsJson: JSON.stringify({
          subscriptionId: args.subscriptionId,
          stripeSubId: args.stripeSubId,
        }),
        ok: args.ok,
        requestId: args.requestId ?? randomUUID(),
      },
    })
    .catch(() => {});
}

export async function cancelSubscription(args: {
  id: string;
  actor: AuditActor;
  userId?: string;
}) {
  assertSubscriptionsEnabled();
  const where = args.userId ? { id: args.id, userId: args.userId } : { id: args.id };
  const subscription = await prisma.subscription.findFirst({ where });
  if (!subscription) throw new Error("Subscription not found.");

  const stripe = await getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured.");

  const updated = await stripe.subscriptions.update(subscription.stripeSubId, {
    cancel_at_period_end: true,
  });
  const synced = await syncStripeSubscription(updated, {
    fallbackUserId: subscription.userId,
    fallbackCustomerId: subscription.stripeCustomerId,
  });

  await auditSubscriptionAction({
    actor: args.actor,
    tool: "subscriptions.cancel",
    subscriptionId: subscription.id,
    stripeSubId: subscription.stripeSubId,
    ok: true,
  });

  return synced;
}

export async function pauseSubscription(args: {
  id: string;
  actor: AuditActor;
  userId: string;
}) {
  assertSubscriptionsEnabled();
  const subscription = await prisma.subscription.findFirst({
    where: { id: args.id, userId: args.userId },
  });
  if (!subscription) throw new Error("Subscription not found.");

  const stripe = await getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured.");

  const updated = await stripe.subscriptions.update(subscription.stripeSubId, {
    pause_collection: { behavior: "void" },
  });
  const synced = await syncStripeSubscription(updated, {
    fallbackUserId: subscription.userId,
    fallbackCustomerId: subscription.stripeCustomerId,
  });

  await auditSubscriptionAction({
    actor: args.actor,
    tool: "subscriptions.pause",
    subscriptionId: subscription.id,
    stripeSubId: subscription.stripeSubId,
    ok: true,
  });

  return synced;
}

export async function resumeSubscription(args: {
  id: string;
  actor: AuditActor;
  userId: string;
}) {
  assertSubscriptionsEnabled();
  const subscription = await prisma.subscription.findFirst({
    where: { id: args.id, userId: args.userId },
  });
  if (!subscription) throw new Error("Subscription not found.");

  const stripe = await getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured.");

  const updated = await stripe.subscriptions.update(subscription.stripeSubId, {
    pause_collection: null,
  });
  const synced = await syncStripeSubscription(updated, {
    fallbackUserId: subscription.userId,
    fallbackCustomerId: subscription.stripeCustomerId,
  });

  await auditSubscriptionAction({
    actor: args.actor,
    tool: "subscriptions.resume",
    subscriptionId: subscription.id,
    stripeSubId: subscription.stripeSubId,
    ok: true,
  });

  return synced;
}
