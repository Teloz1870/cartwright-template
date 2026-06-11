/**
 * Hoptify design — homepage.
 *
 * Cartwrights kærlige pendant til Shopify: et velkendt, rent webshop-look (frisk
 * grøn accent — VORES nuance, ikke Shopifys — store produktkort, masser af luft)
 * men med Cartwright-magien under og et glimt i øjet ("Hop off Shopify",
 * "Powered by Cartwright"). Tydeligt parodi/switch-kampagne, ikke en klon.
 *
 * Server Component (data fra page.tsx via props). Bruger sol-* tokens (Hoptify-
 * paletten mappes hertil via applyPaletteAsTheme).
 */
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/Button";
import { ProductGrid } from "@/components/ProductGrid";
import TrustBadges from "@/components/TrustBadges";
import { CATEGORY_IMAGES, LIFESTYLE_IMAGE } from "@/lib/images";
import type { DesignHomepageProps } from "../types";

export default function HoptifyHomepage({
  settings,
  featured = [],
  categories = [],
}: DesignHomepageProps) {
  return (
    <div className="min-h-screen bg-sol-cream text-sol-ink">
      {/* Hero — lyst, rent "store"-look med frisk grøn accent. */}
      <section className="relative overflow-hidden border-b border-sol-ink/5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sol-accent/12 via-sol-cream to-sol-sand" />
        <div className="container relative mx-auto grid items-center gap-8 px-4 py-16 sm:py-24 md:grid-cols-2">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-sol-accent/12 px-3 py-1 text-xs font-black uppercase tracking-widest text-sol-accent">
              ● Hoptify — powered by Cartwright
            </span>
            <h1 className="text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
              Din butik.
              <br />
              <span className="text-sol-accent">Uden huslejen.</span>
            </h1>
            <p className="max-w-md text-lg font-medium leading-8 text-sol-muted">
              {settings?.tagline ??
                "Alt det du kender fra de store — produkter, checkout, temaer — men på en AI-først motor du selv ejer. Hop af. Behold pengene."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button href="/produkter" variant="primary">
                Shop nu
              </Button>
              <Link
                href="/admin/hoptify"
                className="inline-flex items-center rounded-xl border-2 border-sol-ink/15 px-5 py-3 text-sm font-black text-sol-ink transition hover:border-sol-accent hover:text-sol-accent"
              >
                Importér fra Shopify →
              </Link>
            </div>
          </div>
          <div className="relative hidden aspect-[4/3] overflow-hidden rounded-3xl border border-sol-ink/10 shadow-xl shadow-sol-ink/10 md:block">
            <Image src={LIFESTYLE_IMAGE} alt="" fill sizes="40vw" className="object-cover" priority />
          </div>
        </div>
      </section>

      {/* Bestsellers */}
      <section className="container mx-auto px-4 py-12 sm:py-16">
        <div className="mb-6 flex items-end justify-between gap-3">
          <h2 className="text-2xl font-black sm:text-3xl">Bestsellers</h2>
          <Link href="/produkter" className="text-xs font-black uppercase tracking-widest text-sol-accent hover:underline sm:text-sm">
            Se alle
          </Link>
        </div>
        <ProductGrid products={featured} />
      </section>

      {/* Switch-pitch — drillende sammenligning */}
      <section className="bg-sol-accent py-14 text-white">
        <div className="container mx-auto grid gap-8 px-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <h2 className="text-3xl font-black leading-tight sm:text-4xl">Hop off Shopify.</h2>
            <p className="mt-3 text-white/85">På 2 minutter. Vi tager dine produkter og dit look med.</p>
          </div>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
            {[
              ["0 kr", "i månedlig “husleje”"],
              ["AI-først", "Genome, agent-commerce, GEO"],
              ["Du ejer den", "Open engine, ingen lock-in"],
            ].map(([big, small]) => (
              <div key={big} className="rounded-2xl bg-white/10 p-5">
                <p className="text-2xl font-black">{big}</p>
                <p className="mt-1 text-sm text-white/80">{small}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Kategorier */}
      {categories.length > 0 && (
        <section className="container mx-auto px-4 py-12 sm:py-16">
          <h2 className="mb-6 text-2xl font-black sm:text-3xl">Shop efter kategori</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="group relative h-36 overflow-hidden rounded-2xl sm:h-48"
              >
                <Image
                  src={category.heroImage ?? CATEGORY_IMAGES[category.slug] ?? LIFESTYLE_IMAGE}
                  alt=""
                  fill
                  sizes="(min-width:640px) 25vw, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sol-ink/70 to-transparent" />
                <span className="absolute bottom-3 left-3 right-3 text-sm font-black text-white" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.55)" }}>
                  {category.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="bg-sol-sand py-10">
        <div className="container mx-auto px-4">
          <TrustBadges variant="homepage" />
          <p className="mt-6 text-center text-xs font-bold uppercase tracking-widest text-sol-muted">
            Powered by Cartwright 2.0 Engine
          </p>
        </div>
      </section>
    </div>
  );
}
