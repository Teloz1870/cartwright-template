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
 *
 * Mock kræver at butikken beviseligt ingen nøgler har. Nøgler der findes men
 * ikke kan læses (roteret AUTH_SECRET, DB-fejl, kun nogle af de tre) giver
 * "unavailable", og createOrder nægter ordren: ellers bliver en live butik til
 * gratis checkout.
 */
export type StripeKeys = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
};

export type StripeMode = "stripe" | "none" | "unavailable";

const CACHE_TTL_MS = 30_000;
let cachedKeys: { value: StripeKeys | null; mode: StripeMode; expiresAt: number } | null = null;

async function loadStripeKeys(): Promise<{ value: StripeKeys | null; mode: StripeMode }> {
  const now = Date.now();
  if (cachedKeys && cachedKeys.expiresAt > now) {
    return { value: cachedKeys.value, mode: cachedKeys.mode };
  }

  let secretKey: string | null = null;
  let publishableKey: string | null = null;
  let webhookSecret: string | null = null;
  let dbUnreadable = false;
  let storedAny = false;

  try {
    const row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: {
        stripeSecretKey: true,
        stripePublishableKey: true,
        stripeWebhookSecret: true,
      },
    });
    storedAny = Boolean(
      row?.stripeSecretKey || row?.stripePublishableKey || row?.stripeWebhookSecret,
    );
    secretKey = row?.stripeSecretKey ? decryptSecret(row.stripeSecretKey) : null;
    publishableKey = row?.stripePublishableKey
      ? decryptSecret(row.stripePublishableKey)
      : null;
    webhookSecret = row?.stripeWebhookSecret
      ? decryptSecret(row.stripeWebhookSecret)
      : null;
  } catch {
    // DB ikke tilgængelig — fall back til env
    dbUnreadable = true;
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

  const anyKey = Boolean(storedAny || secretKey || publishableKey || webhookSecret);
  const mode: StripeMode = keys ? "stripe" : dbUnreadable || anyKey ? "unavailable" : "none";

  // A failure is not cached: the next request reads again.
  cachedKeys = mode === "unavailable" ? null : { value: keys, mode, expiresAt: now + CACHE_TTL_MS };
  return { value: keys, mode };
}

export async function getStripeKeys(): Promise<StripeKeys | null> {
  return (await loadStripeKeys()).value;
}

/** "none" is the only state that may fall back to mock payment. */
export async function getStripeMode(): Promise<StripeMode> {
  return (await loadStripeKeys()).mode;
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
    apiVersion: "2026-07-29.dahlia",
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
  /**
   * Beløb i `currency`s minor-units — ALLEREDE konverteret af kalderen
   * (lib/orders/create via convertMinor). Stripe opkræver præcis dette beløb
   * i denne valuta, så amount + currency SKAL matche. For base-currency-shops
   * er det blot base-totalen uændret.
   */
  amountMinor: number;
  email: string;
  /** ISO-4217 presentment currency (lowercased før Stripe-kaldet). */
  currency: string;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
} | null> {
  const stripe = await getStripeClient();
  if (!stripe) return null;

  const currency = args.currency.toLowerCase();

  const intent = await stripe.paymentIntents.create(
    {
      amount: args.amountMinor,
      currency,
      receipt_email: args.email,
      metadata: { orderId: args.orderId, currency },
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

/**
 * Ordrestyring: udsted en refund mod en eksisterende PaymentIntent. Admin-
 * initieret fra ordre-workspace. Vi STAMPER metadata.orderId på refunden så
 * `handleChargeRefunded` (charge.refunded-webhooken) kan resolve ordren —
 * det er webhooken, ikke denne funktion, der sætter Order.status/refundedAt
 * (single writer → idempotent partial-vs-full-logik bevares ét sted).
 *
 * amountOere undladt ⇒ fuld refund. idempotencyKey gør et dobbeltklik /
 * retry til en no-op (Stripe returnerer den eksisterende refund).
 *
 * Returnerer null hvis ingen Stripe-keys (mock-mode) — kalderen skal da
 * fejle pænt ("ordre uden Stripe-betaling — refundér manuelt").
 */
export async function createRefund(args: {
  orderId: string;
  paymentIntentId: string;
  amountOere?: number;
  reason?: string;
}): Promise<{ refundId: string; amount: number; status: string | null } | null> {
  const stripe = await getStripeClient();
  if (!stripe) return null;

  const refund = await stripe.refunds.create(
    {
      payment_intent: args.paymentIntentId,
      ...(args.amountOere != null ? { amount: args.amountOere } : {}),
      metadata: { orderId: args.orderId, ...(args.reason ? { reason: args.reason } : {}) },
    },
    {
      idempotencyKey: `refund_${args.orderId}_${args.amountOere ?? "full"}`,
    },
  );

  return { refundId: refund.id, amount: refund.amount, status: refund.status };
}
