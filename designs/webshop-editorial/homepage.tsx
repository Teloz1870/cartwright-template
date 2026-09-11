/**
 * Webshop Editorial — magazine-style story-driven layout.
 *
 * Split-screen hero (image + editorial copy), blanding af produkter +
 * "story-cards" der ligner blog-uddrag, kategorier som typografiske
 * billboards (ingen billeder — kun big-type + accent-line).
 *
 * Mål: shops der sælger via story-telling (vintage, artisan, brand med
 * fortælling, lifestyle), ikke spec-sheets.
 */
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/Button";
import { LIFESTYLE_IMAGE } from "@/lib/images";
import type { DesignHomepageProps } from "../types";

export default function WebshopEditorialHomepage({
  settings,
  featured = [],
  categories = [],
}: DesignHomepageProps) {
  const heroImg = settings?.heroImage || LIFESTYLE_IMAGE;
  const headline =
    settings?.websiteHeadline || "Stories from our makers";
  const tagline =
    settings?.tagline ||
    "Each piece comes with a name, a hand, and a place. Browse the latest collection and the people behind it.";

  return (
    <div className="min-h-screen bg-sol-cream text-sol-ink dark:bg-sol-ink dark:text-white">
      {/* Split-screen hero */}
      <section className="grid grid-cols-1 md:grid-cols-2 md:min-h-[80vh]">
        <div className="relative aspect-[4/5] md:aspect-auto">
          <Image
            src={heroImg}
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="flex items-center bg-sol-sand px-8 py-16 dark:bg-sol-sand sm:px-12 md:px-16 lg:px-24">
          <div className="max-w-xl space-y-8">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-sol-accent">
              The latest issue
            </p>
            <h1 className="font-serif text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              {headline}
            </h1>
            <p className="font-serif text-lg italic leading-relaxed text-sol-muted dark:text-white/70 sm:text-xl">
              {tagline}
            </p>
            <div className="pt-4">
              <Button href="/produkter" variant="primary" className="h-12 px-8">
                Read the issue
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Editorial product cards (alternating left/right) */}
      {featured.length > 0 ? (
        <section className="container mx-auto px-6 py-24 space-y-24">
          <header className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-sol-accent">
              Selected this month
            </p>
            <h2 className="mt-3 font-serif text-4xl font-bold tracking-tight sm:text-5xl">
              The shop floor
            </h2>
          </header>

          {featured.slice(0, 4).map((product, idx) => (
            <article
              key={product.id}
              className={`grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16 ${
                idx % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
              }`}
            >
              <Link
                href={`/product/${product.slug}`}
                className="relative block aspect-[4/5] overflow-hidden bg-sol-sand"
              >
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 hover:scale-[1.02]"
                  />
                ) : null}
              </Link>
              <div className="space-y-5">
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-sol-muted dark:text-white/60">
                  Story №{String(idx + 1).padStart(2, "0")}
                </p>
                <h3 className="font-serif text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                  {product.name}
                </h3>
                <p className="font-serif text-lg leading-relaxed text-sol-muted dark:text-white/70">
                  {product.description?.slice(0, 200) ??
                    "A handcrafted piece from the latest collection. Each item is unique — small variations are not flaws but signatures of the maker."}
                </p>
                <div className="flex items-baseline gap-4 pt-2">
                  <span className="text-xl font-bold">
                    {(product.priceDkk / 100).toFixed(0)} kr
                  </span>
                  <Link
                    href={`/product/${product.slug}`}
                    className="font-mono text-xs uppercase tracking-widest text-sol-accent hover:underline"
                  >
                    Read more →
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {/* Categories as typographic billboards (no images) */}
      {categories.length > 0 ? (
        <section className="border-t border-sol-ink/10 bg-sol-sand py-24 dark:border-white/10 dark:bg-sol-sand">
          <div className="container mx-auto px-6">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-sol-accent">
              By department
            </p>
            <h2 className="mt-3 max-w-2xl font-serif text-4xl font-bold tracking-tight sm:text-5xl">
              Browse the floors
            </h2>
            <ul className="mt-12 divide-y divide-sol-ink/10 dark:divide-white/10">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="group flex items-baseline justify-between gap-8 py-8 transition-colors hover:text-sol-accent"
                  >
                    <span className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
                      {category.name}
                    </span>
                    <span className="font-mono text-sm uppercase tracking-widest text-sol-muted opacity-0 transition-opacity group-hover:opacity-100 dark:text-white/60">
                      View →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
