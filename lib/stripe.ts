import "server-only";

import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-encryption";

/**
 * Stripe-keys + client. DB-først via IntegrationSettings (krypteret med
 * AES-256-GCM via AUTH_SECRET KEK), .env-fallback for dev.
 *
 * Hvis ingen keys er sat: getStripeClient() returnerer null, og createOrder
 * falder tilbage til mock-payment. Det er den intentionelle Phase 2→3-
 * overgang — frontend bruger isStripeReady() til at vise rigtig payment-UI
 * eller TEST-BUTIK-banner.
 */
export type StripeKeys = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
};

const CACHE_TTL_MS = 30_000;
let cachedKeys: { value: StripeKeys | null; expiresAt: number } | null = null;

export async function getStripeKeys(): Promise<StripeKeys | null> {
  const now = Date.now();
  if (cachedKeys && cachedKeys.expiresAt > now) {
    return cachedKeys.value;
  }

  let secretKey: string | null = null;
  let publishableKey: string | null = null;
  let webhookSecret: string | null = null;

  try {
    const row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: {
        stripeSecretKey: true,
        stripePublishableKey: true,
        stripeWebhookSecret: true,
      },
    });
    secretKey = row?.stripeSecretKey ? decryptSecret(row.stripeSecretKey) : null;
    publishableKey = row?.stripePublishableKey
      ? decryptSecret(row.stripePublishableKey)
      : null;
    webhookSecret = row?.stripeWebhookSecret
      ? decryptSecret(row.stripeWebhookSecret)
      : null;
  } catch {
    // DB ikke tilgængelig — fall back til env
  }

  // .env fallback
  secretKey = secretKey ?? process.env.STRIPE_SECRET_KEY ?? null;
  publishableKey =
    publishableKey ?? process.env.STRIPE_PUBLISHABLE_KEY ?? null;
  webhookSecret = webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? null;

  const keys =
    secretKey && publishableKey && webhookSecret
      ? { secretKey, publishableKey, webhookSecret }
      : null;

  cachedKeys = { value: keys, expiresAt: now + CACHE_TTL_MS };
  return keys;
}

export function invalidateStripeKeysCache(): void {
  cachedKeys = null;
}

/**
 * Returnerer Stripe SDK client hvis konfigureret, ellers null. Cached client
 * pr. secretKey (samme TTL som keys). API-version pinned for predictable
 * behavior — opdater bevidst når Stripe-SDK opgraderes.
 */
let cachedClient: { key: string; client: Stripe } | null = null;

export async function getStripeClient(): Promise<Stripe | null> {
  const keys = await getStripeKeys();
  if (!keys) return null;

  if (cachedClient && cachedClient.key === keys.secretKey) {
    return cachedClient.client;
  }
  const client = new Stripe(keys.secretKey, {
    // API-version pinned for predictable behavior. Opdater bevidst når
    // Stripe-SDK opgraderes (release-notes har breaking changes-liste).
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
  cachedClient = { key: keys.secretKey, client };
  return client;
}

export async function isStripeReady(): Promise<boolean> {
  return (await getStripeKeys()) !== null;
}

/**
 * Opret en PaymentIntent for en eksisterende ordre. Stripe håndterer
 * Apple Pay, Google Pay, MobilePay og kort automatisk via
 * `automatic_payment_methods`. Idempotency-key på orderId så samtidig dobbelt-
 * submit ikke giver 2 PaymentIntents for samme ordre.
 */
export async function createPaymentIntent(args: {
  orderId: string;
  totalDkk: number; // i øre (smallest DKK-unit = 1/100 DKK)
  email: string;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
} | null> {
  const stripe = await getStripeClient();
  if (!stripe) return null;

  const intent = await stripe.paymentIntents.create(
    {
      amount: args.totalDkk,
      currency: "dkk",
      receipt_email: args.email,
      metadata: { orderId: args.orderId },
      automatic_payment_methods: { enabled: true },
    },
    { idempotencyKey: `order_${args.orderId}` },
  );

  if (!intent.client_secret) {
    throw new Error("Stripe returned PaymentIntent without client_secret");
  }

  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
  };
}
