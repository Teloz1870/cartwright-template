import "server-only";

import { prisma } from "@/lib/db";
import { mailer } from "@/lib/mailer";
import { AcpError } from "@/lib/acp";

/**
 * Hul C — opret en Order fra en ACP-checkout-session (IKKE fra cart).
 *
 * `createOrder()` i lib/orders/create.ts læser den cookie-bundne Cart og kan
 * derfor ikke genbruges for ACP (server-til-server, ingen cookie). Denne
 * funktion er KILDE = AcpCheckoutSession-rækken: line items, buyer + shipping
 * og de allerede-beregnede totaler (øre). Den er bevidst Stripe-fri — selve
 * SPT-opkrævningen sker i lib/acp/complete.ts FØR denne kaldes, og
 * paymentIntentId rækkes ind.
 *
 * Genbruger samme atomiske anti-oversell-stock-decrement + bekræftelses-mail
 * som createOrder, men med session-data som kilde. Sætter
 * Order.channel = "acp", Order.acpSessionId, Order.status = "paid" (SPT er
 * allerede confirmed) og markerer sessionen completed i samme transaktion.
 */

type AcpLineSnapshot = {
  id: string;
  productId: string;
  variantId: string | null;
  slug: string;
  sku: string | null;
  name: string;
  quantity: number;
  unitPriceDkk: number;
};

/** Parser lineItemsJson-snapshottet skrevet af createSession (lib/acp/index.ts). */
function parseLines(raw: string): AcpLineSnapshot[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is AcpLineSnapshot =>
        l &&
        typeof l.productId === "string" &&
        typeof l.name === "string" &&
        typeof l.quantity === "number" &&
        typeof l.unitPriceDkk === "number",
    );
  } catch {
    return [];
  }
}

/**
 * Opret ordren + markér sessionen completed atomisk. Returnerer orderId.
 *
 * Idempotent: hvis sessionen allerede har en orderId (eller en samtidig
 * /complete vandt status-flippet), returneres den eksisterende orderId UDEN at
 * oprette en dublet — så kalderen (complete.ts) ikke fejl-refunderer den
 * delte, Stripe-idempotente PaymentIntent.
 */
export async function createOrderFromAcpSession(args: {
  sessionId: string;
  paymentIntentId: string | null;
  paymentMethod?: string;
}): Promise<string> {
  const row = await prisma.acpCheckoutSession.findUnique({
    where: { id: args.sessionId },
  });
  if (!row) {
    throw new AcpError("acp_session_not_found", "ACP checkout session not found.", 404);
  }
  // Allerede completed → returnér den eksisterende ordre (idempotent).
  if (row.orderId) return row.orderId;

  if (!row.buyerEmail) {
    throw new AcpError(
      "acp_buyer_email_required",
      "A buyer email is required to complete checkout.",
      422,
    );
  }
  if (
    !row.shippingName ||
    !row.shippingAddress ||
    !row.shippingZip ||
    !row.shippingCity
  ) {
    throw new AcpError(
      "acp_fulfillment_address_required",
      "A complete fulfillment address is required before completion.",
      422,
    );
  }

  const lines = parseLines(row.lineItemsJson);
  if (lines.length === 0) {
    throw new AcpError("acp_session_empty", "ACP session has no line items.", 422);
  }

  let orderId: string;
  try {
    orderId = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          status: "paid", // SPT er allerede confirmed når vi når hertil
          paymentMethod: args.paymentMethod ?? "acp_spt",
          paidAt: new Date(),
          stripePaymentIntentId: args.paymentIntentId,
          email: row.buyerEmail!,
          shippingName: row.shippingName!,
          shippingAddress: row.shippingAddress!,
          shippingZip: row.shippingZip!,
          shippingCity: row.shippingCity!,
          phoneNumber: row.buyerPhone,
          subtotalDkk: row.subtotalDkk,
          shippingDkk: row.shippingDkk,
          discountDkk: row.discountDkk,
          totalDkk: row.totalDkk,
          // ACP-sessioner oprettes i base-currency (lib/acp/index.ts), så
          // presentment == base: fxRate 1. Multi-currency-ACP ville her bruge
          // convertMinor + en snapshottet rate (jf. lib/orders/create.ts).
          currency: row.currency.toUpperCase(),
          fxRate: 1,
          discountCode: row.discountCode,
          channel: "acp",
          acpSessionId: row.id,
          isAiGenerated: true,
          aiAgentSource: "acp",
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              productName: l.name,
              unitPriceDkk: l.unitPriceDkk,
              quantity: l.quantity,
              variantId: l.variantId,
              variantSku: l.sku,
            })),
          },
        },
      });

      // Atomisk anti-oversell-decrement (samme conditional-WHERE som
      // createOrder): decrement sker KUN hvis stock >= quantity. Ellers
      // throw → rollback af hele $transaction.
      for (const l of lines) {
        if (l.variantId) {
          const r = await tx.productVariant.updateMany({
            where: { id: l.variantId, stock: { gte: l.quantity } },
            data: { stock: { decrement: l.quantity } },
          });
          if (r.count === 0) throw new Error(`OUT_OF_STOCK:${l.name}`);
        } else {
          const r = await tx.product.updateMany({
            where: { id: l.productId, stock: { gte: l.quantity } },
            data: { stock: { decrement: l.quantity } },
          });
          if (r.count === 0) throw new Error(`OUT_OF_STOCK:${l.name}`);
        }
      }

      if (row.discountCode) {
        await tx.discountCode.updateMany({
          where: { code: row.discountCode },
          data: { usageCount: { increment: 1 } },
        });
      }

      // Claim sessionen atomisk: flip KUN ready_for_payment → completed. To
      // samtidige /complete-kald kan ikke begge vinde → højst én Order pr.
      // session. Taberen ruller sin egen (endnu ikke committede) ordre tilbage.
      const claim = await tx.acpCheckoutSession.updateMany({
        where: { id: row.id, status: "ready_for_payment", orderId: null },
        data: { status: "completed", orderId: order.id },
      });
      if (claim.count === 0) throw new Error("ACP_ALREADY_COMPLETED");

      return order.id;
    });
  } catch (err) {
    // Tabte status-flip-racet: en samtidig /complete oprettede den rigtige
    // ordre mod den delte (Stripe-idempotente) PaymentIntent. Returnér dens
    // orderId frem for at fejle/refundere.
    if (err instanceof Error && err.message === "ACP_ALREADY_COMPLETED") {
      const fresh = await prisma.acpCheckoutSession.findUnique({
        where: { id: args.sessionId },
        select: { orderId: true },
      });
      if (fresh?.orderId) return fresh.orderId;
    }
    throw err; // OUT_OF_STOCK m.fl. bobler op til complete.ts (→ refund)
  }

  // Bekræftelses-mail post-commit (spejler createOrder mock-mode).
  // confirmationEmailSentAt-guarden gør retry til en no-op.
  try {
    await mailer.sendOrderConfirmation({
      orderId,
      email: row.buyerEmail,
      shippingName: row.shippingName,
      items: lines.map((l) => ({
        productName: l.name,
        quantity: l.quantity,
        unitPriceDkk: l.unitPriceDkk,
      })),
      subtotalDkk: row.subtotalDkk,
      discountDkk: row.discountDkk,
      shippingDkk: row.shippingDkk,
      totalDkk: row.totalDkk,
      currency: row.currency.toUpperCase(),
      fxRate: 1,
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { confirmationEmailSentAt: new Date() },
    });
  } catch (mailErr) {
    console.error("[acp] order confirmation email failed", mailErr);
  }

  return orderId;
}
