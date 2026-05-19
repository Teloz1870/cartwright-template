import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { ProductGrid } from "@/components/ProductGrid";
import TrustBadges from "@/components/TrustBadges";
import JsonLd from "@/components/JsonLd";
import CategoryHeroVideo from "@/components/CategoryHeroVideo";
import { CATEGORY_IMAGES, SCENIC_IMAGE, LIFESTYLE_IMAGE } from "@/lib/images";
import { renderContentBlocks, renderInlineMarkdown } from "@/lib/content";

type Props = { params: Promise<{ slug: string }> };

type FaqItem = { q: string; a: string };

/** Parse Category.faq JSON-string til typed array — returnerer [] hvis tom/ugyldig. */
function parseFaq(raw: string | null | undefined): FaqItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is FaqItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as FaqItem).q === "string" &&
        typeof (item as FaqItem).a === "string",
    );
  } catch {
    return [];
  }
}

/** Resolve hero-image med 3-niveau fallback: DB → static mapping → generic. */
function resolveHeroImage(slug: string, dbImage: string | null): string {
  return dbImage ?? CATEGORY_IMAGES[slug] ?? SCENIC_IMAGE;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) return { title: "Kategori ikke fundet" };

  // Fallback: hvis kategori ikke har egen metaTitle, byg en generic baseret på
  // brand.storeName. Drop "solbriller"-suffix for at være domain-agnostisk —
  // kategori-navnet er ofte selvforklarende ("Herresolbriller", "Sport", etc.).
  const title = category.metaTitle ?? `${category.name} — ${brand.storeName}`;
  const description =
    category.metaDescription ??
    category.description ??
    brand.metadata.description;
  const url = `${brand.url}/kategori/${slug}`;
  const image = resolveHeroImage(slug, category.heroImage);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: brand.storeName,
      images: [{ url: image, width: 1200, height: 630, alt: category.name }],
      locale: "da_DK",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) notFound();

  const [products, relatedCategories] = await Promise.all([
    prisma.product.findMany({
      where: { categoryId: category.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.category.findMany({
      where: { slug: { not: slug } },
      take: 4,
    }),
  ]);

  const heroImage = resolveHeroImage(slug, category.heroImage);
  const faqItems = parseFaq(category.faq);
  const contentBlocks = category.descriptionLong
    ? renderContentBlocks(category.descriptionLong)
    : [];

  // JSON-LD BreadcrumbList — for Google's site-link breadcrumbs i SERP
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Forside",
        item: brand.url,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: brand.uiLabels.categoryAllProductsBreadcrumb,
        item: `${brand.url}/produkter`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: category.name,
        item: `${brand.url}/kategori/${slug}`,
      },
    ],
  };

  // JSON-LD FAQPage — kun hvis vi har FAQ. Giver rich-snippets i SERP (Q+A list).
  const faqJsonLd =
    faqItems.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqItems.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.a,
            },
          })),
        }
      : null;

  return (
    <div>
      <JsonLd data={breadcrumbJsonLd} />
      {faqJsonLd && <JsonLd data={faqJsonLd} />}

      {/* === 1. HERO BAND === */}
      <div className="relative h-64 w-full overflow-hidden px-6 sm:h-80">
        {category.heroVideo ? (
          <CategoryHeroVideo
            videoUrl={category.heroVideo}
            posterImage={heroImage}
            alt={category.name}
          />
        ) : (
          <Image
            src={heroImage}
            alt={category.name}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-sol-ink/80 via-sol-ink/45 to-sol-ink/10" />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end pb-10">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-white/75">
            Kategori
          </p>
          <h1
            className="mt-2 text-5xl font-black uppercase tracking-tight text-white sm:text-6xl"
            style={{ textShadow: "0 2px 16px rgba(0, 0, 0, 0.45)" }}
          >
            {category.name}
          </h1>
          <p className="mt-2 text-lg font-medium text-white/85">
            {products.length} {products.length === 1 ? "produkt" : "produkter"}
            {category.description ? ` · ${category.description}` : ""}
          </p>
        </div>
      </div>

      {/* === 2. TRUST BADGES (smal stripe direkte under hero) === */}
      <section className="border-b border-sol-glass-border-dark bg-sol-cream py-4">
        <div className="mx-auto max-w-5xl px-4">
          <TrustBadges variant="category" />
        </div>
      </section>

      {/* === 3. PRODUCT GRID — above-the-fold prioritet === */}
      <section className="mx-auto max-w-7xl px-6 py-10 sm:py-12">
        <ProductGrid products={products} prioritizeAboveFold={4} />
      </section>

      {/* === 4. LONG-FORM SEO-CONTENT (nedenfor produkter) ===
          UX-prioritet er produkterne. Long-form bruger preview-paragraf
          (altid synlig) + "Læs mere"-toggle der expander resten på klik.
          SEO: hele content er i HTML-output (Google indekserer selv collapsed
          <details>-content), så ingen SEO-tab. */}
      {contentBlocks.length > 0 && (
        <section className="bg-sol-cream py-12">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="mb-5 text-2xl font-black text-sol-ink sm:text-3xl">
              Mere om {category.name.toLowerCase()}
            </h2>

            {/* Preview: første paragraf altid synlig — giver kontekst uden wall-of-text */}
            {contentBlocks[0]?.type === "paragraph" && (
              <p className="whitespace-pre-line text-base leading-8 text-sol-ink sm:text-lg">
                {renderInlineMarkdown(contentBlocks[0].text)}
              </p>
            )}

            {/* Resten af content kollapset bag "Læs mere"-toggle */}
            {contentBlocks.length > 1 && (
              <details className="group mt-5">
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-full bg-sol-accent px-5 py-2.5 text-sm font-black uppercase tracking-wider text-white transition hover:bg-sol-accent/90 sm:w-fit">
                  <span className="group-open:hidden">
                    Læs mere om {category.name.toLowerCase()}
                  </span>
                  <span className="hidden group-open:inline">
                    Skjul mere
                  </span>
                  <span
                    aria-hidden
                    className="transition-transform group-open:rotate-180"
                  >
                    ▾
                  </span>
                </summary>
                <div className="mt-6">
                  {contentBlocks.slice(1).map((block, idx) =>
                    block.type === "heading" ? (
                      <h3
                        key={idx}
                        className="mt-8 mb-3 text-xl font-black text-sol-ink first:mt-0 sm:text-2xl"
                      >
                        {block.text}
                      </h3>
                    ) : (
                      <p
                        key={idx}
                        className="mt-4 whitespace-pre-line text-base leading-8 text-sol-ink first:mt-0 sm:text-lg"
                      >
                        {renderInlineMarkdown(block.text)}
                      </p>
                    ),
                  )}
                </div>
              </details>
            )}
          </div>
        </section>
      )}

      {/* === 5. FAQ === */}
      {faqItems.length > 0 && (
        <section className="bg-sol-cream py-14">
          <div className="mx-auto max-w-3xl px-4">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-sol-muted">
              Spørgsmål & svar
            </p>
            <h2 className="mt-2 text-3xl font-black text-sol-ink sm:text-4xl">
              Hvad du måske gerne vil vide
            </h2>
            <div className="mt-8 space-y-3">
              {faqItems.map((item, idx) => (
                <details
                  key={idx}
                  className="sol-card-elevated group overflow-hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-base font-bold text-sol-ink transition hover:bg-white/50 sm:text-lg">
                    <span>{item.q}</span>
                    <span
                      aria-hidden
                      className="shrink-0 text-sol-accent transition-transform group-open:rotate-180"
                    >
                      ▾
                    </span>
                  </summary>
                  <div className="border-t border-sol-glass-border-dark px-5 py-4 text-sm leading-7 text-sol-muted sm:text-base">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* === 6. RELATED CATEGORIES === */}
      {relatedCategories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="mb-6 text-2xl font-black text-sol-ink sm:mb-8 sm:text-3xl">
            Udforsk også
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {relatedCategories.map((cat) => {
              const img =
                cat.heroImage ?? CATEGORY_IMAGES[cat.slug] ?? LIFESTYLE_IMAGE;
              return (
                <Link
                  key={cat.id}
                  href={`/kategori/${cat.slug}`}
                  className="group relative h-32 overflow-hidden rounded-2xl sm:h-40"
                >
                  <Image
                    src={img}
                    alt=""
                    fill
                    sizes="(min-width: 640px) 25vw, 50vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sol-ink/70 via-sol-ink/20 to-transparent" />
                  <span className="absolute bottom-3 left-3 right-3">
                    <span
                      className="inline-flex rounded-full border border-white/30 bg-white/25 px-3 py-1.5 text-sm font-black leading-tight text-white backdrop-blur-md transition-colors duration-300 group-hover:border-white/50 group-hover:bg-white/35"
                      style={{ textShadow: "0 1px 6px rgba(0, 0, 0, 0.55)" }}
                    >
                      {cat.name}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* === 7. CTA === */}
      {brand.features.aiStylist && (
        <section className="bg-sol-accent-deep py-14 text-white">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-sol-sun">
              {brand.ai.assistantLabel}
            </p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">
              Brug for hjælp til at vælge?
            </h2>
            <p className="mt-4 text-base leading-7 text-white/80 sm:text-lg">
              Vores AI-stylist hjælper dig med at finde den rigtige model baseret
              på din ansigtsform, brug og budget. Stil et spørgsmål, så foreslår
              den 3-5 modeller fra {category.name.toLowerCase()}-kollektionen.
            </p>
            <p className="mt-6 text-sm text-white/65">
              Klik på {brand.ai.assistantLabel}-knappen nederst i højre hjørne ↘
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
