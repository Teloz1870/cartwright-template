import "server-only";

import { getCart } from "@/lib/cart";
import { prisma } from "@/lib/db";
import { validateDiscountCode } from "@/lib/discount";
import type { DiscountCodeRecord } from "@/lib/discount";
import { mailer } from "@/lib/mailer";
import { calcPriceBreakdown } from "@/lib/pricing";
import type { DiscountInput } from "@/lib/pricing";
import {
  createPaymentIntent,
  getStripeKeys,
  isStripeReady,
} from "@/lib/stripe";

/**
 * Task B: render variant-attributes som "2m × 3m, grå" til e-mail/kvitteringer.
 * Værdier joines med komma; ren JSON-fallback hvis ikke et flat objekt.
 */
function formatVariantAttributes(attrs: unknown): string {
  if (!attrs || typeof attrs !== "object") return "variant";
  const values = Object.values(attrs as Record<string, unknown>)
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .map(String);
  return values.length ? values.join(" · ") : "variant";
}

export type CreateOrderInput = {
  email: string;
  shippingName: string;
  shippingAddress: string;
  shippingZip: string;
  shippingCity: string;
  // Phase 4: optional telefonnummer for fremtidig mobil-lookup. Normaliseres
  // i tool-handleren før den når createOrder.
  phoneNumber?: string | null;
  discountCode?: string | null;
};

/**
 * createOrder har 2 modes baseret på Stripe-keys:
 *  - **Mock** (Phase 2 fallback): Order opretrettes med status="paid"
 *    øjeblikkeligt, email sendes, paymentMode="mock"
 *  - **Stripe** (Phase 3, når 3 keys er sat): Order opretrettes med
 *    status="pending_payment", PaymentIntent oprettes, clientSecret
 *    returneres så frontend kan rendere Stripe Payment Element. Order
 *    sættes til "paid" af webhook efter payment_intent.succeeded.
 */
export type CreateOrderResult =
  | {
      ok: true;
      orderId: string;
      totalDkk: number;
      paymentMode: "mock";
    }
  | {
      ok: true;
      orderId: string;
      totalDkk: number;
      paymentMode: "stripe";
      paymentIntentClientSecret: string;
      publishableKey: string;
    }
  | {
      ok: false;
      error: string;
      code:
        | "VALIDATION"
        | "EMPTY_CART"
        | "OUT_OF_STOCK"
        | "INVALID_DISCOUNT"
        | "PAYMENT_INIT_FAILED"
        | "INTERNAL";
    };

export async function createOrder(
  input: CreateOrderInput,
  ctx?: { actor?: string },
): Promise<CreateOrderResult> {
  try {
    const cart = await getCart();
    if (!cart || cart.items.length === 0) {
      return { ok: false, error: "Kurven er tom", code: "EMPTY_CART" };
    }

    // Task B: stock-check er variant-aware. Hvis cart-item har variant,
    // brug variant.stock; ellers product.stock (eksisterende adfærd).
    for (const item of cart.items) {
      const availableStock = item.variant?.stock ?? item.product.stock;
      if (item.quantity > availableStock) {
        return {
          ok: false,
          error: `${item.product.name} er ikke på lager`,
          code: "OUT_OF_STOCK",
        };
      }
    }

    let discountInput: DiscountInput = null;
    let discountRecord: { id: string } | null = null;
    const trimmedCode = input.discountCode?.trim().toUpperCase();

    if (trimmedCode) {
      const dbRecord = await prisma.discountCode.findUnique({
        where: { code: trimmedCode },
      });
      const validation = validateDiscountCode(
        dbRecord as DiscountCodeRecord | null,
        new Date(),
      );
      if (!validation.ok) {
        return {
          ok: false,
          error: validation.reason,
          code: "INVALID_DISCOUNT",
        };
      }
      discountInput = { type: validation.type, value: validation.value };
      discountRecord = dbRecord;
    }

    // Task B: pris-beregning bruger variant-pris hvis sat, ellers produkt-pris.
    const lines = cart.items.map((i) => ({
      unitPriceDkk: i.variant?.priceDkk ?? i.product.priceDkk,
      quantity: i.quantity,
    }));
    const { subtotalDkk, discountDkk, shippingDkk, totalDkk } =
      calcPriceBreakdown(lines, discountInput);

    // Phase 3: Stripe-mode hvis 3 keys er sat, ellers fall back til mock.
    // Mode bestemmer initial status:
    //  - mock → status="paid" øjeblikkeligt (Phase 2-adfærd, ingen Stripe)
    //  - stripe → status="pending_payment", webhook opdaterer til "paid"
    const stripeReady = await isStripeReady();
    const paymentMode: "mock" | "stripe" = stripeReady ? "stripe" : "mock";
    const initialStatus = paymentMode === "stripe" ? "pending_payment" : "paid";
    const initialPaymentMethod = paymentMode === "mock" ? "mock" : null;
    const initialPaidAt = paymentMode === "mock" ? new Date() : null;

    const userMatch = ctx?.actor?.match(/^user:(.+)$/);
    const userId = userMatch?.[1] ?? null;

    const orderId = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          status: initialStatus,
          paymentMethod: initialPaymentMethod,
          paidAt: initialPaidAt,
          email: input.email,
          shippingName: input.shippingName,
          shippingAddress: input.shippingAddress,
          shippingZip: input.shippingZip,
          shippingCity: input.shippingCity,
          phoneNumber: input.phoneNumber ?? null,
          subtotalDkk,
          shippingDkk,
          discountDkk,
          totalDkk,
          discountCode: trimmedCode ?? null,
          items: {
            // Task B: snapshot variant-data så ordrer er læselige selvom
            // variant slettes senere. variantSku + variantAttributes er
            // frosne kopier (ikke FK-references).
            create: cart.items.map((i) => ({
              productId: i.product.id,
              productName: i.product.name,
              unitPriceDkk: i.variant?.priceDkk ?? i.product.priceDkk,
              quantity: i.quantity,
              variantId: i.variantId,
              variantSku: i.variant?.sku ?? null,
              variantAttributes: i.variant?.attributes ?? undefined,
            })),
          },
        },
      });

      // Phase 4 atomic stock-decrement (anti-oversell): conditional WHERE
      // sikrer at decrement KUN sker hvis stock >= quantity. Hvis 3 kunder
      // race på sidste vare, fejler 2 af dem her → throw trigger rollback
      // af hele $transaction. Uden conditional kunne stock blive negativ.
      //
      // Task B: hvis cart-item har variant, decrement variant-stock; ellers
      // product-stock (eksisterende adfærd for non-variant produkter).
      for (const i of cart.items) {
        if (i.variantId) {
          const result = await tx.productVariant.updateMany({
            where: { id: i.variantId, stock: { gte: i.quantity } },
            data: { stock: { decrement: i.quantity } },
          });
          if (result.count === 0) {
            throw new Error(`OUT_OF_STOCK:${i.product.name}`);
          }
        } else {
          const result = await tx.product.updateMany({
            where: { id: i.product.id, stock: { gte: i.quantity } },
            data: { stock: { decrement: i.quantity } },
          });
          if (result.count === 0) {
            throw new Error(`OUT_OF_STOCK:${i.product.name}`);
          }
        }
      }

      if (discountRecord) {
        await tx.discountCode.update({
          where: { id: discountRecord.id },
          data: { usageCount: { increment: 1 } },
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      // Phase 2: hvis kunde er logget ind, gem shipping på User-profil
      // så user.get_last_shipping kan returnere den ved næste besøg.
      // Sker uanset rememberAddress — for loggede ind brugere er det
      // altid relevant (de har eksplicit oprettet konto = consent).
      if (userId) {
        await tx.user.update({
          where: { id: userId },
          data: {
            shippingName: input.shippingName,
            shippingAddress: input.shippingAddress,
            shippingZip: input.shippingZip,
            shippingCity: input.shippingCity,
            // Phase 4: gem phoneNumber hvis kunden har angivet det, så
            // næste-ordre lookup-by-phone virker.
            ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
          },
        });
      }

      return order.id;
    });

    // Stripe-mode: opret PaymentIntent + gem ID på order. Mail sendes
    // IKKE her — webhook sender den efter payment_intent.succeeded så
    // kunden ikke får kvittering for ikke-betalte ordrer.
    if (paymentMode === "stripe") {
      try {
        const intent = await createPaymentIntent({
          orderId,
          totalDkk,
          email: input.email,
        });
        if (!intent) {
          throw new Error("Stripe keys missing efter isStripeReady()=true");
        }
        const keys = await getStripeKeys();
        if (!keys) {
          throw new Error("Stripe keys missing");
        }
        await prisma.order.update({
          where: { id: orderId },
          data: { stripePaymentIntentId: intent.paymentIntentId },
        });
        return {
          ok: true,
          orderId,
          totalDkk,
          paymentMode: "stripe" as const,
          paymentIntentClientSecret: intent.clientSecret,
          publishableKey: keys.publishableKey,
        };
      } catch (stripeErr) {
        console.error("[createOrder] Stripe-init failed:", stripeErr);
        // Phase 4 fix: rollback stock-decrement + cancel ordre. Uden dette
        // mister vi stock til en ordre der aldrig kunne betales.
        await restockOrder(orderId).catch((restockErr) => {
          console.error("[createOrder] rollback-restock failed:", restockErr);
        });
        return {
          ok: false,
          error: "Kunne ikke initialisere betaling. Prøv igen om lidt.",
          code: "PAYMENT_INIT_FAILED",
        };
      }
    }

    // Mock-mode: send kvittering nu (ordren er allerede "paid").
    // Phase 4: confirmationEmailSentAt-guard så manuel re-send (via cron eller
    // admin-action) ikke dobbeltsender. Mock-mode er kun-éngangs alligevel,
    // men vi sætter feltet for konsistens med webhook-flow.
    try {
      await mailer.sendOrderConfirmation({
        orderId,
        email: input.email,
        shippingName: input.shippingName,
        // Task B: variant-navn appendes til product-name i kvittering så kunden
        // kan se hvilken variant de bestilte. Pris er variant-pris hvis sat.
        items: cart.items.map((i) => ({
          productName: i.variant
            ? `${i.product.name} (${formatVariantAttributes(i.variant.attributes)})`
            : i.product.name,
          quantity: i.quantity,
          unitPriceDkk: i.variant?.priceDkk ?? i.product.priceDkk,
        })),
        subtotalDkk,
        discountDkk,
        shippingDkk,
        totalDkk,
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { confirmationEmailSentAt: new Date() },
      });
    } catch (mailErr) {
      console.error("[createOrder] kunne ikke sende ordrebekræftelse", mailErr);
    }

    return { ok: true, orderId, totalDkk, paymentMode: "mock" as const };
  } catch (err) {
    // Phase 4: detect OUT_OF_STOCK fra atomic-decrement race-loss
    if (err instanceof Error && err.message.startsWith("OUT_OF_STOCK:")) {
      const productName = err.message.slice("OUT_OF_STOCK:".length);
      return {
        ok: false,
        error: `${productName} blev udsolgt mens ordren blev oprettet — prøv igen eller vælg en anden vare.`,
        code: "OUT_OF_STOCK",
      };
    }
    console.error("[createOrder] Unexpected error:", err);
    return {
      ok: false,
      error: "Der opstod en fejl under bestillingen. Prøv igen.",
      code: "INTERNAL",
    };
  }
}

/**
 * Phase 4: rollback hjælper for Stripe-mode hvor PaymentIntent-creation
 * fejler EFTER ordre + stock-decrement er commit'tet. Vi vil ikke have stock
 * tabt for en ordre der aldrig kan betales — re-incrementér + cancel.
 *
 * Bruger separat $transaction så rollback er atomic; hvis EN af de N stock-
 * updates fejler, rulles alle tilbage og ordren forbliver i pending_payment
 * (cron picker op senere).
 */
async function restockOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return;
  if (order.status !== "pending_payment") return; // ikke vores at rollback

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      // Task B: restock til samme lager-target som vi decrement'ede fra
      // (variant.stock hvis variantId, ellers product.stock).
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }
    await tx.order.update({
      where: { id: orderId },
      data: { status: "cancelled" },
    });
  });
}
