import { getCart } from "@/lib/cart";
import { calcPriceBreakdown } from "@/lib/pricing";
import { formatPriceDkk } from "@/lib/format";
import { Button } from "@/components/Button";
import CheckoutForm from "@/components/CheckoutForm";
import TrustBadges from "@/components/TrustBadges";
import { isStripeReady } from "@/lib/stripe";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getBrand } from "@/lib/brand";
import { getActiveDesign } from "@/lib/theme";
import { readField } from "@/lib/genome/read";
import { DesignSurface, displayFont, surface } from "@/components/surfaces/DesignSurface";

export default async function CheckoutPage() {
  const brandSettings = await getBrand();
  if (!brandSettings.ecommerceEnabled) {
    redirect("/");
  }

  const [cart, stripeReady] = await Promise.all([
    getCart(),
    isStripeReady(),
  ]);
  const items = cart?.items ?? [];
  const isEmpty = items.length === 0;
  const t = await getTranslations("Checkout");

  // Mixer 2.0 Phase 4 — designSurfaces. Flag OFF (default) renders the legacy
  // markup below verbatim (byte-identical; Solbrillen/Northbound run this page
  // live). Flag ON renders the design-token-adaptive surface further down.
  const designSurfaces = Boolean(brandSettings.features.designSurfaces);

  if (!designSurfaces) {
    if (isEmpty) {
      return (
        <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
          <h1 className="mb-4 text-4xl font-black text-sol-ink sm:text-5xl">
            {t("emptyTitle")}
          </h1>
          <p className="mb-8 text-sol-muted">
            {t("emptyBody")}
          </p>
          <Button href="/produkter">{t("viewAllProducts")}</Button>
        </div>
      );
    }

    const lines = items.map((item) => ({
      unitPriceDkk: item.variant?.priceDkk ?? item.product.priceDkk,
      quantity: item.quantity,
    }));

    const { subtotalDkk, shippingDkk, totalDkk } = calcPriceBreakdown(lines, null);

    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        {!stripeReady && (
          <div role="status" className="mb-6 rounded-2xl bg-amber-50 border border-amber-300 px-5 py-3 text-amber-900 font-semibold text-sm">
            {t("testStoreNotice")}
          </div>
        )}
        <h1 className="mb-10 text-4xl font-black text-sol-ink sm:text-5xl">
          {t("title")}
        </h1>

        <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
          {/* Delivery form */}
          <section className="rounded-2xl border border-sol-ink/10 bg-sol-cream p-6 shadow-sm sm:p-8">
            <h2 className="mb-6 text-xl font-black text-sol-ink">
              {t("deliveryDetails")}
            </h2>
            <CheckoutForm />
          </section>

          {/* Order summary */}
          <aside>
            <TrustBadges variant="checkout" className="mb-4" />
            <div className="rounded-2xl border border-sol-ink/10 bg-sol-cream p-6 shadow-sm lg:sticky lg:top-6">
              <h2 className="mb-5 text-xl font-black text-sol-ink">{t("summaryTitle")}</h2>

              <ul className="mb-5 space-y-3">
                {items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-4 text-sm">
                    <span className="text-sol-ink">
                      {item.product.name}{" "}
                      <span className="text-sol-muted">× {item.quantity}</span>
                    </span>
                    <span className="whitespace-nowrap font-bold text-sol-ink">
                      {formatPriceDkk((item.variant?.priceDkk ?? item.product.priceDkk) * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2 border-t border-sol-ink/10 pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-sol-muted">{t("subtotal")}</span>
                  <span className="font-semibold text-sol-ink">{formatPriceDkk(subtotalDkk)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sol-muted">{t("shipping")}</span>
                  <span className="font-semibold text-sol-ink">
                    {shippingDkk === 0 ? t("free") : formatPriceDkk(shippingDkk)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-sol-ink/10 pt-3 text-base">
                  <span className="font-black text-sol-ink">{t("total")}</span>
                  <span className="font-black text-sol-ink">{formatPriceDkk(totalDkk)}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // ── designSurfaces ON: the design-token-adaptive checkout ─────────────────
  const locale = await getLocale();
  const activeDesign = await getActiveDesign().catch(() => null);
  const CheckoutTemplate = activeDesign?.pages?.checkout;
  const anchors = [t("title"), t("summaryTitle")] as const;
  const [title, summaryTitle] = brandSettings.features.genomeResolve
    ? await Promise.all([
        readField("checkout.title"),
        readField("checkout.summaryTitle"),
      ]).catch(() => [...anchors])
    : anchors;

  const adaptiveBreakdown = isEmpty
    ? null
    : calcPriceBreakdown(
        items.map((item) => ({
          unitPriceDkk: item.variant?.priceDkk ?? item.product.priceDkk,
          quantity: item.quantity,
        })),
        null,
      );

  const body = isEmpty ? (
    <DesignSurface className={surface.page}>
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
        <h1
          className={`mb-4 text-4xl font-black tracking-tight sm:text-5xl ${surface.ink}`}
          style={displayFont}
        >
          {t("emptyTitle")}
        </h1>
        <p className={`mb-8 ${surface.muted}`}>
          {t("emptyBody")}
        </p>
        <Button href="/produkter">{t("viewAllProducts")}</Button>
      </div>
    </DesignSurface>
  ) : (
    <DesignSurface className={surface.page}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        {!stripeReady && (
          <div role="status" className="mb-6 rounded-2xl bg-amber-50 border border-amber-300 px-5 py-3 text-amber-900 font-semibold text-sm">
            {t("testStoreNotice")}
          </div>
        )}
        <h1
          className={`mb-10 text-4xl font-black tracking-tight sm:text-5xl ${surface.ink}`}
          style={displayFont}
        >
          {title}
        </h1>

        <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
          {/* Delivery form */}
          <section className={`p-6 sm:p-8 ${surface.card}`}>
            <h2 className={`mb-6 text-xl font-black ${surface.ink}`} style={displayFont}>
              {t("deliveryDetails")}
            </h2>
            <CheckoutForm />
          </section>

          {/* Order summary */}
          <aside>
            <TrustBadges variant="checkout" className="mb-4" />
            <div className={`p-6 lg:sticky lg:top-6 ${surface.card}`}>
              <h2 className={`mb-5 text-xl font-black ${surface.ink}`} style={displayFont}>
                {summaryTitle}
              </h2>

              <ul className="mb-5 space-y-3">
                {items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-4 text-sm">
                    <span className={surface.ink}>
                      {item.product.name}{" "}
                      <span className={surface.muted}>× {item.quantity}</span>
                    </span>
                    <span className={`whitespace-nowrap font-bold ${surface.ink}`}>
                      {formatPriceDkk((item.variant?.priceDkk ?? item.product.priceDkk) * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className={`space-y-2 border-t pt-4 text-sm ${surface.divider}`}>
                <div className="flex justify-between">
                  <span className={surface.muted}>{t("subtotal")}</span>
                  <span className={`font-semibold ${surface.ink}`}>
                    {formatPriceDkk(adaptiveBreakdown!.subtotalDkk)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={surface.muted}>{t("shipping")}</span>
                  <span className={`font-semibold ${surface.ink}`}>
                    {adaptiveBreakdown!.shippingDkk === 0
                      ? t("free")
                      : formatPriceDkk(adaptiveBreakdown!.shippingDkk)}
                  </span>
                </div>
                <div className={`flex justify-between border-t pt-3 text-base ${surface.divider}`}>
                  <span className={`font-black ${surface.ink}`}>{t("total")}</span>
                  <span className={`font-black ${surface.ink}`}>
                    {formatPriceDkk(adaptiveBreakdown!.totalDkk)}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </DesignSurface>
  );

  return CheckoutTemplate ? (
    <CheckoutTemplate locale={locale}>{body}</CheckoutTemplate>
  ) : (
    body
  );
}
