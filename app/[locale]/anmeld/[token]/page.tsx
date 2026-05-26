import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { verifyReviewToken } from "@/lib/review-token";
import WriteReviewForm from "@/components/WriteReviewForm";

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
          product: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  if (!order) notFound();

  // Eksisterende reviews fra samme email på samme produkter — undgår spam.
  const existingReviews = await prisma.productReview.findMany({
    where: {
      authorEmail: order.email,
      productId: { in: order.items.map((i) => i.productId) },
    },
    select: { productId: true },
  });
  const reviewedProductIds = new Set(existingReviews.map((r) => r.productId));

  return (
    <main className="min-h-screen bg-sol-cream px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href={`/${locale}`}
          className="text-sm font-black text-sol-muted hover:text-sol-accent"
        >
          ← Til forsiden
        </Link>
        <h1 className="mt-4 text-3xl font-black text-sol-ink">
          Tak for dit køb — del din oplevelse
        </h1>
        <p className="mt-2 text-sm text-sol-muted">
          Du modtog dette link fordi du købte hos os. Anmeldelser hjælper andre
          kunder med at finde de rigtige produkter. Du behøver ikke at logge ind.
        </p>

        <div className="mt-8 flex flex-col gap-6">
          {order.items.map((item) => {
            if (reviewedProductIds.has(item.productId)) {
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-sol-ink/10 bg-white px-5 py-4 text-sm font-semibold text-sol-muted"
                >
                  Du har allerede anmeldt{" "}
                  <Link
                    href={`/${locale}/produkt/${item.product.slug}`}
                    className="font-black text-sol-ink hover:text-sol-accent"
                  >
                    {item.product.name}
                  </Link>
                  . Tak!
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
    </main>
  );
}
