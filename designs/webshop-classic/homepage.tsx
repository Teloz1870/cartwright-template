/**
 * Webshop Classic design — homepage-orchestrator.
 *
 * Pre-v0.7.0 var dette inline-renderet i app/[locale]/page.tsx lines 91-230
 * (den eneste webshop-design der eksisterede). Extracted som første-class
 * DesignPack så vi kan adde flere webshop-varianter (PR J: minimal /
 * editorial / bold) parallel uden at touch app/[locale]/page.tsx.
 *
 * Render uændret 1:1 fra inline-versionen. Bruger:
 *   - HeroVideo            — loopende baggrundsvideo + poster + saveData-gating
 *   - ProductGrid          — featured products (4 stk)
 *   - LIFESTYLE_IMAGE      — pitch-section midten
 *   - CATEGORY_IMAGES      — per-slug kategori-billede-fallback
 *   - TrustBadges          — footer-strip
 *
 * Server Component (datafetch sker i page.tsx, vi får dem som props).
 */
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/Button";
import { ProductGrid } from "@/components/ProductGrid";
import HeroVideo from "@/components/HeroVideo";
import TrustBadges from "@/components/TrustBadges";
import { CATEGORY_IMAGES, LIFESTYLE_IMAGE } from "@/lib/images";
import { brand } from "@/brand.config";
import type { DesignHomepageProps } from "../types";
import { getTranslations } from "next-intl/server";

export default async function WebshopClassicHomepage({
  settings,
  locale,
  featured = [],
  categories = [],
}: DesignHomepageProps) {
  const tSf = await getTranslations({ locale, namespace: "Storefront" });
  return (
    <div className="min-h-screen bg-sol-cream">
      {/* Hero: loopende baggrundsvideo med poster-fallback og saveData-gating. */}
      <section className="hero-section relative flex min-h-[60vh] items-end overflow-hidden pb-12 pt-20 text-white sm:min-h-[70vh] sm:pb-16 md:min-h-[92svh] md:pb-24">
        <HeroVideo />

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 90% at 15% 50%, rgba(26,26,26,0.55) 0%, rgba(26,26,26,0.25) 40%, transparent 70%)",
          }}
        />

        <div className="container relative mx-auto px-4">
          <div className="max-w-2xl space-y-5 sm:space-y-6">
            {settings?.announcement ? (
              <p
                className="hero-fade-up text-[11px] font-black uppercase tracking-[0.3em] text-white/95 sm:text-xs"
                style={{ textShadow: "0 2px 14px rgba(0, 0, 0, 0.55)" }}
              >
                {settings.announcement}
              </p>
            ) : null}

            <h1
              className="hero-fade-up text-4xl font-medium leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl"
              style={{ textShadow: "0 3px 24px rgba(0, 0, 0, 0.55)" }}
            >
              {brand.uiLabels.heroTitle}
            </h1>

            <p
              className="hero-fade-up max-w-xl text-base font-medium leading-7 text-white/90 sm:text-lg"
              style={{ textShadow: "0 2px 16px rgba(0, 0, 0, 0.5)" }}
            >
              {settings?.tagline ?? brand.uiLabels.heroSubtagline}
            </p>

            <div className="hero-fade-up relative inline-flex overflow-hidden rounded-2xl border border-white/20 bg-[var(--color-sol-glass-ethereal)] px-5 py-3 shadow-lg shadow-sol-ink/20 backdrop-blur-md before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-b before:from-white/40 before:to-transparent">
              <Button href="/produkter" variant="primary">
                {brand.uiLabels.heroCta}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10 sm:py-16">
        <div className="mb-6 flex items-end justify-between gap-3 sm:mb-8">
          <h2 className="text-2xl font-black text-sol-ink sm:text-3xl">{tSf("mostPopular")}</h2>
          <Link
            href="/produkter"
            className="whitespace-nowrap text-xs font-black uppercase tracking-widest text-sol-accent hover:underline sm:text-sm"
          >
            {tSf("viewAll")}
          </Link>
        </div>
        <ProductGrid products={featured} />
      </section>

      <section className="grid md:grid-cols-2">
        <div className="relative h-56 overflow-hidden sm:h-80 md:h-auto md:min-h-[480px]">
          <Image
            src={LIFESTYLE_IMAGE}
            alt=""
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="flex items-center bg-sol-accent px-4 py-10 text-white sm:px-8 sm:py-16 lg:px-16">
          <div className="max-w-xl">
            <h2 className="text-3xl font-black leading-tight sm:text-5xl">
              {brand.uiLabels.pitchSectionHeading}
            </h2>
            <p className="mt-4 text-base font-medium leading-7 text-white/85 sm:mt-5 sm:text-lg sm:leading-8">
              {brand.uiLabels.pitchSectionBody}
            </p>
            <div className="mt-8">
              <Button
                href="/produkter"
                variant="ghost"
                className="border-white text-white hover:bg-white hover:text-sol-ink"
              >
                Browse the catalog
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10 sm:py-16">
        <h2 className="mb-6 text-2xl font-black text-sol-ink sm:mb-8 sm:text-3xl">
          Shop by category
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {categories.map((category, index) => (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              className={`group relative h-36 overflow-hidden rounded-2xl sm:h-52 ${
                index === categories.length - 1 && categories.length % 2 === 1
                  ? "col-span-2 sm:col-span-1"
                  : ""
              }`}
            >
              <Image
                src={
                  category.heroImage ??
                  CATEGORY_IMAGES[category.slug] ??
                  LIFESTYLE_IMAGE
                }
                alt=""
                fill
                sizes="(min-width: 1024px) 20vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sol-ink/70 via-sol-ink/20 to-transparent before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent" />
              <span className="absolute bottom-3 left-3 right-3 sm:bottom-5 sm:left-5 sm:right-5">
                <span
                  className="inline-flex rounded-full border border-white/30 bg-white/25 px-3 py-1.5 text-sm font-black leading-tight text-white backdrop-blur-md transition-colors duration-300 group-hover:border-white/50 group-hover:bg-white/35 sm:px-4 sm:py-2 sm:text-base"
                  style={{ textShadow: "0 1px 6px rgba(0, 0, 0, 0.55)" }}
                >
                  {category.name}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-sol-sand py-10">
        <div className="container mx-auto px-4">
          <TrustBadges variant="homepage" />
        </div>
      </section>
    </div>
  );
}
