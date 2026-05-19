import Image from "next/image";
import Link from "next/link";
import { getCart } from "@/lib/cart";
import { calcPriceBreakdown } from "@/lib/pricing";
import { formatPriceDkk } from "@/lib/format";
import { parseProductImages } from "@/lib/products";
import { Button } from "@/components/Button";
import { CartQuantity } from "@/components/CartQuantity";

export default async function KurvPage() {
  const cart = await getCart();
  const hasItems = cart && cart.items.length > 0;

  if (!hasItems) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-20 text-center">
        <div>
          <h1 className="text-4xl font-black text-sol-ink sm:text-5xl">
            Din kurv er tom
          </h1>
          <p className="mt-3 max-w-md text-base text-sol-muted">
            Du har ikke tilføjet nogen produkter endnu.
          </p>
        </div>
        <Button href="/produkter">Se alle produkter</Button>
      </div>
    );
  }

  const lines = cart.items.map((item) => ({
    unitPriceDkk: item.product.priceDkk,
    quantity: item.quantity,
  }));
  const breakdown = calcPriceBreakdown(lines, null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="mb-8 text-4xl font-black text-sol-ink sm:text-5xl">
        Din kurv
      </h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Cart lines */}
        <div className="overflow-hidden rounded-2xl border border-sol-ink/10 bg-white">
          <div className="flex flex-col divide-y divide-sol-ink/10">
            {cart.items.map((item) => {
              const images = parseProductImages(item.product.images);
              const firstImage = images[0] ?? null;
              const lineTotal = item.product.priceDkk * item.quantity;

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 sm:gap-6 sm:p-6"
                >
                  {/* Thumbnail */}
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-sol-cream sm:h-24 sm:w-24">
                    {firstImage ? (
                      <Image
                        src={firstImage}
                        alt={item.product.name}
                        fill
                        sizes="96px"
                        className="object-contain p-3"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-sol-muted">
                        Intet billede
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/produkt/${item.product.slug}`}
                      className="line-clamp-2 text-sm font-bold text-sol-ink transition hover:text-sol-accent sm:text-base"
                    >
                      {item.product.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-sol-muted">
                      {formatPriceDkk(item.product.priceDkk)} pr. stk.
                    </p>
                    <div className="mt-3">
                      <CartQuantity
                        cartItemId={item.id}
                        quantity={item.quantity}
                        max={item.product.stock}
                      />
                    </div>
                  </div>

                  {/* Line total */}
                  <p className="whitespace-nowrap text-sm font-black text-sol-ink sm:text-base">
                    {formatPriceDkk(lineTotal)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order summary */}
        <div className="h-fit rounded-2xl border border-sol-ink/10 bg-white p-6 shadow-sm lg:sticky lg:top-6">
          <h2 className="mb-5 text-xl font-black text-sol-ink">Ordreoversigt</h2>

          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-sm text-sol-ink">
              <span>Subtotal</span>
              <span className="font-bold">{formatPriceDkk(breakdown.subtotalDkk)}</span>
            </div>

            <div className="flex justify-between text-sm text-sol-ink">
              <span>Fragt</span>
              <span className="font-bold">
                {breakdown.shippingDkk === 0
                  ? "Gratis"
                  : formatPriceDkk(breakdown.shippingDkk)}
              </span>
            </div>

            <div className="h-px bg-sol-ink/10" />

            <div className="flex justify-between text-base font-black text-sol-ink">
              <span>Total</span>
              <span>{formatPriceDkk(breakdown.totalDkk)}</span>
            </div>
          </div>

          <Button href="/checkout" className="mt-6 w-full">
            Gå til checkout
          </Button>

          <p className="mt-4 text-center text-xs leading-snug text-sol-muted">
            Antal begrænses af den tilgængelige lagerbeholdning.
          </p>
        </div>
      </div>
    </div>
  );
}
