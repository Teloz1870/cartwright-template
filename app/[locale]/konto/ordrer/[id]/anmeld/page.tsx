import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import WriteReviewForm from "@/components/WriteReviewForm";

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
    redirect(`/${locale}/konto/login?callbackUrl=/${locale}/konto/ordrer/${id}/anmeld`);
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

  return (
    <main className="min-h-screen bg-sol-cream px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href={`/${locale}/konto/ordrer`}
          className="text-sm font-black text-sol-muted hover:text-sol-accent"
        >
          ← Mine ordrer
        </Link>
        <h1 className="mt-4 text-3xl font-black text-sol-ink">
          Anmeld produkter fra denne ordre
        </h1>
        <p className="mt-2 text-sm text-sol-muted">
          Din anmeldelse hjælper andre kunder med at træffe gode valg. Den bliver
          markeret som <strong>verified purchase</strong> da du har købt produktet.
        </p>

        <div className="mt-8 flex flex-col gap-6">
          {order.items.map((item) => {
            if (reviewedProductIds.has(item.productId)) {
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-sol-ink/10 bg-white px-5 py-4 text-sm font-semibold text-sol-muted"
                >
                  Du har allerede skrevet en anmeldelse af{" "}
                  <Link
                    href={`/${locale}/produkt/${item.product.slug}`}
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
