import "server-only";

import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { LIVE_PRODUCT_WHERE } from "@/lib/product-visibility";
import { localeHref } from "@/lib/urls";
import { sendAbandonedCartEmail } from "@/lib/mailer/abandoned-cart";
import {
  emitMarketingEvent,
  marketingAutomationsEnabled,
  MARKETING_EVENTS,
} from "@/lib/marketing/automations";

/**
 * Abandoned-cart-job — find logged-in kurve der har ligget inaktive i N timer
 * (med varer, endnu ikke mailet) og send en recovery-mail + skriv idempotens-log.
 * Mirror af review-prompt-cron'en. Gæste-kurve (userId null) har ingen email →
 * springes over.
 */

const DEFAULT_HOURS = 24;
const MAX_PER_RUN = 30;

export type AbandonedCartRun = {
  eligible: number;
  sent: number;
  skipped: number;
  failed: number;
};

export async function runAbandonedCartJob(
  opts: { now?: Date; hours?: number; limit?: number } = {},
): Promise<AbandonedCartRun> {
  const now = opts.now ?? new Date();
  const hours = opts.hours ?? DEFAULT_HOURS;
  const limit = opts.limit ?? MAX_PER_RUN;
  const cutoff = new Date(now.getTime() - hours * 3_600_000);

  const carts = await prisma.cart.findMany({
    where: {
      userId: { not: null },
      updatedAt: { lt: cutoff },
      // CART-DELETED-PRODUCT: like getCart, a line whose product the shop
      // deleted, or set to draft (CART-DRAFT-FILTER), is not "in the cart" —
      // no recovery mail for it.
      items: { some: { product: LIVE_PRODUCT_WHERE } },
      abandonedCartLog: null,
    },
    include: {
      user: { select: { email: true, name: true } },
      items: {
        where: { product: LIVE_PRODUCT_WHERE },
        include: { product: { select: { name: true, priceDkk: true } }, variant: { select: { priceDkk: true } } },
      },
    },
    take: limit,
    orderBy: { updatedAt: "asc" },
  });

  const run: AbandonedCartRun = { eligible: carts.length, sent: 0, skipped: 0, failed: 0 };

  // Når marketingAutomations er on emitter vi et cart.abandoned-event til Resend
  // Automations (som kører selve recovery-drippen) i STEDET for det direkte
  // single-send. Tager forrang så kunder ikke dobbelt-mailes.
  const useAutomations = marketingAutomationsEnabled();

  // The cart page in the base locale, linked the way the storefront links it
  // (URL2-d): `/da/cart` by default, so the mail answers without a locale redirect.
  const cartUrl = `${brand.url.replace(/\/+$/, "")}${localeHref("/cart", brand.defaultLocale)}`;

  for (const cart of carts) {
    const email = cart.user?.email;
    if (!email) {
      run.skipped++;
      continue;
    }
    const items = cart.items.map((i) => ({
      productName: i.product.name,
      quantity: i.quantity,
      unitPriceDkk: i.variant?.priceDkk ?? i.product.priceDkk,
    }));
    try {
      if (useAutomations) {
        const emitted = await emitMarketingEvent(
          MARKETING_EVENTS.cartAbandoned,
          email,
          { cartUrl, itemCount: items.length, items },
        );
        // Skriv altid logget (idempotens-markør) så kurven ikke re-evalueres
        // hver run — også når consent-gaten blokerede emissionen.
        await prisma.abandonedCartLog.create({
          data: {
            cartId: cart.id,
            emailMessageId: emitted ? "resend-automation" : "skipped-no-consent",
          },
        });
        if (emitted) run.sent++;
        else run.skipped++;
        continue;
      }

      const { messageId } = await sendAbandonedCartEmail({
        to: email,
        recipientName: cart.user?.name ?? null,
        cartUrl,
        items,
      });
      await prisma.abandonedCartLog.create({
        data: { cartId: cart.id, emailMessageId: messageId },
      });
      run.sent++;
    } catch (err) {
      console.error(`[abandoned-cart] cart=${cart.id} failed:`, err);
      run.failed++;
    }
  }

  return run;
}
