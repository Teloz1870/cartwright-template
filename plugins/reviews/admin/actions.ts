"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

/**
 * Phase 10 Slice 7a — moderation-actions for /admin/anmeldelser.
 *
 * Tre overgange: approved | rejected | spam. Alle skriver moderatedBy + Note +
 * timestamp så audit-trail er komplet. Approved reviews bliver synlige på PDP
 * og tæller ind i AggregateRating.
 */

type ModerationOutcome = "approved" | "rejected" | "spam";

async function moderate(
  reviewId: string,
  outcome: ModerationOutcome,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin();
  const moderator = session.user?.email ?? "unknown-admin";

  try {
    await prisma.productReview.update({
      where: { id: reviewId },
      data: {
        status: outcome,
        moderatorNote: note?.trim() || null,
        moderatedBy: `admin:${moderator}`,
        moderatedAt: new Date(),
      },
    });
    revalidatePath("/admin/anmeldelser");
    revalidatePath(`/admin/anmeldelser/${reviewId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Moderation fejlede" };
  }
}

export async function approveReviewAction(reviewId: string, note?: string) {
  return moderate(reviewId, "approved", note);
}

export async function rejectReviewAction(reviewId: string, note?: string) {
  return moderate(reviewId, "rejected", note);
}

export async function spamReviewAction(reviewId: string, note?: string) {
  return moderate(reviewId, "spam", note);
}
