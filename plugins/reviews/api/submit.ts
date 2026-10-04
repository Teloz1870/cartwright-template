import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { verifyReviewToken } from "@/plugins/reviews/lib/review-token";

/**
 * Phase 10 Slice 7b — kunde-submit endpoint for reviews.
 *
 * Auth-paths (én skal være gyldig):
 *   1. NextAuth-session + orderId der tilhører user → verified-purchase
 *   2. Token fra post-purchase mail (HMAC af orderId) → verified-purchase
 *   3. Hverken eller → anonym review (kun tilladt hvis productId er givet)
 *
 * Alle submits oprettes med status="pending" → admin modererer i
 * /admin/anmeldelser før de vises på PDP.
 *
 * Rate-limit: 5 reviews/time/IP (in-memory token bucket).
 */
export const runtime = "nodejs";

const submitSchema = z.object({
  productId: z.string().min(1).max(60),
  orderId: z.string().optional(),
  reviewToken: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().min(10).max(2000),
  language: z.enum(["da", "en"]).default("da"),
  authorName: z.string().min(2).max(80).optional(),
  authorEmail: z.string().email().optional(),
});

const submitLimiter = createRateLimiter("review-submit", {
  capacity: 5,
  refillRate: 5 / 3600, // 5 / time sustained
});

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const limited = submitLimiter.check(ip);
  if (!limited.allowed) {
    return rateLimitResponse(limited);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "invalid_json", error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "invalid_fields", error: "Invalid fields", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Resolve identity: session → token → anonymous
  const session = await auth();
  const userId: string | null = session?.user?.id ?? null;
  let orderId: string | null = null;
  // Empty rather than a hardcoded word: `authorName` is written into the
  // customer's database and rendered on the public PDP forever, so a Danish
  // literal here becomes permanent Danish on an English shop. ReviewList
  // supplies the localized fallback at render time.
  const authorName = input.authorName ?? session?.user?.name ?? "";
  let authorEmail = input.authorEmail ?? session?.user?.email ?? "";

  if (input.orderId && userId) {
    const order = await prisma.order.findFirst({
      where: { id: input.orderId, userId },
      select: { id: true, email: true },
    });
    if (!order) {
      return NextResponse.json(
        { code: "order_not_yours", error: "That order is not yours" },
        { status: 403 },
      );
    }
    orderId = order.id;
    authorEmail = authorEmail || order.email;
  } else if (input.reviewToken) {
    const decoded = verifyReviewToken(input.reviewToken);
    if (!decoded) {
      return NextResponse.json({ code: "invalid_review_token", error: "Invalid review token" }, { status: 401 });
    }
    const order = await prisma.order.findUnique({
      where: { id: decoded.orderId },
      select: { id: true, email: true },
    });
    if (!order) {
      return NextResponse.json({ code: "order_not_found", error: "That order does not exist" }, { status: 404 });
    }
    orderId = order.id;
    authorEmail = authorEmail || order.email;
  }

  if (!authorEmail) {
    return NextResponse.json(
      { code: "email_required", error: "authorEmail is required for anonymous reviews" },
      { status: 400 },
    );
  }

  // Verificér at produktet eksisterer (undgår spam mod ikke-eksisterende IDs)
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true, deletedAt: true },
  });
  if (!product || product.deletedAt) {
    return NextResponse.json({ code: "product_not_found", error: "That product does not exist" }, { status: 404 });
  }

  const review = await prisma.productReview.create({
    data: {
      productId: input.productId,
      userId,
      orderId,
      authorName,
      authorEmail,
      rating: input.rating,
      title: input.title?.trim() || null,
      body: input.body.trim(),
      language: input.language,
      status: "pending",
    },
    select: { id: true },
  });

  return NextResponse.json({
    ok: true,
    id: review.id,
    message:
      "Thank you for your review. It will be checked and shown on the page shortly.",
  });
}
