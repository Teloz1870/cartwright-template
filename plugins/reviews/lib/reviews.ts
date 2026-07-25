import "server-only";
import { prisma } from "@/lib/db";

/**
 * Phase 10 Slice 7 — review service-layer.
 *
 * Centralized read-helpers + AggregateRating-beregning. Moderation-write-paths
 * lever i app/admin/anmeldelser/actions.ts; kunde-submit i /api/reviews/route.ts.
 */

export type AggregateRating = {
  count: number;
  average: number; // 1.0 - 5.0, afrundet til 1 decimal
};

/**
 * Minimum-grænse for AggregateRating JSON-LD render. Google's officielle krav
 * er ≥ 1 review, men under ~3 ser det spammy ud + giver lav statistisk vægt.
 * Vi udelader nøglen helt under threshold (emit ikke count=0).
 */
export const AGGREGATE_RATING_THRESHOLD = 3;

/**
 * Beregner aggregate på godkendte reviews. Returnerer null hvis under threshold
 * så caller kan udelade JSON-LD-nøglen frem for at emitte tomt felt.
 */
export async function getAggregateRating(
  productId: string,
): Promise<AggregateRating | null> {
  const result = await prisma.productReview.aggregate({
    where: { productId, status: "approved" },
    _count: { _all: true },
    _avg: { rating: true },
  });
  const count = result._count._all;
  if (count < AGGREGATE_RATING_THRESHOLD) return null;
  const average = Math.round((result._avg.rating ?? 0) * 10) / 10;
  return { count, average };
}

/**
 * Liste-helper til PDP-render. Returnerer kun approved reviews, nyeste først.
 */
export async function listApprovedReviews(
  productId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    authorName: string;
    rating: number;
    title: string | null;
    body: string;
    language: string;
    createdAt: Date;
    verifiedPurchase: boolean;
  }>
> {
  const rows = await prisma.productReview.findMany({
    where: { productId, status: "approved" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      authorName: true,
      rating: true,
      title: true,
      body: true,
      language: true,
      createdAt: true,
      orderId: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    authorName: r.authorName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    language: r.language,
    createdAt: r.createdAt,
    verifiedPurchase: r.orderId !== null,
  }));
}
