/**
 * Atelier — Cartwright Studio's second premium design.
 *
 * Museum-minimal luxury layout. Full-bleed hero with tiny brand-mark,
 * ALL-CAPS sparse navigation, single-row horizontal-scroll featured
 * collection, editorial about + journal sections. Built for fashion,
 * jewelry, leather goods.
 *
 * Server Component — newsletter form er det eneste interaktive element,
 * og det er en native form-post. Everything else is render-only.
 */
import Image from "next/image";
import Link from "next/link";
import { brand } from "@/brand.config";
import { LIFESTYLE_IMAGE } from "@/lib/images";
import type { DesignHomepageProps } from "../types";

export default function AtelierHomepage({
  settings,
  featured = [],
  categories = [],
}: DesignHomepageProps) {
  const heroImage = settings?.heroImage || LIFESTYLE_IMAGE;
  const collectionName =
    settings?.websiteHeadline || "Capsule N°04";
  const tagline =
    settings?.tagline ||
    "A small collection. Considered fabrics, slow construction, made to outlast a season.";

  return (
    <div className="min-h-screen bg-at-cream font-sans text-at-ink">
      {/* ───── 1. FULL-BLEED HERO ───── */}
      <section className="relative h-screen w-full overflow-hidden">
        <Image
          src={heroImage}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-at-overlay" />

        {/* Brand mark — top left */}
        <div className="absolute left-8 top-8 z-10 md:left-12 md:top-12">
          <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-at-cream">
            {brand.storeName || "Atelier"}
          </span>
        </div>

        {/* Sparse navigation — top right */}
        <nav className="absolute right-8 top-8 z-10 hidden md:right-12 md:top-12 md:block">
          <ul className="flex gap-10 font-mono text-[10px] uppercase tracking-[0.3em] text-at-cream">
            <li>
              <Link href="/produkter" className="hover:text-at-accent">
                Shop
              </Link>
            </li>
            <li>
              <Link href="/info/om-os" className="hover:text-at-accent">
                Atelier
              </Link>
            </li>
            <li>
              <Link href="/info/journal" className="hover:text-at-accent">
                Journal
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-at-accent">
                Contact
              </Link>
            </li>
          </ul>
        </nav>

        {/* Centered collection-line — bottom */}
        <div className="absolute inset-x-0 bottom-20 z-10 text-center md:bottom-28">
          <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.5em] text-at-cream/70">
            The new collection
          </p>
          <h1 className="font-serif text-5xl font-light leading-[0.95] tracking-tight text-at-cream sm:text-7xl md:text-8xl">
            {collectionName}
          </h1>
          <p className="mx-auto mt-6 max-w-md px-6 font-serif text-sm italic leading-relaxed text-at-cream/85 sm:text-base">
            {tagline}
          </p>
        </div>

        {/* Scroll cue — bottom center */}
        <div className="absolute inset-x-0 bottom-6 z-10 text-center">
          <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-at-cream/50">
            Scroll
          </span>
        </div>
      </section>

      {/* ───── 2. INDEX STRIP — meta-info bar ───── */}
      <section className="border-y border-at-line bg-at-cream">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-at-line md:grid-cols-4">
          <Stat label="Pieces" value={String(featured.length || categories.length || 0).padStart(2, "0")} />
          <Stat label="Made in" value={brand.company?.country || "Denmark"} />
          <Stat label="Issue" value="No.04" />
          <Stat label="Season" value="A/W 26" />
        </div>
      </section>

      {/* ───── 3. SINGLE-ROW HORIZONTAL FEATURED COLLECTION ───── */}
      {featured.length > 0 ? (
        <section className="bg-at-cream py-32">
          <div className="mx-auto max-w-7xl">
            <header className="mb-16 px-6 md:px-12">
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-at-accent">
                The collection
              </p>
              <h2 className="mt-4 font-serif text-4xl font-light italic leading-tight tracking-tight text-at-ink sm:text-5xl">
                Pieces I.–{toRoman(featured.length)}
              </h2>
            </header>

            <div className="-mr-6 overflow-x-auto pb-4 md:-mr-12">
              <div className="flex gap-6 px-6 md:px-12">
                {featured.slice(0, 6).map((product, idx) => (
                  <Link
                    key={product.id}
                    href={`/product/${product.slug}`}
                    className="group flex w-[78vw] flex-shrink-0 flex-col gap-5 md:w-[42vw] lg:w-[34vw]"
                  >
                    <div className="relative aspect-[3/4] overflow-hidden bg-at-sand">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          sizes="(min-width: 1024px) 34vw, (min-width: 768px) 42vw, 78vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-4xl text-at-muted/30">
                          ◇
                        </div>
                      )}

                      {/* Numbered overlay */}
                      <div className="absolute left-4 top-4 z-10">
                        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-at-cream mix-blend-difference">
                          {String(idx + 1).padStart(2, "0")} / {String(Math.min(featured.length, 6)).padStart(2, "0")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="font-serif text-xl font-light leading-tight tracking-tight text-at-ink group-hover:text-at-accent">
                        {product.name}
                      </h3>
                      <span className="whitespace-nowrap font-mono text-xs uppercase tracking-widest text-at-accent">
                        {Math.floor(product.priceDkk / 100)} kr
                      </span>
                    </div>
                  </Link>
                ))}

                {/* Trailing card — "See all" CTA */}
                <Link
                  href="/produkter"
                  className="flex w-[78vw] flex-shrink-0 items-center justify-center border border-at-line bg-at-sand transition-colors hover:border-at-ink md:w-[42vw] lg:w-[34vw]"
                >
                  <span className="font-mono text-xs uppercase tracking-[0.3em] text-at-ink hover:text-at-accent">
                    See the whole collection →
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ───── 4. EDITORIAL ABOUT — full-bleed split ───── */}
      <section className="border-t border-at-line bg-at-sand">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-0 md:grid-cols-2">
          <div className="relative aspect-square md:aspect-auto md:min-h-[600px]">
            <Image
              src={heroImage}
              alt=""
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          <div className="flex items-center px-8 py-24 md:px-16 lg:px-24">
            <div className="max-w-md space-y-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-at-accent">
                The atelier
              </p>
              <h2 className="font-serif text-4xl font-light italic leading-[1.05] tracking-tight text-at-ink sm:text-5xl">
                A small studio. A few pieces. Made well.
              </h2>
              <p className="font-serif text-base leading-relaxed text-at-muted">
                We work from one room in {brand.company?.city || "Copenhagen"}. Every piece is cut and finished
                by hand. We make small runs because we don&apos;t believe in surplus, and we
                stock only what we&apos;d wear ourselves.
              </p>
              <p className="font-serif text-base italic leading-relaxed text-at-muted">
                — {brand.company?.legalName || brand.storeName}, {brand.company?.country || "Denmark"}
              </p>
              <Link
                href="/info/om-os"
                className="inline-flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-at-ink hover:text-at-accent"
              >
                Read the full story →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ───── 5. CATEGORIES — typographic index ───── */}
      {categories.length > 0 ? (
        <section className="bg-at-cream py-32">
          <div className="mx-auto max-w-4xl px-6">
            <header className="mb-16 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-at-accent">
                By category
              </p>
              <h2 className="mt-4 font-serif text-4xl font-light italic text-at-ink sm:text-5xl">
                Index
              </h2>
            </header>

            <ul className="divide-y divide-at-stone">
              {categories.map((category, idx) => (
                <li key={category.id}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="group flex items-baseline justify-between gap-8 py-7 transition-colors"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-at-muted">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-center font-serif text-3xl font-light tracking-tight text-at-ink transition-colors group-hover:text-at-accent sm:text-4xl">
                      {category.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-at-muted opacity-0 transition-opacity group-hover:opacity-100">
                      View
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ───── 6. JOURNAL TEASER — inverted dark section ───── */}
      <section className="bg-at-noir py-32">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-at-accent">
            Journal · Issue 04
          </p>
          <h2 className="mt-4 font-serif text-4xl font-light italic leading-[1.05] text-at-cream sm:text-5xl md:text-6xl">
            Notes on weaving, dyeing, and the people we work with.
          </h2>
          <Link
            href="/info/journal"
            className="mt-12 inline-flex items-center gap-3 border-b border-at-cream/30 pb-1 font-mono text-xs uppercase tracking-[0.3em] text-at-cream transition-colors hover:border-at-accent hover:text-at-accent"
          >
            Read the journal →
          </Link>
        </div>
      </section>

      {/* ───── 7. NEWSLETTER — minimal subscribe ───── */}
      <section className="border-t border-at-line bg-at-cream py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-at-accent">
            Inscribe your name
          </p>
          <h2 className="mt-4 font-serif text-3xl font-light italic leading-tight text-at-ink sm:text-4xl">
            Twice a year. New pieces only.
          </h2>
          <form
            action="/api/newsletter/subscribe"
            method="post"
            className="mx-auto mt-10 flex w-full max-w-sm flex-col gap-px"
          >
            <input
              name="email"
              type="email"
              required
              placeholder="YOUR EMAIL"
              className="h-12 border border-at-ink bg-transparent px-4 text-center font-mono text-[11px] uppercase tracking-[0.3em] text-at-ink placeholder-at-muted focus:border-at-accent focus:outline-none"
            />
            <button
              type="submit"
              className="h-12 border border-at-ink bg-at-ink font-mono text-[11px] uppercase tracking-[0.3em] text-at-cream transition-colors hover:border-at-accent hover:bg-at-accent"
            >
              Subscribe
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-at-cream px-6 py-5 text-center">
      <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-at-muted">
        {label}
      </p>
      <p className="mt-2 font-serif text-xl font-light tracking-tight text-at-ink">
        {value}
      </p>
    </div>
  );
}

function toRoman(n: number): string {
  const numerals: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let result = "";
  for (const [v, s] of numerals) {
    while (n >= v) {
      result += s;
      n -= v;
    }
  }
  return result || "I";
}
