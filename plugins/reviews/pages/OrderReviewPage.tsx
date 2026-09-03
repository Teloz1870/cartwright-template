import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import WriteReviewForm from "@/plugins/reviews/components/WriteReviewForm";

/**
 * Phase 10 Slice 7b — anmeld én ordre (logged-in).
 *
 * Henter ordren via session, lister produkterne, og viser én WriteReviewForm
 * pr. produkt der ikke allerede har en review fra denne kunde.
 */
export default async function ReviewOrderPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/account/login?callbackUrl=/${locale}/account/orders/${id}/review`);
  }

  const order = await prisma.order.findFirst({
    where: { id, userId: session.user.id },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!order) notFound();

  // Find allerede-skrevne reviews fra denne user på de pågældende produkter
  const existingReviews = await prisma.productReview.findMany({
    where: {
      userId: session.user.id,
      productId: { in: order.items.map((i) => i.productId) },
    },
    select: { productId: true, status: true },
  });
  const reviewedProductIds = new Set(existingReviews.map((r) => r.productId));

  // Same en?/da? dictionary shape the plugin's other components use
  // (WriteReviewForm, ReviewList). This page had none, so its Danish rendered
  // on English shops — the one review surface that was never localized.
  const en = locale === "en";
  const t = {
    backToOrders: en ? "\u2190 My orders" : "\u2190 Mine ordrer",
    heading: en
      ? "Review products from this order"
      : "Anmeld produkter fra denne ordre",
    intro: en
      ? "Your review helps other customers choose well. It is marked as a "
      : "Din anmeldelse hj\u00e6lper andre kunder med at tr\u00e6ffe gode valg. Den bliver markeret som ",
    introTail: en
      ? " because you bought the product."
      : " da du har k\u00f8bt produktet.",
    // Kept English in both languages today — it is the product term the shop
    // shows on the review itself. In the dictionary so a third locale can
    // decide differently.
    verifiedTerm: "verified purchase",
    alreadyReviewed: en
      ? "You have already reviewed "
      : "Du har allerede skrevet en anmeldelse af ",
  };

  return (
    <main className="min-h-screen bg-sol-cream px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href={`/${locale}/account/orders`}
          className="text-sm font-black text-sol-muted hover:text-sol-accent"
        >
          {t.backToOrders}
        </Link>
        <h1 className="mt-4 text-3xl font-black text-sol-ink">
          {t.heading}
        </h1>
        <p className="mt-2 text-sm text-sol-muted">
          {t.intro}
            <strong>{t.verifiedTerm}</strong>
            {t.introTail}
        </p>

        <div className="mt-8 flex flex-col gap-6">
          {order.items.map((item) => {
            if (reviewedProductIds.has(item.productId)) {
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-sol-ink/10 dark:border-white/10 bg-white dark:bg-sol-sand px-5 py-4 text-sm font-semibold text-sol-muted"
                >
                  {t.alreadyReviewed}
                  <Link
                    href={`/${locale}/product/${item.product.slug}`}
                    className="font-black text-sol-ink hover:text-sol-accent"
                  >
                    {item.product.name}
                  </Link>
                  .
                </div>
              );
            }
            return (
              <WriteReviewForm
                key={item.id}
                productId={item.productId}
                productName={item.product.name}
                orderId={order.id}
                defaultName={session.user.name ?? ""}
                defaultEmail={session.user.email ?? ""}
                locale={locale as "da" | "en"}
              />
            );
          })}
        </div>
      </div>
    </main>
  );
}
