import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { verifyReviewToken } from "@/plugins/reviews/lib/review-token";
import WriteReviewForm from "@/plugins/reviews/components/WriteReviewForm";
import { reviewableItems } from "@/plugins/reviews/lib/reviewable-items";
import { localeHref, productHref } from "@/lib/urls";

/**
 * Phase 10 Slice 7b — unauth review-form landing fra post-purchase email.
 *
 * Token-baseret: HMAC af orderId+paidAt verificeret stateless. Ingen DB-row
 * pre-allokeres ved email-send — kun ved submit. Det undgår "tomme" pending
 * reviews der aldrig fyldes ud.
 */
export default async function AnmeldTokenPage({
  params,
}: {
  params: Promise<{ token: string; locale: string }>;
}) {
  const { token, locale } = await params;
  const decoded = verifyReviewToken(decodeURIComponent(token));
  if (!decoded) notFound();

  const order = await prisma.order.findUnique({
    where: { id: decoded.orderId },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, slug: true, permalink: true } },
        },
      },
    },
  });
  if (!order) notFound();
  // A line whose product is gone (an imported historic order) has nothing to review.
  const items = reviewableItems(order.items);

  // Eksisterende reviews fra samme email på samme produkter — undgår spam.
  const existingReviews = await prisma.productReview.findMany({
    where: {
      authorEmail: order.email,
      productId: { in: items.map((i) => i.productId) },
    },
    select: { productId: true },
  });
  const reviewedProductIds = new Set(existingReviews.map((r) => r.productId));
  // The page's own copy was hard-coded Danish, so an English shop's review
  // email opened on a Danish page. Danish renders exactly as before.
  const t = await getTranslations({ locale, namespace: "Reviews" });

  return (
    <div className="min-h-screen bg-sol-cream px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href={localeHref("/", locale)}
          className="text-sm font-black text-sol-muted hover:text-sol-accent"
        >
          {t("token_backToHome")}
        </Link>
        <h1 className="mt-4 text-3xl font-black text-sol-ink">
          {t("token_title")}
        </h1>
        <p className="mt-2 text-sm text-sol-muted">{t("token_intro")}</p>

        <div className="mt-8 flex flex-col gap-6">
          {items.map((item) => {
            if (reviewedProductIds.has(item.productId)) {
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-sol-ink/10 dark:border-white/10 bg-white dark:bg-sol-sand px-5 py-4 text-sm font-semibold text-sol-muted"
                >
                  {t.rich("token_alreadyReviewed", {
                    name: item.product.name,
                    product: (chunks) => (
                      <Link
                        href={productHref({ slug: item.product.slug, permalink: item.product.permalink }, locale)}
                        className="font-black text-sol-ink hover:text-sol-accent"
                      >
                        {chunks}
                      </Link>
                    ),
                  })}
                </div>
              );
            }
            return (
              <WriteReviewForm
                key={item.id}
                productId={item.productId}
                productName={item.product.name}
                reviewToken={token}
                defaultName={order.shippingName}
                defaultEmail={order.email}
                locale={locale as "da" | "en"}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
