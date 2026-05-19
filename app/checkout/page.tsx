import { getCart } from "@/lib/cart";
import { calcPriceBreakdown } from "@/lib/pricing";
import { formatPriceDkk } from "@/lib/format";
import { Button } from "@/components/Button";
import CheckoutForm from "@/components/CheckoutForm";
import TrustBadges from "@/components/TrustBadges";
import { isStripeReady } from "@/lib/stripe";

export default async function CheckoutPage() {
  const [cart, stripeReady] = await Promise.all([
    getCart(),
    isStripeReady(),
  ]);
  const items = cart?.items ?? [];
  const isEmpty = items.length === 0;

  if (isEmpty) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
        <h1 className="mb-4 text-4xl font-black text-sol-ink sm:text-5xl">
          Din kurv er tom
        </h1>
        <p className="mb-8 text-sol-muted">
          Du har ingen varer i din kurv. Tilføj varer, inden du går til checkout.
        </p>
        <Button href="/produkter">Se alle produkter</Button>
      </div>
    );
  }

  const lines = items.map((item) => ({
    unitPriceDkk: item.product.priceDkk,
    quantity: item.quantity,
  }));

  const { subtotalDkk, shippingDkk, totalDkk } = calcPriceBreakdown(lines, null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      {!stripeReady && (
        <div role="status" className="mb-6 rounded-2xl bg-amber-50 border border-amber-300 px-5 py-3 text-amber-900 font-semibold text-sm">
          TEST-BUTIK — ingen rigtig betaling. Ordren registreres, men intet trækkes.
        </div>
      )}
      <h1 className="mb-10 text-4xl font-black text-sol-ink sm:text-5xl">
        Checkout
      </h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
        {/* Delivery form */}
        <section className="rounded-2xl border border-sol-ink/10 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-6 text-xl font-black text-sol-ink">
            Leveringsoplysninger
          </h2>
          <CheckoutForm />
        </section>

        {/* Order summary */}
        <aside>
          <TrustBadges variant="checkout" className="mb-4" />
          <div className="rounded-2xl border border-sol-ink/10 bg-white p-6 shadow-sm lg:sticky lg:top-6">
            <h2 className="mb-5 text-xl font-black text-sol-ink">Din ordre</h2>

            <ul className="mb-5 space-y-3">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 text-sm">
                  <span className="text-sol-ink">
                    {item.product.name}{" "}
                    <span className="text-sol-muted">× {item.quantity}</span>
                  </span>
                  <span className="whitespace-nowrap font-bold text-sol-ink">
                    {formatPriceDkk(item.product.priceDkk * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="space-y-2 border-t border-sol-ink/10 pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-sol-muted">Subtotal</span>
                <span className="font-semibold text-sol-ink">{formatPriceDkk(subtotalDkk)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sol-muted">Fragt</span>
                <span className="font-semibold text-sol-ink">
                  {shippingDkk === 0 ? "Gratis" : formatPriceDkk(shippingDkk)}
                </span>
              </div>
              <div className="flex justify-between border-t border-sol-ink/10 pt-3 text-base">
                <span className="font-black text-sol-ink">Total</span>
                <span className="font-black text-sol-ink">{formatPriceDkk(totalDkk)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
