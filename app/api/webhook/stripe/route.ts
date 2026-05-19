import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/lib/db";
import { getStripeClient, getStripeKeys } from "@/lib/stripe";
import { mailer } from "@/lib/mailer";

/**
 * Stripe webhook handler.
 *
 * **Sikkerhed**: Hver request signature-valideres via
 * `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`. Uden valid
 * signatur returneres 400 — så en angriber kan ikke fake "payment succeeded".
 *
 * **Idempotency**: Stripe leverer events MINDST én gang, ofte 2-3 gange.
 * Vi inserterer event.id i `ProcessedWebhookEvent` med unique-PK; duplicate
 * insert fanges + returnerer 200 OK uden sideeffekt. Det fjerner dobbelt-
 * decrement af stock, dobbelt-confirmation-emails osv.
 *
 * **Body**: Next.js 16 App Router læser `await request.text()` for raw body
 * (KRITISK for signature-validation — JSON.parse ødelægger signature).
 *
 * Bemærk: `runtime = "nodejs"` (signature-check kræver Node-crypto).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const stripe = await getStripeClient();
  const keys = await getStripeKeys();

  if (!stripe || !keys) {
    // Stripe ikke konfigureret — afvis pænt så fake-traffic ikke spammer
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 },
    );
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, keys.webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature-verify failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 },
    );
  }

  // Idempotency: insert event.id med ON CONFLICT DO NOTHING. Hvis vi
  // allerede har behandlet event (Stripe retry), bail med 200 OK.
  try {
    await prisma.processedWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch (err) {
    // Prisma kaster P2002 (unique constraint) hvis allerede inserted
    const isUnique =
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002";
    if (isUnique) {
      return NextResponse.json({ received: true, idempotent: true });
    }
    console.error("[stripe-webhook] DB insert failed:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // Handle relevant event-types. Vi loud-fail på unknown types med 200 OK
  // (Stripe forventer 2xx for events vi modtager — andet udløser retry).
  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.canceled":
        await handlePaymentCanceled(event.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      case "charge.dispute.created":
        await handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      default:
        // Andre event-types accepteres men ignoreres
        break;
    }
  } catch (err) {
    console.error(
      `[stripe-webhook] handler for ${event.type} failed:`,
      err,
    );
    // Phase 4: send til Sentry så vi får alert ved webhook-fejl. Tag med
    // event-type + id (men ikke fuld payload — kan indeholde PII).
    Sentry.captureException(err, {
      tags: { source: "stripe-webhook", eventType: event.type },
      extra: { eventId: event.id },
    });
    // Returnerer 500 så Stripe retry'er. ProcessedWebhookEvent er allerede
    // inserted så efter manual fix sletter vi rækken for at få retry.
    return NextResponse.json(
      { error: "Handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

async function handlePaymentSucceeded(intent: Stripe.PaymentIntent) {
  const orderId = intent.metadata?.orderId;
  if (!orderId) {
    console.warn(
      `[stripe-webhook] payment_intent.succeeded uden orderId-metadata: ${intent.id}`,
    );
    return;
  }

  // Find order. Hvis allerede paid (race), idempotent skip.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) {
    console.warn(`[stripe-webhook] order ${orderId} not found`);
    return;
  }
  if (order.status === "paid") {
    return; // allerede behandlet
  }

  // KRITISK SECURITY-CHECK (Phase 4 audit-fix): verificer at det betalte
  // beløb faktisk matcher ordrens total. Uden denne kan en angriber tampere
  // med metadata.orderId og betale 1kr for en 1000kr-ordre. Stripe sender
  // intent.amount i smallest currency unit (øre for DKK) — samme som vores
  // Order.totalDkk-felt (lagret som øre). 1:1 sammenligning.
  if (intent.amount !== order.totalDkk) {
    console.error(
      `[stripe-webhook] AMOUNT MISMATCH for order ${orderId}: ` +
        `intent.amount=${intent.amount} (${intent.currency}) vs ` +
        `order.totalDkk=${order.totalDkk} — flagging for manual review`,
    );
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "flagged_review" },
    });
    return; // Ikke marker som paid; ikke send kvittering
  }

  // Detect payment-method type fra PaymentIntent
  const paymentMethodType =
    intent.payment_method_types?.[0] ?? "card";
  const paymentMethod = `stripe_${paymentMethodType}`;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "paid",
      paymentMethod,
      paidAt: new Date(),
    },
  });

  // Send order-confirmation email — først NU (efter payment succeeded), ikke
  // ved createOrder. Hindrer kvitteringer for ikke-betalte ordrer.
  //
  // Phase 4 fix: confirmationEmailSentAt-guard. Selv om ProcessedWebhookEvent
  // sikrer idempotency på event-niveau, kan Stripe i sjældne edge-cases
  // sende SAMME success-event med ny event.id (fx ved manuel re-trigger fra
  // Stripe-dashboard). Guarden sikrer kun-én-email pr. ordre.
  if (order.confirmationEmailSentAt) {
    return; // allerede sendt
  }
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
    await prisma.order.update({
      where: { id: order.id },
      data: { confirmationEmailSentAt: new Date() },
    });
  } catch (mailErr) {
    // Mail-fejl er non-fatal — ordren er betalt, kvittering kan resendes senere
    console.error(
      `[stripe-webhook] kunne ikke sende kvittering for ${order.id}:`,
      mailErr,
    );
  }
}

async function handlePaymentFailed(intent: Stripe.PaymentIntent) {
  const orderId = intent.metadata?.orderId;
  if (!orderId) return;

  // Stripe sender payment_failed når kort afvises. Vi sætter ordren til
  // pending igen (giver kunden mulighed for at prøve med andet kort).
  // Order forbliver i pending_payment-status — frontend kan tilbyde retry.
  // (Vi ændrer ikke status så user kan retry via samme PaymentIntent.)
  const reason = intent.last_payment_error?.message ?? "ukendt";
  console.warn(
    `[stripe-webhook] payment_failed for order ${orderId}: ${reason}`,
  );
}

async function handlePaymentCanceled(intent: Stripe.PaymentIntent) {
  const orderId = intent.metadata?.orderId;
  if (!orderId) return;

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "cancelled" },
  }).catch((err) => {
    console.error(`[stripe-webhook] kunne ikke cancel order ${orderId}:`, err);
  });
}

/**
 * Phase 4: refund-handler. Stripe sender charge.refunded når admin refunder
 * via Stripe Dashboard ELLER via API. amount_refunded < amount = partial refund.
 * Vi sætter status til "refunded" / "partial_refund" + timestamps. Admin kan
 * herefter manuelt restocke via /admin/orders (separat tool — Phase 5).
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const orderId = charge.metadata?.orderId;
  if (!orderId) {
    // Refund kan komme via PaymentIntent's charge — try to find via PI metadata
    console.warn(
      `[stripe-webhook] charge.refunded uden direct orderId — payment_intent: ${charge.payment_intent}`,
    );
    return;
  }

  const isPartial =
    charge.amount_refunded > 0 && charge.amount_refunded < charge.amount;
  const newStatus = isPartial ? "partial_refund" : "refunded";

  await prisma.order
    .update({
      where: { id: orderId },
      data: {
        status: newStatus,
        refundedAt: new Date(),
      },
    })
    .catch((err) => {
      console.error(`[stripe-webhook] kunne ikke refund order ${orderId}:`, err);
    });

  // Audit-log
  await prisma.auditLog
    .create({
      data: {
        actor: "stripe-webhook:system",
        tool: "orders.refund",
        argsJson: JSON.stringify({
          orderId,
          amount: charge.amount,
          amount_refunded: charge.amount_refunded,
          partial: isPartial,
        }),
        ok: true,
        requestId: charge.id,
      },
    })
    .catch(() => {});
}

/**
 * Phase 4: dispute-handler. Stripe sender charge.dispute.created når kunden
 * bestrider en betaling via deres bank. Vi flagger ordren + audit-logger så
 * admin kan reagere indenfor Stripe's evidence-submission-frist (typisk 7 dage).
 */
async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) {
    console.warn(`[stripe-webhook] dispute.created uden charge: ${dispute.id}`);
    return;
  }

  // Find order via charge → payment_intent → order.stripePaymentIntentId
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;

  if (!paymentIntentId) {
    console.warn(`[stripe-webhook] dispute.created uden payment_intent: ${dispute.id}`);
    return;
  }

  const order = await prisma.order.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  });

  if (!order) {
    console.warn(
      `[stripe-webhook] dispute for ukendt PI ${paymentIntentId}: ${dispute.id}`,
    );
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "disputed",
      disputedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: "stripe-webhook:system",
      tool: "orders.dispute",
      argsJson: JSON.stringify({
        orderId: order.id,
        disputeId: dispute.id,
        reason: dispute.reason,
        amount: dispute.amount,
        // TODO Phase 5: admin-notification (email/Slack) når dispute-evidence
        // skal indsendes (frist typisk 7 dage fra Stripe-dashboard).
      }),
      ok: true,
      requestId: dispute.id,
    },
  });
}
