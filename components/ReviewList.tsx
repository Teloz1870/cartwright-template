import Link from "next/link";
import {
  getAggregateRating,
  listApprovedReviews,
} from "@/lib/reviews";

/**
 * Phase 10 Slice 7b — render approved reviews + write-CTA på PDP.
 *
 * Server component, ingen interactivity. AggregateRating-header viser kun når
 * der er mindst 3 godkendte reviews (samme threshold som JSON-LD-render i
 * generateMetadata).
 */
export default async function ReviewList({
  productId,
  productName,
  productSlug,
  locale,
}: {
  productId: string;
  productName: string;
  productSlug: string;
  locale: string;
}) {
  const [aggregate, reviews] = await Promise.all([
    getAggregateRating(productId),
    listApprovedReviews(productId, 20),
  ]);

  return (
    <section
      id="reviews"
      className="border-t border-sol-ink/10 px-4 py-12 md:px-8"
      aria-label="Kundeanmeldelser"
    >
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-sol-ink">
              Anmeldelser
            </h2>
            {aggregate ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-sol-muted">
                <span className="font-mono text-amber-500" aria-hidden>
                  {renderStars(aggregate.average)}
                </span>
                <span>
                  {aggregate.average.toFixed(1)} / 5 ({aggregate.count} anmeldelser)
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-sol-muted">
                Ingen anmeldelser endnu. Bliv den første!
              </p>
            )}
          </div>

          <Link
            href={`/${locale}/product/${productSlug}#skriv-anmeldelse`}
            className="rounded-lg border border-sol-ink/15 px-4 py-2 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent"
          >
            Skriv en anmeldelse
          </Link>
        </div>

        {reviews.length === 0 ? null : (
          <ul className="mt-6 flex flex-col gap-5">
            {reviews.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-sol-ink/10 bg-white p-5"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-sol-muted">
                  <span className="font-mono text-amber-500" aria-hidden>
                    {renderStars(r.rating)}
                  </span>
                  <span className="font-black text-sol-ink">{r.authorName}</span>
                  {r.verifiedPurchase && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-900">
                      Verified purchase
                    </span>
                  )}
                  <span>·</span>
                  <time dateTime={r.createdAt.toISOString()}>
                    {r.createdAt.toLocaleDateString(locale === "en" ? "en-US" : "da-DK")}
                  </time>
                </div>
                {r.title && (
                  <h3 className="mt-2 text-base font-black text-sol-ink">
                    {r.title}
                  </h3>
                )}
                <p className="mt-2 whitespace-pre-wrap text-sm text-sol-ink/90">
                  {r.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function renderStars(rating: number): string {
  const filled = Math.round(rating);
  return "★".repeat(filled) + "☆".repeat(Math.max(0, 5 - filled));
}
