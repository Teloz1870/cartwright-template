import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron/auth";

import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { mailer } from "@/lib/mailer";
import { notifyOwnerOfPaidOrder } from "@/lib/orders/notify-owner";
import { cancelUnpaidOrder } from "@/lib/orders/cancel-unpaid";
import { chargeMatchesOrder } from "@/lib/money";

/**
 * Reconcile-cron for Stripe pending_payment orders.
 *
 * **Hvorfor**: Webhook kan fejle (server-nede, network-issues, Stripe-retry-
 * budget brugt op). Hvis vi ikke reconcilerer, hænger orders i pending_payment
 * for evigt — stock decremented, kunde tror måske betalingen lykkes, men
 * vores DB ved det ikke.
 *
 * **Logic**: ved hver kørsel finder vi pending_payment-orders ÆLDRE end
 * 5 min med stripePaymentIntentId sat (højst 50 pr. kørsel). Vi henter aktuel
 * status fra Stripe API og opdaterer baseret på det.
 *
 * **Auth**: Vercel Cron tilføjer `Authorization: Bearer ${CRON_SECRET}`-
 * header; `verifyCronRequest` (lib/cron/auth.ts) afviser alt andet med 401.
 * Uden CRON_SECRET er ruten stadig åben (deprecated — se helperen).
 *
 * **Schedule**: én gang i døgnet, kl. 03:00 UTC (`0 3 * * *` i vercel.json).
 * En betaling webhooken missede kan altså vente op til et døgn på at blive
 * markeret paid; en shop der vil have det tættere, ændrer sin vercel.json.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 min — så vi ikke overlapper
const MAX_ORDERS_PER_RUN = 50; // beskytter mod runaway cron

export async function GET(request: NextRequest) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

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
        // Amount + currency validation — the webhook's own definition
        // (lib/money.ts expectedStripeCharge): the order's snapshotted rate and
        // presentment currency, so a multiCurrency order charged in EUR is not
        // flagged for differing from its base-currency total.
        if (!chargeMatchesOrder(intent, order)) {
          // Pinned to pending_payment like every other write here: an order an
          // operator cancelled (and restocked) since the query must stay
          // cancelled, not come back as flagged_review (RACE-MARKPAID).
          const flagged = await prisma.order.updateMany({
            where: { id: order.id, status: "pending_payment" },
            data: { status: "flagged_review" },
          });
          results.push({
            orderId: order.id,
            action: flagged.count > 0 ? "flagged_amount_mismatch" : "status_changed_not_flagged",
          });
          continue;
        }

        const paymentMethodType = intent.payment_method_types?.[0] ?? "card";
        // Conditional on the status we read: if the webhook marked the order
        // paid between our read and this write, it already sent the mails —
        // skip, so neither the receipt nor the owner mail goes out twice.
        const flipped = await prisma.order.updateMany({
          where: { id: order.id, status: "pending_payment" },
          data: {
            status: "paid",
            paymentMethod: `stripe_${paymentMethodType}`,
            paidAt: new Date(),
          },
        });
        if (flipped.count === 0) {
          results.push({ orderId: order.id, action: "already_paid_by_webhook" });
          continue;
        }

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
              // Match the charged amount on reconciliation receipts (presentment
              // currency at the order's snapshotted rate, not base / live anchors).
              currency: order.currency,
              fxRate: order.fxRate,
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

        // GAP1: owner mail (flag ownerOrderEmail, default off). The conditional
        // flip above makes it once per order; sent after the receipt; never throws.
        await notifyOwnerOfPaidOrder({
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
          currency: order.currency,
          fxRate: order.fxRate,
        });

        results.push({ orderId: order.id, action: "reconciled_paid" });
      } else if (intent.status === "canceled") {
        // Cancel + give the stock back, through the rule every cancel path
        // shares (lib/orders/cancel-unpaid.ts): the status write is
        // conditional on pending_payment and the restock (variant-aware) runs
        // only if it landed, in the same transaction — a second run, or a
        // cancel by the webhook or an operator in between, gives nothing back
        // twice.
        const restocked = await prisma.$transaction((tx) =>
          cancelUnpaidOrder(tx, order.id),
        );
        results.push({
          orderId: order.id,
          action: restocked ? "reconciled_cancelled_restocked" : "already_cancelled",
        });
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
