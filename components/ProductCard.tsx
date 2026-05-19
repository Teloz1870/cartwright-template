import Image from "next/image";
import Link from "next/link";
import type { Product } from "@prisma/client";
import { brand } from "@/brand.config";
import { formatPriceDkk } from "@/lib/format";
import { parseProductImages } from "@/lib/products";

// Task B: udvidet Product-type så ProductCard kan vise "fra X kr" når
// produkt har varianter med forskellige priser. variants? er optional
// så eksisterende kald-steder med ren Product fortsætter med at virke.
type ProductWithMaybeVariants = Product & {
  variants?: Array<{ priceDkk: number }>;
};

export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductWithMaybeVariants;
  /** Task E: pass-through til <Image priority/> for above-fold LCP-cards. */
  priority?: boolean;
}) {
  const images = parseProductImages(product.images);
  const firstImage = images[0] ?? null;
  // "fra X kr" når variants har en pris under product.priceDkk
  const variantPrices = product.variants?.map((v) => v.priceDkk) ?? [];
  const minVariantPrice = variantPrices.length ? Math.min(...variantPrices) : null;
  const showFromPrice =
    minVariantPrice !== null && minVariantPrice < product.priceDkk;
  const displayPrice = showFromPrice ? minVariantPrice : product.priceDkk;

  return (
    <Link
      href={`/produkt/${product.slug}`}
      className="sol-card-base group block overflow-hidden hover:-translate-y-[2px] hover:shadow-[var(--shadow-sol-card)] hover:border-sol-accent/20"
    >
      {/* Image-pane: hvidt bg lader produktet "lyse" frem for sand-tone som er
          for varm. Sand bevares til highlight-sections rundt om grid. */}
      <div className="relative aspect-square bg-white">
        {firstImage ? (
          <Image
            src={firstImage}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain p-3 transition-transform duration-300 group-hover:scale-105 sm:p-6"
            priority={priority}
          />
        ) : (
          <div className="h-full w-full bg-sol-sun/40" />
        )}

        {/* Badges stacked at top-left so they don't collide on narrow cards.
            Whole card is already a link, so a separate "Quick View" affordance
            would be redundant — omitted. */}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1 sm:left-3 sm:top-3 sm:gap-1.5">
          {product.featured && (
            <span className="rounded-full bg-sol-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-md shadow-sol-accent/30 sm:px-2.5 sm:py-1 sm:text-[10px]">
              Summer Edition
            </span>
          )}
          {/* "Designed in Denmark" skjules på mobil for at undgå at to badges spiser hele billedet på 2-col grid */}
          <span className="hidden items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sol-ink shadow-sm sm:inline-flex">
            <svg
              aria-hidden="true"
              viewBox="0 0 28 20"
              className="h-2.5 w-3.5 overflow-hidden rounded-[1px]"
            >
              <rect width="28" height="20" fill="#c60c30" />
              <rect x="8" width="3" height="20" fill="#fff" />
              <rect y="8.5" width="28" height="3" fill="#fff" />
            </svg>
            {/* UL8.5: badge-tekst fra brand.uiLabels så fork-shops kan ændre */}
            {brand.uiLabels.productCardOriginBadge}
          </span>
        </div>

        {product.stock === 0 && (
          <span className="absolute bottom-3 left-3 rounded-full bg-sol-ink px-3 py-1 text-xs font-bold text-white shadow-sm">
            Udsolgt
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 p-4">
        {product.brand && (
          <p className="text-xs uppercase tracking-widest text-sol-muted">
            {product.brand}
          </p>
        )}
        <h3 className="text-sm font-black leading-tight text-sol-ink">
          {product.name}
        </h3>
        <p className="mt-1 text-lg font-black text-sol-accent">
          {showFromPrice ? "fra " : ""}
          {formatPriceDkk(displayPrice)}
        </p>
      </div>
    </Link>
  );
}
