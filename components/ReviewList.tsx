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

  const en = locale === "en";
  const t = {
    sectionAria: en ? "Customer reviews" : "Kundeanmeldelser",
    heading: en ? "Reviews" : "Anmeldelser",
    reviewsWord: en ? "reviews" : "anmeldelser",
    none: en ? "No reviews yet. Be the first!" : "Ingen anmeldelser endnu. Bliv den første!",
    write: en ? "Write a review" : "Skriv en anmeldelse",
    verified: en ? "Verified purchase" : "Verificeret køb",
  };

  return (
    <section
      id="reviews"
      className="border-t border-sol-ink/10 px-4 py-12 md:px-8"
      aria-label={t.sectionAria}
    >
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-sol-ink">
              {t.heading}
            </h2>
            {aggregate ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-sol-muted">
                <span className="font-mono text-amber-500" aria-hidden>
                  {renderStars(aggregate.average)}
                </span>
                <span>
                  {aggregate.average.toFixed(1)} / 5 ({aggregate.count} {t.reviewsWord})
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-sol-muted">
                {t.none}
              </p>
            )}
          </div>

          <Link
            href={`/${locale}/product/${productSlug}#skriv-anmeldelse`}
            className="rounded-lg border border-sol-ink/15 dark:border-white/15 px-4 py-2 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent"
          >
            {t.write}
          </Link>
        </div>

        {reviews.length === 0 ? null : (
          <ul className="mt-6 flex flex-col gap-5">
            {reviews.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-sol-ink/10 dark:border-white/10 bg-white dark:bg-sol-sand p-5"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-sol-muted">
                  <span className="font-mono text-amber-500" aria-hidden>
                    {renderStars(r.rating)}
                  </span>
                  <span className="font-black text-sol-ink">{r.authorName}</span>
                  {r.verifiedPurchase && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-900">
                      {t.verified}
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
