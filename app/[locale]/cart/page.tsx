import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getCart } from "@/lib/cart";
import { calcPriceBreakdown } from "@/lib/pricing";
import { formatPriceDkk } from "@/lib/format";
import { resolveProductImageUrls } from "@/lib/media/shim";
import { Button } from "@/components/Button";
import { CartQuantity } from "@/components/CartQuantity";
import { getBrand } from "@/lib/brand";
import { getActiveDesign } from "@/lib/theme";
import { readField } from "@/lib/genome/read";
import { DesignSurface, displayFont, surface } from "@/components/surfaces/DesignSurface";

export default async function KurvPage() {
  const brandSettings = await getBrand();
  if (!brandSettings.ecommerceEnabled) {
    redirect("/");
  }

  const cart = await getCart();
  const hasItems = cart && cart.items.length > 0;
  const t = await getTranslations("Cart");

  // Mixer 2.0 Phase 4 — designSurfaces. Flag OFF (default) renders the legacy
  // markup below verbatim (byte-identical; Solbrillen/Northbound run this page
  // live). Flag ON renders the design-token-adaptive surface further down.
  const designSurfaces = Boolean(brandSettings.features.designSurfaces);

  if (!designSurfaces) {
    if (!hasItems) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-20 text-center">
          <div>
            <h1 className="text-4xl font-black text-sol-ink sm:text-5xl">
              {t("empty")}
            </h1>
            <p className="mt-3 max-w-md text-base text-sol-muted">
              {t("emptyBody")}
            </p>
          </div>
          <Button href="/produkter">{t("viewAllProducts")}</Button>
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
          {t("title")}
        </h1>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Cart lines */}
          <div className="overflow-hidden rounded-2xl border border-sol-ink/10 bg-sol-cream">
            <div className="flex flex-col divide-y divide-sol-ink/10">
              {cart.items.map((item) => {
                const images = resolveProductImageUrls(item.product);
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
                          {t("noImage")}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/product/${item.product.slug}`}
                        className="line-clamp-2 text-sm font-bold text-sol-ink transition hover:text-sol-accent sm:text-base"
                      >
                        {item.product.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-sol-muted">
                        {formatPriceDkk(item.product.priceDkk)} {t("each")}
                      </p>
                      <div className="mt-3">
                        <CartQuantity
                          cartItemId={item.id}
                          quantity={item.quantity}
                          max={item.product.stock}
                          itemName={item.product.name}
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
          <div className="h-fit rounded-2xl border border-sol-ink/10 bg-sol-cream p-6 shadow-sm lg:sticky lg:top-6">
          <h2 className="mb-5 text-xl font-black text-sol-ink">{t("orderSummary")}</h2>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between text-sm text-sol-ink">
                <span>{t("subtotal")}</span>
                <span className="font-bold">{formatPriceDkk(breakdown.subtotalDkk)}</span>
              </div>

              <div className="flex justify-between text-sm text-sol-ink">
                <span>{t("shipping")}</span>
                <span className="font-bold">
                  {breakdown.shippingDkk === 0
                    ? t("free")
                    : formatPriceDkk(breakdown.shippingDkk)}
                </span>
              </div>

              <div className="h-px bg-sol-ink/10" />

              <div className="flex justify-between text-base font-black text-sol-ink">
                <span>{t("total")}</span>
                <span>{formatPriceDkk(breakdown.totalDkk)}</span>
              </div>
            </div>

            <Button href="/checkout" className="mt-6 w-full">
              {t("goToCheckout")}
            </Button>

            <p className="mt-4 text-center text-xs leading-snug text-sol-muted">
              {t("stockLimitNote")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── designSurfaces ON: the design-token-adaptive cart ─────────────────────
  // Micro-copy is Voice-resolvable (genome) when genomeResolve is also on;
  // otherwise the anchors render — the localized default cart copy
  // (Danish on `da`, English on `en`) via the t() calls below.
  const locale = await getLocale();
  const activeDesign = await getActiveDesign().catch(() => null);
  const CartTemplate = activeDesign?.pages?.cart;
  const anchors = [t("title"), t("empty"), t("emptyBody")] as const;
  const [title, emptyTitle, emptyBody] = brandSettings.features.genomeResolve
    ? await Promise.all([
        readField("cart.title"),
        readField("cart.empty"),
        readField("cart.emptyBody"),
      ]).catch(() => [...anchors])
    : anchors;
  const adaptiveBreakdown = hasItems
    ? calcPriceBreakdown(
        cart.items.map((item) => ({
          unitPriceDkk: item.product.priceDkk,
          quantity: item.quantity,
        })),
        null,
      )
    : null;

  const body = !hasItems ? (
    <DesignSurface className={surface.page}>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-20 text-center">
        <div>
          <h1
            className={`text-4xl font-black tracking-tight sm:text-5xl ${surface.ink}`}
            style={displayFont}
          >
            {emptyTitle}
          </h1>
          <p className={`mt-3 max-w-md text-base ${surface.muted}`}>{emptyBody}</p>
        </div>
        <Button href="/produkter">{t("viewAllProducts")}</Button>
      </div>
    </DesignSurface>
  ) : (
    <DesignSurface className={surface.page}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h1
          className={`mb-8 text-4xl font-black tracking-tight sm:text-5xl ${surface.ink}`}
          style={displayFont}
        >
          {title}
        </h1>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Cart lines */}
          <div className={`overflow-hidden ${surface.card}`}>
            <div className={`flex flex-col divide-y divide-sol-ink/10`}>
              {cart.items.map((item) => {
                const images = resolveProductImageUrls(item.product);
                const firstImage = images[0] ?? null;
                const lineTotal = item.product.priceDkk * item.quantity;

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-4 sm:gap-6 sm:p-6"
                  >
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
                        <span
                          className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${surface.muted}`}
                        >
                          {t("noImage")}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/product/${item.product.slug}`}
                        className={`line-clamp-2 text-sm font-bold transition hover:text-sol-accent sm:text-base ${surface.ink}`}
                      >
                        {item.product.name}
                      </Link>
                      <p className={`mt-0.5 text-xs ${surface.muted}`}>
                        {formatPriceDkk(item.product.priceDkk)} {t("each")}
                      </p>
                      <div className="mt-3">
                        <CartQuantity
                          cartItemId={item.id}
                          quantity={item.quantity}
                          max={item.product.stock}
                          itemName={item.product.name}
                        />
                      </div>
                    </div>

                    <p className={`whitespace-nowrap text-sm font-black sm:text-base ${surface.ink}`}>
                      {formatPriceDkk(lineTotal)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order summary */}
          <div className={`h-fit p-6 lg:sticky lg:top-6 ${surface.card}`}>
            <h2 className={`mb-5 text-xl font-black ${surface.ink}`} style={displayFont}>
              {t("orderSummary")}
            </h2>

            <div className="flex flex-col gap-3">
              <div className={`flex justify-between text-sm ${surface.ink}`}>
                <span>{t("subtotal")}</span>
                <span className="font-bold">{formatPriceDkk(adaptiveBreakdown!.subtotalDkk)}</span>
              </div>

              <div className={`flex justify-between text-sm ${surface.ink}`}>
                <span>{t("shipping")}</span>
                <span className="font-bold">
                  {adaptiveBreakdown!.shippingDkk === 0
                    ? t("free")
                    : formatPriceDkk(adaptiveBreakdown!.shippingDkk)}
                </span>
              </div>

              <div className="h-px bg-sol-ink/10" />

              <div className={`flex justify-between text-base font-black ${surface.ink}`}>
                <span>{t("total")}</span>
                <span>{formatPriceDkk(adaptiveBreakdown!.totalDkk)}</span>
              </div>
            </div>

            <Button href="/checkout" className="mt-6 w-full">
              {t("goToCheckout")}
            </Button>

            <p className={`mt-4 text-center text-xs leading-snug ${surface.muted}`}>
              {t("stockLimitNote")}
            </p>
          </div>
        </div>
      </div>
    </DesignSurface>
  );

  return CartTemplate ? <CartTemplate locale={locale}>{body}</CartTemplate> : body;
}
