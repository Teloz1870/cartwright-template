import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { mailer } from "@/lib/mailer";

/**
 * Reconcile-cron for Stripe pending_payment orders.
 *
 * **Hvorfor**: Webhook kan fejle (server-nede, network-issues, Stripe-retry-
 * budget brugt op). Hvis vi ikke reconcilerer, hænger orders i pending_payment
 * for evigt — stock decremented, kunde tror måske betalingen lykkes, men
 * vores DB ved det ikke.
 *
 * **Logic**: hver 15. min finder vi orders ÆLDRE end 5 min med
 * stripePaymentIntentId sat. Vi henter aktuel status fra Stripe API og
 * opdaterer baseret på det.
 *
 * **Auth**: Vercel Cron tilføjer `Authorization: Bearer ${CRON_SECRET}`-
 * header. Reject hvis missing for at undgå at random klienter kalder den.
 *
 * **Schedule**: hver 15. min via vercel.json crons-config.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 min — så vi ikke overlapper
const MAX_ORDERS_PER_RUN = 50; // beskytter mod runaway cron

export async function GET(request: NextRequest) {
  // Vercel Cron auth (default: header `Authorization: Bearer CRON_SECRET`)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const stripe = await getStripeClient();
  if (!stripe) {
    // Stripe ikke konfigureret — ingenting at reconcile
    return NextResponse.json({ ok: true, reason: "stripe-not-configured" });
  }

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  const stale = await prisma.order.findMany({
    where: {
      status: "pending_payment",
      stripePaymentIntentId: { not: null },
      createdAt: { lte: cutoff },
    },
    take: MAX_ORDERS_PER_RUN,
    orderBy: { createdAt: "asc" },
    include: { items: true },
  });

  const results: Array<{ orderId: string; action: string }> = [];

  for (const order of stale) {
    if (!order.stripePaymentIntentId) continue;

    try {
      const intent = await stripe.paymentIntents.retrieve(
        order.stripePaymentIntentId,
      );

      if (intent.status === "succeeded") {
        // Amount-validation (samme som webhook)
        if (intent.amount !== order.totalDkk) {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: "flagged_review" },
          });
          results.push({ orderId: order.id, action: "flagged_amount_mismatch" });
          continue;
        }

        const paymentMethodType = intent.payment_method_types?.[0] ?? "card";
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "paid",
            paymentMethod: `stripe_${paymentMethodType}`,
            paidAt: new Date(),
          },
        });

        // Email — idempotent via confirmationEmailSentAt-check
        if (!order.confirmationEmailSentAt) {
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
            console.error(
              `[reconcile-cron] mail failed for ${order.id}:`,
              mailErr,
            );
          }
        }

        results.push({ orderId: order.id, action: "reconciled_paid" });
      } else if (intent.status === "canceled") {
        // Re-stock + cancel
        await prisma.$transaction(async (tx) => {
          for (const item of order.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          }
          await tx.order.update({
            where: { id: order.id },
            data: { status: "cancelled" },
          });
        });
        results.push({ orderId: order.id, action: "reconciled_cancelled_restocked" });
      } else if (
        intent.status === "requires_payment_method" ||
        intent.status === "requires_action"
      ) {
        // Kunde har ikke fuldført betalingen — efter X timer kan vi cancel'e.
        // For nu: bare log, lad kunden have flere chancer.
        results.push({
          orderId: order.id,
          action: `still_pending_${intent.status}`,
        });
      } else {
        results.push({
          orderId: order.id,
          action: `unknown_status_${intent.status}`,
        });
      }
    } catch (err) {
      console.error(
        `[reconcile-cron] error processing ${order.id}:`,
        err,
      );
      results.push({ orderId: order.id, action: "error" });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: stale.length,
    results,
  });
}
