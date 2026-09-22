import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { formatPriceDkk } from "@/lib/format";
import ModerationActions from "./ModerationActions";
import {
  AdminCard,
  AdminButton,
  AdminBadge,
  type BadgeTone,
} from "@/components/admin/ui";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const review = await prisma.productReview.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, name: true, slug: true } },
      order: { select: { id: true, totalDkk: true, paidAt: true } },
    },
  });

  if (!review) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <AdminButton href="/admin/anmeldelser" variant="plain" size="sm">
          ← Anmeldelser
        </AdminButton>
        <AdminBadge tone={statusTone(review.status)}>{review.status}</AdminBadge>
        {review.orderId && <AdminBadge tone="success">Verified purchase</AdminBadge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr,1fr]">
        <AdminCard>
          <div className="mb-4 border-b border-sol-ink/10 pb-3">
            <Link
              href={`/admin/produkter/${review.product.id}`}
              className="text-xs font-black uppercase text-sol-muted hover:text-sol-accent"
            >
              {review.product.name}
            </Link>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-black text-sol-ink">
              <span className="font-mono text-amber-500">{renderStars(review.rating)}</span>
              {review.title}
            </h1>
            <p className="mt-1 text-xs text-sol-muted">
              af {review.authorName} &lt;{review.authorEmail}&gt; ·{" "}
              {review.createdAt.toISOString().slice(0, 10)} · sprog: {review.language}
            </p>
          </div>

          <div className="whitespace-pre-wrap text-sm text-sol-ink">{review.body}</div>

          {review.order && (
            <div className="mt-6 rounded-lg bg-sol-cream px-4 py-3 text-xs text-sol-muted">
              <div className="font-black uppercase">Ordre-kontekst</div>
              <div className="mt-1">
                <Link
                  href={`/admin/ordrer/${review.order.id}`}
                  className="hover:text-sol-accent"
                >
                  #{review.order.id.slice(0, 8)}…
                </Link>
                {" · "}
                {formatPriceDkk(review.order.totalDkk)}
                {review.order.paidAt && ` · betalt ${review.order.paidAt.toISOString().slice(0, 10)}`}
              </div>
            </div>
          )}

          {review.moderatedAt && (
            <div className="mt-3 rounded-lg bg-sol-cream px-4 py-3 text-xs text-sol-muted">
              <div className="font-black uppercase">Sidste moderation</div>
              <div className="mt-1">
                {review.moderatedBy} · {review.moderatedAt.toISOString().slice(0, 16).replace("T", " ")}
              </div>
              {review.moderatorNote && (
                <div className="mt-1 italic">&quot;{review.moderatorNote}&quot;</div>
              )}
            </div>
          )}
        </AdminCard>

        <AdminCard title="Modération">
          <ModerationActions
            reviewId={review.id}
            initialNote={review.moderatorNote ?? ""}
          />
        </AdminCard>
      </div>
    </div>
  );
}

function renderStars(rating: number): string {
  const r = Math.max(1, Math.min(5, Math.round(rating)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function statusTone(status: string): BadgeTone {
  switch (status) {
    case "approved":
      return "success";
    case "pending":
      return "attention";
    case "rejected":
    case "spam":
      return "critical";
    default:
      return "neutral";
  }
}
