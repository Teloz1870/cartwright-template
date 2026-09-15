/**
 * Webshop Minimal — Apple-inspired full-bleed hero + oversized typography.
 *
 * Mindre, mere fokuseret end webshop-classic. Bruger ÉT featured product
 * som hero-billede (forventer settings.heroImage), 2-col featured-grid
 * (færre, større produkter), og ingen kategori-grid på forsiden — bare
 * "Shop all"-CTA. Premium DTC-look.
 *
 * Genbruger Cartwright atoms: ProductGrid, Button. Custom layout-logik
 * lever her i denne fil — ingen ny atom-komponent nødvendig.
 */
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/Button";
import { ProductGrid } from "@/components/ProductGrid";
import { LIFESTYLE_IMAGE } from "@/lib/images";
import { brand } from "@/brand.config";
import type { DesignHomepageProps } from "../types";

export default function WebshopMinimalHomepage({
  settings,
  featured = [],
}: DesignHomepageProps) {
  const heroImg = settings?.heroImage || LIFESTYLE_IMAGE;
  const tagline = settings?.tagline || brand.uiLabels.heroSubtagline;
  const headline = settings?.websiteHeadline || "The new collection";

  // Top-3 produkter går i 2-col + 1-wide grid. Resten skjules.
  const heroProducts = featured.slice(0, 2);
  const featureProducts = featured.slice(2, 6);

  return (
    <div className="min-h-screen bg-white text-sol-ink dark:bg-sol-ink dark:text-white">
      {/* Hero: full-bleed image + minimal typography */}
      <section className="relative h-[90vh] w-full overflow-hidden">
        <Image
          src={heroImg}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        <div className="container relative mx-auto flex h-full items-end px-6 pb-20 sm:pb-28">
          <div className="max-w-3xl space-y-6">
            <h1 className="text-[clamp(3.5rem,10vw,9rem)] font-black leading-[0.85] tracking-tight text-white">
              {headline}
            </h1>
            <p className="max-w-xl text-lg font-medium text-white/80 sm:text-xl">
              {tagline}
            </p>
            <div className="pt-4">
              <Button
                href="/produkter"
                variant="primary"
                className="h-14 bg-white px-10 text-base text-sol-ink hover:bg-white/90"
              >
                Shop all
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Featured: 2-col oversized grid */}
      {heroProducts.length > 0 ? (
        <section className="container mx-auto grid grid-cols-1 gap-6 px-6 py-20 md:grid-cols-2 md:gap-10">
          {heroProducts.map((product) => (
            <Link
              key={product.id}
              href={`/product/${product.slug}`}
              className="group block overflow-hidden"
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-sol-sand dark:bg-sol-sand">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                ) : null}
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-4">
                <h3 className="text-2xl font-black tracking-tight">
                  {product.name}
                </h3>
                <span className="text-lg font-bold text-sol-muted dark:text-white/60">
                  {(product.priceDkk / 100).toFixed(0)} kr
                </span>
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      {/* Featured-overflow grid (rest af produkter, mindre) */}
      {featureProducts.length > 0 ? (
        <section className="container mx-auto px-6 pb-20">
          <h2 className="mb-8 text-3xl font-black tracking-tight">More</h2>
          <ProductGrid products={featureProducts} />
        </section>
      ) : null}

      {/* Single CTA-strip (i stedet for category-grid) */}
      <section className="bg-sol-ink py-24 text-white dark:bg-white dark:text-sol-ink">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-5xl font-black leading-tight tracking-tight sm:text-6xl">
            Browse the catalog
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg font-medium text-white/70 dark:text-sol-muted">
            Every product. No filler.
          </p>
          <div className="mt-10">
            <Button
              href="/produkter"
              variant="primary"
              className="h-14 bg-white px-10 text-base text-sol-ink hover:bg-white/90 dark:bg-sol-ink dark:text-white"
            >
              See all products
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
