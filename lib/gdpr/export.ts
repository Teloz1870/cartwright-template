import "server-only";

import { prisma } from "@/lib/db";

/**
 * DSAR-eksport (GDPR art. 15/20) — samler ALT data om ét subjekt til en JSON-
 * pakke. Ren read: ingen mutation. Bruges af selvbetjenings-route
 * (/api/account/export) og admin-AI-tool'et (gdpr.export_user).
 *
 * Subjektet findes via userId; email-linkede records (guest-ordrer, leads, ACP)
 * matches på subjektets email, så et fuldt billede samles selv når data ikke
 * har en FK til User.
 */

export type UserDataExport = {
  exportedAt: string;
  subject: Record<string, unknown>;
  orders: unknown[];
  guestOrdersSameEmail: unknown[];
  reviews: unknown[];
  subscriptions: unknown[];
  carts: unknown[];
  leads: unknown[];
  acpCheckoutSessions: unknown[];
};

export async function exportUserData(
  userId: string,
): Promise<UserDataExport | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    // Eksplicit select EKSKLUDERER passwordHash (afledt hemmelighed, ikke PII vi
    // udleverer). Account-OAuth-tokens udlades bevidst (hemmeligheder).
    select: {
      id: true,
      email: true,
      name: true,
      phoneNumber: true,
      shippingName: true,
      shippingAddress: true,
      shippingZip: true,
      shippingCity: true,
      role: true,
      createdAt: true,
    },
  });
  if (!user) return null;

  const [orders, guestOrders, reviews, subscriptions, carts, leads, acp] =
    await Promise.all([
      prisma.order.findMany({ where: { userId }, include: { items: true } }),
      prisma.order.findMany({ where: { email: user.email, userId: null } }),
      prisma.productReview.findMany({ where: { userId } }),
      prisma.subscription.findMany({ where: { userId } }),
      prisma.cart.findMany({ where: { userId } }),
      prisma.lead.findMany({ where: { email: user.email } }),
      prisma.acpCheckoutSession.findMany({ where: { buyerEmail: user.email } }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    subject: user,
    orders,
    guestOrdersSameEmail: guestOrders,
    reviews,
    subscriptions,
    carts,
    leads,
    acpCheckoutSessions: acp,
  };
}
