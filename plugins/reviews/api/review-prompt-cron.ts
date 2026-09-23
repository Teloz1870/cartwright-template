import { NextRequest, NextResponse } from "next/server";

import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { sendReviewPromptEmail } from "@/plugins/reviews/lib/mailer-review-prompt";
import { signReviewToken } from "@/plugins/reviews/lib/review-token";

/**
 * Phase 10 Slice 7c — daglig review-prompt cron.
 *
 * Finder ordrer der opfylder:
 *   - paidAt > REVIEW_PROMPTS_FROM (env, ISO-date). Beskytter historik mod
 *     at få "tak for dit køb" på 2 år gamle ordrer ved første deploy.
 *   - paidAt < now - 7 dage (kunden har haft tid til at modtage + prøve)
 *   - status = paid eller shipped
 *   - email findes (snapshot på ordre)
 *   - ingen ReviewPromptLog-row eksisterer for orderId (idempotens)
 *
 * Per ordre: signerer HMAC-token, sender email via Resend (eller PreviewMailer),
 * og opretter ReviewPromptLog-row så samme ordre aldrig får to prompts.
 *
 * Schedule: 1 gang dagligt kl 10:00 UTC. Auth via CRON_SECRET.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PER_RUN = 30;
const REVIEW_DELAY_DAYS = 7;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Feature-flag check: solbriller har reviews=false, så cron'en no-op'er der.
  const featuresEnabled = (brand.features as { reviews?: boolean }).reviews;
  if (!featuresEnabled) {
    return NextResponse.json({ ok: true, reason: "reviews-feature-disabled" });
  }

  // History-protection: send KUN prompts for ordrer der er nye nok.
  // Når flag flippes, sætter operatøren REVIEW_PROMPTS_FROM=<deploy-dato>
  // i Vercel env. Ingen env-værdi = no-op (sikker default).
  const fromIso = process.env.REVIEW_PROMPTS_FROM?.trim();
  if (!fromIso) {
    return NextResponse.json({
      ok: true,
      reason: "REVIEW_PROMPTS_FROM not set — skip historical orders",
    });
  }
  const fromDate = new Date(fromIso);
  if (Number.isNaN(fromDate.getTime())) {
    return NextResponse.json(
      { error: "REVIEW_PROMPTS_FROM is not a valid ISO date" },
      { status: 500 },
    );
  }

  const cutoff = new Date(Date.now() - REVIEW_DELAY_DAYS * 24 * 60 * 60 * 1000);

  const eligible = await prisma.order.findMany({
    where: {
      paidAt: { gt: fromDate, lt: cutoff, not: null },
      status: { in: ["paid", "shipped"] },
      reviewPromptLog: null,
    },
    include: {
      items: {
        include: {
          product: { select: { name: true, slug: true } },
        },
      },
    },
    take: MAX_PER_RUN,
    orderBy: { paidAt: "asc" },
  });

  const results: Array<{
    orderId: string;
    outcome: "sent" | "skipped" | "failed";
    reason?: string;
  }> = [];

  for (const order of eligible) {
    if (!order.email || !order.paidAt) {
      results.push({ orderId: order.id, outcome: "skipped", reason: "missing email or paidAt" });
      continue;
    }
    if (order.items.length === 0) {
      results.push({ orderId: order.id, outcome: "skipped", reason: "empty order" });
      continue;
    }

    try {
      const token = signReviewToken(order.id, order.paidAt);
      const tokenUrl = `${brand.url}/da/review/${encodeURIComponent(token)}`;

      const { messageId } = await sendReviewPromptEmail({
        to: order.email,
        recipientName: order.shippingName,
        orderId: order.id,
        items: order.items.map((i) => ({
          productName: i.productName,
          productSlug: i.product.slug,
        })),
        tokenUrl,
      });

      await prisma.reviewPromptLog.create({
        data: {
          orderId: order.id,
          emailMessageId: messageId,
        },
      });

      results.push({ orderId: order.id, outcome: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[review-prompt] order=${order.id} fejl:`, message);
      results.push({ orderId: order.id, outcome: "failed", reason: message });
    }
  }

  return NextResponse.json({
    ok: true,
    eligible: eligible.length,
    results,
  });
}
