import "server-only";

import { prisma } from "@/lib/db";

/** Ønskeliste-server-lag. Logged-in brugere (userId fra session). */

export async function getWishlistProductIds(userId: string): Promise<string[]> {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId },
    select: { productId: true },
  });
  return rows.map((r) => r.productId);
}

export async function toggleWishlist(
  userId: string,
  productId: string,
): Promise<{ wishlisted: boolean }> {
  const existing = await prisma.wishlistItem.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    return { wishlisted: false };
  }
  await prisma.wishlistItem.create({ data: { userId, productId } });
  return { wishlisted: true };
}

export async function listWishlistProducts(userId: string) {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId, product: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: { product: true },
  });
  return rows.map((r) => r.product);
}
