/**
 * Crema — bespoke product card (DesignPack.webshop.productCard).
 *
 * The KompositZaun card principle translated to coffee: near-identical bags
 * become distinguishable at a glance through their `Product.attributes` —
 * roast dots (data-driven 1–4), origin badge on the photo, origin · process
 * subtitle, tasting-note chips, bag-weight pill, and an honest "≈ price/kg"
 * that renders ONLY when the weight is known (never a wrong number — the
 * line is omitted instead). Products without attributes degrade to the plain
 * photo/name/price card.
 *
 * Server component; ProductGrid renders it on the PLP + category pages when
 * crema is active. Carries its own `.crema-scope` root + font variables since
 * those pages render outside the homepage's `.crema-root`.
 */
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Price } from "@/components/Price";
import { TransitionLink } from "@/components/TransitionLink";
import { resolveProductImageUrls } from "@/lib/media/shim";
import type { DesignProduct } from "../../types";
import { cremaFontVars } from "../fonts";
import { parseLocalizedCoffeeAttributes, perKgOere } from "./attributes";
import "../crema.css";

export function CremaProductCard({ product }: { product: DesignProduct }) {
  const locale = useLocale();
  const t = useTranslations("Crema");
  const a = parseLocalizedCoffeeAttributes(product, locale);
  const roast = a.roast;
  const firstImage = resolveProductImageUrls(product)[0] ?? null;
  const perKg = perKgOere(product.priceDkk, a.weightG);
  const subtitle = [a.origin, a.process].filter(Boolean).join(" · ");

  return (
    <TransitionLink
      href={`/${locale}/product/${encodeURIComponent(product.slug)}`}
      className={`${cremaFontVars} crema-scope crema-pcard group block`}
    >
      <span className="crema-pcard-media">
        {firstImage ? (
          <Image
            src={firstImage}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : null}
        {/* Cinematic card video (the engine's videoUrl feature) — layered OVER
            the image so prefers-reduced-motion can simply hide the video and
            the still frame underneath takes over (crema.css guard). */}
        {product.videoUrl ? (
          <video
            className="crema-pcard-video"
            src={product.videoUrl}
            poster={firstImage ?? undefined}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : null}
        {a.origin ? <span className="crema-pcard-badge">{a.origin}</span> : null}
        {product.stock === 0 ? (
          <span className="crema-pcard-soldout">{t("cardSoldOut")}</span>
        ) : null}
      </span>

      <span className="block space-y-2.5 p-5">
        {roast !== null ? (
          <span className="flex items-center justify-between gap-3">
            <span className="crema-dots" aria-hidden>
              {[1, 2, 3, 4].map((dot) => (
                <i key={dot} {...(dot <= roast ? { "data-on": "" } : {})} />
              ))}
            </span>
            <span className="crema-pcard-roast">{t(`cardRoast${roast}`)}</span>
          </span>
        ) : null}

        <span className="crema-display block text-xl leading-tight">
          {product.name}
        </span>

        {subtitle ? <span className="crema-pcard-sub block">{subtitle}</span> : null}

        {a.notes.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {a.notes.slice(0, 2).map((note) => (
              <span key={note} className="crema-chip">
                {note}
              </span>
            ))}
          </span>
        ) : null}

        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
          <span className="text-lg font-semibold text-[var(--crema-copper-hi)]">
            <Price oere={product.priceDkk} />
          </span>
          {a.weightG !== null ? (
            <span className="crema-pill">{a.weightG} g</span>
          ) : null}
          {perKg !== null ? (
            <span className="crema-pcard-perkg">
              ≈ <Price oere={perKg} /> {t("cardPerKg")}
            </span>
          ) : null}
        </span>
      </span>
    </TransitionLink>
  );
}
