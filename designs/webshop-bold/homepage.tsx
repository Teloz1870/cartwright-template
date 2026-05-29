/**
 * Webshop Bold — neo-brutalism / DTC-modern.
 *
 * High-contrast color-blocks, thick borders, zero shadows. 3-col grid
 * med subtle rotation på thumbnails (CSS transform), kæmpe pris-tags,
 * "ADD TO CART" knapper i caps. Inspireret af DTC-brands som Glossier
 * (early), Allbirds, og brutalism web-trenden.
 *
 * Bruger NY palette: terracotta + sort + electric-yellow accent. Override
 * sol-* tokens fra design.md så det matcher.
 */
import Image from "next/image";
import Link from "next/link";
import { LIFESTYLE_IMAGE } from "@/lib/images";
import { brand } from "@/brand.config";
import type { DesignHomepageProps } from "../types";

export default function WebshopBoldHomepage({
  settings,
  featured = [],
  categories = [],
}: DesignHomepageProps) {
  const headline =
    settings?.websiteHeadline || "EVERYTHING YOU NEED. NOTHING YOU DON'T.";
  const tagline =
    settings?.tagline || brand.uiLabels.heroSubtagline;

  return (
    <div
      className="min-h-screen text-cw-ink"
      style={{
        backgroundColor: "var(--color-bold-paper, #fef3c7)", // electric-yellow paper
        color: "var(--color-bold-ink, #0a0a0b)",
      }}
    >
      {/* Hero: color-block + thick border */}
      <section
        className="border-b-[6px] border-cw-ink px-6 py-20 sm:py-28"
        style={{
          backgroundColor: "var(--color-bold-accent, #d97757)", // terracotta
        }}
      >
        <div className="mx-auto max-w-6xl">
          <h1 className="text-[clamp(2.5rem,8vw,7rem)] font-black uppercase leading-[0.9] tracking-tighter text-white">
            {headline}
          </h1>
          <p className="mt-8 max-w-2xl text-xl font-bold uppercase tracking-wide text-white sm:text-2xl">
            {tagline}
          </p>
          <div className="mt-10">
            <Link
              href="/produkter"
              className="inline-block border-[4px] border-cw-ink bg-white px-10 py-5 text-base font-black uppercase tracking-widest text-cw-ink transition-transform hover:translate-x-[-3px] hover:translate-y-[-3px] hover:shadow-[6px_6px_0_0_var(--color-bold-ink,#0a0a0b)]"
            >
              Shop now ↓
            </Link>
          </div>
        </div>
      </section>

      {/* Featured: 3-col grid med rotation */}
      {featured.length > 0 ? (
        <section className="border-b-[6px] border-cw-ink px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-12 text-4xl font-black uppercase tracking-tight sm:text-5xl">
              Hot drops
            </h2>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {featured.slice(0, 6).map((product, idx) => {
                const rotation =
                  idx % 3 === 0 ? "rotate-[-1deg]" : idx % 3 === 1 ? "rotate-[1deg]" : "rotate-0";
                return (
                  <Link
                    key={product.id}
                    href={`/product/${product.slug}`}
                    className={`group block ${rotation} transform transition-transform hover:rotate-0 hover:scale-[1.02]`}
                  >
                    <div className="relative aspect-square overflow-hidden border-[4px] border-cw-ink bg-white">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-4">
                      <h3 className="text-lg font-black uppercase leading-tight tracking-tight">
                        {product.name}
                      </h3>
                      <span
                        className="border-[3px] border-cw-ink px-3 py-1 text-base font-black"
                        style={{
                          backgroundColor: "var(--color-bold-oker, #e8b339)",
                        }}
                      >
                        {(product.priceDkk / 100).toFixed(0)} kr
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* Categories: chunky 3D-look buttons */}
      {categories.length > 0 ? (
        <section className="border-b-[6px] border-cw-ink px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-12 text-4xl font-black uppercase tracking-tight sm:text-5xl">
              Browse by category
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {categories.map((category, idx) => (
                <Link
                  key={category.id}
                  href={`/category/${category.slug}`}
                  className="group block transform border-[4px] border-cw-ink bg-white p-6 text-center font-black uppercase tracking-tight transition-transform hover:translate-x-[-3px] hover:translate-y-[-3px] hover:shadow-[6px_6px_0_0_var(--color-bold-ink,#0a0a0b)]"
                  style={{
                    backgroundColor:
                      idx % 3 === 0
                        ? "var(--color-bold-oker, #e8b339)"
                        : idx % 3 === 1
                          ? "white"
                          : "var(--color-bold-accent, #d97757)",
                    color: idx % 3 === 2 ? "white" : "var(--color-bold-ink, #0a0a0b)",
                  }}
                >
                  <span className="text-xl sm:text-2xl">{category.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Final CTA strip */}
      <section
        className="px-6 py-24 text-center"
        style={{
          backgroundColor: "var(--color-bold-ink, #0a0a0b)",
          color: "white",
        }}
      >
        <h2 className="mx-auto max-w-3xl text-4xl font-black uppercase leading-tight tracking-tight sm:text-6xl">
          See it. Want it. Get it.
        </h2>
        <div className="mt-10">
          <Link
            href="/produkter"
            className="inline-block border-[4px] border-white bg-transparent px-12 py-5 text-base font-black uppercase tracking-widest text-white transition-transform hover:translate-x-[-3px] hover:translate-y-[-3px] hover:shadow-[6px_6px_0_0_var(--color-bold-accent,#d97757)]"
          >
            Shop everything
          </Link>
        </div>
      </section>
    </div>
  );
}
