/**
 * Northern Coffee — Cartwright Studio's first premium design.
 *
 * Story-first webshop layout for coffee roasters and specialty food shops.
 * No HeroVideo, no big-grid featured-section, no thumbnail categories.
 * Instead: split-screen narrative hero, single "today's roast" oversized
 * feature, typographic chapter-list categories, and a zine-style
 * newsletter CTA.
 *
 * Server Component — alle interaktive ting (cart-add, newsletter form)
 * lever i deres egne nested Client Components hvis nødvendigt. Resten er
 * pure render.
 *
 * Data: tager DesignHomepageProps fra design-registry. Læser shop's
 * featured products + categories, men UI'en er optimeret til small,
 * curated catalogs (3-6 featured, 3-5 categories).
 */
import Image from "next/image";
import Link from "next/link";
import { brand } from "@/brand.config";
import { LIFESTYLE_IMAGE } from "@/lib/images";
import type { DesignHomepageProps } from "../types";

export default function NorthernCoffeeHomepage({
  settings,
  featured = [],
  categories = [],
}: DesignHomepageProps) {
  const heroImage = settings?.heroImage || LIFESTYLE_IMAGE;
  const todaysRoast = featured[0]; // First featured = today's hero
  const otherFeatured = featured.slice(1, 5); // Next 4 as supporting grid
  const issueNumber = String(
    // eslint-disable-next-line react-hooks/purity -- Server Component render; weekly-rotating editorial issue number, intentionally time-derived once per render.
    Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7)) % 100,
  ).padStart(2, "0");

  return (
    <div className="min-h-screen bg-nc-cream font-sans text-nc-ink">
      {/* ───── 1. SPLIT-SCREEN STORY HERO ───── */}
      <section className="grid min-h-[80vh] grid-cols-1 md:grid-cols-[1fr_1fr]">
        {/* Left: image */}
        <div className="relative aspect-[4/5] md:aspect-auto md:min-h-[80vh]">
          <Image
            src={heroImage}
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>

        {/* Right: editorial copy */}
        <div className="flex items-center justify-center bg-nc-cream-hi px-8 py-16 md:px-16 lg:px-24">
          <div className="max-w-md space-y-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-nc-muted">
              Issue №{issueNumber} · This week&apos;s letter
            </p>
            <h1 className="font-serif text-5xl font-medium leading-[1.05] tracking-tight text-nc-ink sm:text-6xl">
              {settings?.websiteHeadline || "Coffee with a name and a place."}
            </h1>
            <p className="font-serif text-lg italic leading-relaxed text-nc-muted">
              {settings?.tagline ||
                "Every bag traces back to a farm, a farmer, and a harvest. We roast small, label by hand, and send within seven days."}
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <Link
                href="/produkter"
                className="inline-flex h-12 items-center justify-center rounded-none border-2 border-nc-ink bg-nc-ink px-8 text-sm font-bold uppercase tracking-widest text-nc-cream transition-colors hover:bg-nc-accent hover:border-nc-accent"
              >
                Shop the catalog
              </Link>
              <Link
                href="/info/om-os"
                className="inline-flex h-12 items-center justify-center rounded-none border-2 border-nc-ink bg-transparent px-8 text-sm font-bold uppercase tracking-widest text-nc-ink transition-colors hover:bg-nc-ink hover:text-nc-cream"
              >
                Meet the roaster
              </Link>
            </div>
            <p className="border-t border-nc-line pt-6 text-xs leading-relaxed text-nc-muted">
              Roasted in {brand.company?.city || "Copenhagen"} ·{" "}
              {brand.company?.country || "Denmark"} · Free shipping over{" "}
              {Math.floor((brand.policies?.shippingFreeThresholdDkk || 49900) / 100)} kr
            </p>
          </div>
        </div>
      </section>

      {/* ───── 2. TODAY'S ROAST — single oversized feature ───── */}
      {todaysRoast ? (
        <section className="border-t border-nc-line bg-nc-cream">
          <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
            <div className="mb-12 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-nc-accent">
                ☕ Today&apos;s roast
              </p>
              <h2 className="mt-3 font-serif text-4xl italic text-nc-ink sm:text-5xl">
                Featured this week
              </h2>
            </div>

            <Link
              href={`/product/${todaysRoast.slug}`}
              className="group grid grid-cols-1 items-center gap-12 md:grid-cols-[1.2fr_1fr] md:gap-20"
            >
              <div className="relative aspect-square overflow-hidden bg-nc-sand">
                {todaysRoast.imageUrl ? (
                  <Image
                    src={todaysRoast.imageUrl}
                    alt={todaysRoast.name}
                    fill
                    sizes="(min-width: 768px) 60vw, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-6xl text-nc-muted/30">
                    ☕
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <span className="inline-flex items-center gap-2 rounded-full border border-nc-forest bg-nc-forest/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-nc-forest">
                  <span className="size-1.5 rounded-full bg-nc-forest" />
                  Fresh batch
                </span>
                <h3 className="font-serif text-5xl font-medium leading-[1.05] tracking-tight text-nc-ink sm:text-6xl">
                  {todaysRoast.name}
                </h3>
                <p className="font-serif text-lg leading-relaxed text-nc-muted">
                  {todaysRoast.description
                    ? todaysRoast.description.slice(0, 240) +
                      (todaysRoast.description.length > 240 ? "…" : "")
                    : "A small-batch single origin from a partner farm we've worked with for three seasons. Honey-processed, slow-dried, and roasted light to keep the fruit forward."}
                </p>
                <div className="flex items-baseline gap-6 pt-4">
                  <span className="font-serif text-4xl font-medium text-nc-ink">
                    {Math.floor(todaysRoast.priceDkk / 100)} kr
                  </span>
                  <span className="font-mono text-xs uppercase tracking-widest text-nc-accent group-hover:underline">
                    Read the story →
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </section>
      ) : null}

      {/* ───── 3. THE REST — small grid of other featured ───── */}
      {otherFeatured.length > 0 ? (
        <section className="border-t border-nc-line bg-nc-cream-hi">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <header className="mb-12 flex items-end justify-between gap-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-nc-accent">
                  Also in the shop
                </p>
                <h2 className="mt-3 font-serif text-3xl italic text-nc-ink sm:text-4xl">
                  The shelf
                </h2>
              </div>
              <Link
                href="/produkter"
                className="hidden whitespace-nowrap font-mono text-xs uppercase tracking-widest text-nc-accent hover:underline md:inline"
              >
                See all →
              </Link>
            </header>

            <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 md:grid-cols-4">
              {otherFeatured.map((product) => (
                <Link
                  key={product.id}
                  href={`/product/${product.slug}`}
                  className="group block space-y-4"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-nc-sand">
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        sizes="(min-width: 768px) 25vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-4xl text-nc-muted/30">
                        ☕
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-medium leading-tight text-nc-ink group-hover:text-nc-accent">
                      {product.name}
                    </h3>
                    <p className="mt-2 font-mono text-xs text-nc-muted">
                      {Math.floor(product.priceDkk / 100)} kr
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ───── 4. BREWING-GUIDE PROMO STRIP ───── */}
      <section className="border-t border-nc-line bg-nc-roast-bg text-nc-cream">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-24 md:grid-cols-[2fr_1fr] md:py-32">
          <div className="space-y-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-nc-cream/60">
              Brewing notes · No.{issueNumber}
            </p>
            <h2 className="font-serif text-4xl italic leading-tight text-nc-cream sm:text-5xl">
              How to brew like we do —{" "}
              <span className="text-nc-accent">notes from our bar</span>
            </h2>
            <p className="max-w-xl font-serif text-lg leading-relaxed text-nc-cream/70">
              We&apos;ve written down everything we know about extraction, grind
              size, and ratios. Not a manual — more like notes from someone
              who&apos;s spent a decade thinking about it.
            </p>
          </div>
          <div className="flex items-end md:justify-end">
            <Link
              href="/info/brewing"
              className="inline-flex h-12 items-center justify-center rounded-none border-2 border-nc-cream bg-transparent px-8 text-sm font-bold uppercase tracking-widest text-nc-cream transition-colors hover:bg-nc-cream hover:text-nc-ink"
            >
              Read the guide →
            </Link>
          </div>
        </div>
      </section>

      {/* ───── 5. TYPOGRAPHIC CATEGORY LIST ───── */}
      {categories.length > 0 ? (
        <section className="border-t border-nc-line bg-nc-cream">
          <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
            <header className="mb-12 max-w-2xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-nc-accent">
                Browse the shop
              </p>
              <h2 className="mt-3 font-serif text-4xl italic text-nc-ink sm:text-5xl">
                By chapter
              </h2>
            </header>

            <ul className="divide-y divide-nc-line border-y border-nc-line">
              {categories.map((category, idx) => (
                <li key={category.id}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="group flex items-baseline justify-between gap-8 py-8 transition-colors hover:bg-nc-cream-hi"
                  >
                    <div className="flex items-baseline gap-8">
                      <span className="font-mono text-xs text-nc-muted/60">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="font-serif text-4xl italic text-nc-ink transition-colors group-hover:text-nc-accent sm:text-5xl">
                        {category.name}
                      </span>
                    </div>
                    <span className="font-mono text-xs uppercase tracking-widest text-nc-muted opacity-0 transition-opacity group-hover:opacity-100">
                      Read →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ───── 6. ZINE-STYLE NEWSLETTER ───── */}
      <section className="border-t border-nc-line bg-nc-sand">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-nc-accent">
            The seasonal letter
          </p>
          <h2 className="mt-3 font-serif text-4xl italic leading-tight text-nc-ink sm:text-5xl">
            A short letter, six times a year.
          </h2>
          <p className="mx-auto mt-6 max-w-xl font-serif text-lg leading-relaxed text-nc-muted">
            New roasts, new origins, the occasional brewing note, and the
            occasional discount. No spam, no third-party tracking, unsubscribe
            anytime.
          </p>
          <form
            action="/api/newsletter/subscribe"
            method="post"
            className="mx-auto mt-10 flex w-full max-w-md flex-col gap-3 sm:flex-row"
          >
            <input
              name="email"
              type="email"
              required
              placeholder="your@email.com"
              className="h-12 flex-1 rounded-none border-2 border-nc-ink bg-nc-cream px-4 font-mono text-sm text-nc-ink placeholder-nc-muted focus:border-nc-accent focus:outline-none"
            />
            <button
              type="submit"
              className="h-12 whitespace-nowrap rounded-none border-2 border-nc-ink bg-nc-ink px-8 text-sm font-bold uppercase tracking-widest text-nc-cream transition-colors hover:bg-nc-accent hover:border-nc-accent"
            >
              Subscribe
            </button>
          </form>
          <p className="mt-6 text-[11px] uppercase tracking-widest text-nc-muted">
            Issued by hand from {brand.company?.city || "Copenhagen"}
          </p>
        </div>
      </section>
    </div>
  );
}
