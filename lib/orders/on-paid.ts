import "server-only";

import { prisma } from "@/lib/db";
import { mailer, type OrderEmailData } from "@/lib/mailer";
import {
  emitMarketingEvent,
  MARKETING_EVENTS,
} from "@/lib/marketing/automations";
import { notifyOwnerOfPaidOrder } from "@/lib/orders/notify-owner";

export type OnOrderPaidInput = {
  /** What both mails say. Each path builds its own lines; see `orderMailData`. */
  order: OrderEmailData;
  /**
   * `Order.confirmationEmailSentAt` as the path read it, null on a path that
   * created the order just now. Set ⇒ no receipt: a second guard behind the
   * path's own write, for an order back in a status awaiting payment after its
   * receipt went out.
   */
  receiptSentAt: Date | null;
  /** Emit the post-purchase marketing event? Today only the Stripe webhook does. */
  emitOrderPlaced: boolean;
  /** The path's own log line when the receipt or its stamp fails. */
  receiptFailureLog: string;
};

/**
 * The one door for what follows an order becoming paid (ORD0-a).
 *
 * Four paths make an order paid: the Stripe webhook, the reconcile cron,
 * mock-mode checkout and ACP completion. Each calls this after its own write
 * has won: the webhook's and the cron's conditional `updateMany`, the create
 * transaction of the other two (RACE-MARKPAID, lib/orders/status.ts). A path
 * that lost returns before it gets here and fires nothing, which is why a
 * repeated webhook sends no second receipt. This function holds no state of its
 * own and does not check again, so call it once per won write.
 *
 * It fires, in this order: the marketing event (not awaited), the receipt and
 * its stamp, the owner mail, so a slow owner mail never holds up the customer's.
 * It never throws: a failed mail must never fail a payment. Stock and the
 * discount use are not here, because both are taken when the order is created.
 *
 * An operator moving an order to `paid` (lib/orders/operator-status.ts) does not
 * come through here and fires nothing, as before.
 */
export async function onOrderPaid(input: OnOrderPaidInput): Promise<void> {
  const { order, receiptSentAt, emitOrderPlaced, receiptFailureLog } = input;

  // Fire-and-forget: a no-op without the flag, a Resend key or marketing
  // consent, and it never affects the payment.
  if (emitOrderPlaced) {
    void emitMarketingEvent(MARKETING_EVENTS.orderPlaced, order.email, {
      orderId: order.orderId,
      totalDkk: order.totalDkk,
      currency: order.currency,
      itemCount: order.items.length,
    });
  }

  // Sent only now, after the payment, so an unpaid order never gets a receipt.
  if (!receiptSentAt) {
    try {
      await mailer.sendOrderConfirmation(order);
      await prisma.order.update({
        where: { id: order.orderId },
        data: { confirmationEmailSentAt: new Date() },
      });
    } catch (mailErr) {
      // Non-fatal: the order is paid, and the receipt can be sent again later.
      console.error(receiptFailureLog, mailErr);
    }
  }

  // GAP1: the owner hears about it (runtime flag ownerOrderEmail, default off).
  await notifyOwnerOfPaidOrder(order);
}

/** The mail data of an order read back from the database with its OrderItem rows. */
export function orderMailData(order: {
  id: string;
  email: string;
  shippingName: string;
  items: { productName: string; quantity: number; unitPriceDkk: number }[];
  subtotalDkk: number;
  discountDkk: number;
  shippingDkk: number;
  totalDkk: number;
  currency: string;
  fxRate: number;
}): OrderEmailData {
  return {
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
    // The charged currency at the order's snapshotted rate, so the receipt
    // matches the charge even on a cold serverless start with no FX cache.
    currency: order.currency,
    fxRate: order.fxRate,
  };
}
