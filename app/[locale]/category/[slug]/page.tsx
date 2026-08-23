import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { ProductGrid } from "@/components/ProductGrid";
import { getActiveDesign } from "@/lib/theme";
import TrustBadges from "@/components/TrustBadges";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/Breadcrumbs";
import { homeBreadcrumbLabel } from "@/lib/breadcrumbs";
import CategoryHeroVideo from "@/components/CategoryHeroVideo";
import { CATEGORY_IMAGES, SCENIC_IMAGE, LIFESTYLE_IMAGE } from "@/lib/images";
import { renderContentBlocks, renderInlineMarkdown } from "@/lib/content";
import { hreflangFor } from "@/i18n/routing";
import { ogLocale } from "@/lib/og";
import { isAnnotateEditEnabled } from "@/lib/annotate/server";
import { editAttr } from "@/components/annotate/editAttr";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";
import { readEntityCopy } from "@/lib/genome/read";
import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
} from "@/lib/storefront-jsonld";

type Props = { params: Promise<{ slug: string; locale: string }> };

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
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);
  const [category, resolvedBrand] = await Promise.all([
    prisma.category.findUnique({ where: { slug } }),
    getBrand(),
  ]);
  if (!category) return { title: "Category not found" };

  const categoryName = await getDynamicTranslation(
    category,
    "name",
    category.name,
    locale,
  );
  const categoryDescription = await getDynamicTranslation(
    category,
    "description",
    category.description,
    locale,
  );

  // Fallback: hvis kategori ikke har egen metaTitle, byg en generic baseret på
  // brand.storeName. Drop "solbriller"-suffix for at være domain-agnostisk —
  // kategori-navnet er ofte selvforklarende ("Herresolbriller", "Sport", etc.).
  const title = category.metaTitle ?? `${categoryName} — ${resolvedBrand.storeName}`;
  // `||` chain: empty ("") translated/base description falls back to the brand
  // description rather than emitting an empty meta description.
  const description =
    category.metaDescription || categoryDescription || resolvedBrand.metadata.description;
  const url = `${resolvedBrand.url}/${locale}/category/${slug}`;
  const image = resolveHeroImage(slug, category.heroImage);
  // Phase 10 Slice 6: hreflang alternates på multi-locale shops.
  const hreflangFlag = (resolvedBrand.features as { hreflang?: boolean }).hreflang;
  const languages = hreflangFlag
    ? hreflangFor(`/{locale}/category/${slug}`, resolvedBrand.url)
    : undefined;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      ...(languages && Object.keys(languages).length > 0 ? { languages } : {}),
    },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: resolvedBrand.storeName,
      images: [{ url: image, width: 1200, height: 630, alt: categoryName }],
      locale: ogLocale(locale),
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
  const brandSettings = await getBrand();
  if (!brandSettings.ecommerceEnabled) {
    redirect("/");
  }

  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);

  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) notFound();

  const shouldTranslate = locale !== brandSettings.defaultLocale;
  const [categoryName, categoryDescription, categoryDescriptionLong] =
    shouldTranslate
      ? await Promise.all([
          getDynamicTranslation(category, "name", category.name, locale),
          getDynamicTranslation(
            category,
            "description",
            category.description,
            locale,
          ),
          getDynamicTranslation(
            category,
            "descriptionLong",
            category.descriptionLong,
            locale,
          ),
        ])
      : [
          category.name,
          category.description ?? "",
          category.descriptionLong ?? "",
        ];

  // Per-entity voiced copy (genomeEntityCopy, default-off): prefer a genome
  // entity-override over the category's own description. Flag-off → identical.
  const categoryDescriptionVoiced = (brandSettings.features as { genomeEntityCopy?: boolean })
    .genomeEntityCopy
    ? await readEntityCopy("category", category.id, "description", categoryDescription)
    : categoryDescription;

  // Phase G fail-soft (2026-05-28): same pattern as PRs #51/#52 — DB drift
  // on one column shouldn't 500 the whole category page.
  const [products, relatedCategories] = await Promise.all([
    prisma.product
      .findMany({
        where: { categoryId: category.id },
        orderBy: { createdAt: "desc" },
      })
      .catch((err) => {
        console.error("[category] product.findMany failed, falling back to []:", err);
        return [];
      }),
    prisma.category
      .findMany({
        where: { slug: { not: slug } },
        take: 4,
      })
      .catch((err) => {
        console.error("[category] relatedCategories failed, falling back to []:", err);
        return [];
      }),
  ]);
  const [localizedProducts, localizedRelatedCategories]: [
    typeof products,
    typeof relatedCategories,
  ] = shouldTranslate
    ? await Promise.all([
        Promise.all(
          products.map(async (product) => {
            const [name, description] = await Promise.all([
              getDynamicTranslation(product, "name", product.name, locale),
              getDynamicTranslation(
                product,
                "description",
                product.description,
                locale,
              ),
            ]);
            return { ...product, name, description };
          }),
        ),
        Promise.all(
          relatedCategories.map(async (relatedCategory) => {
            const [name, description] = await Promise.all([
              getDynamicTranslation(
                relatedCategory,
                "name",
                relatedCategory.name,
                locale,
              ),
              getDynamicTranslation(
                relatedCategory,
                "description",
                relatedCategory.description,
                locale,
              ),
            ]);
            return { ...relatedCategory, name, description };
          }),
        ),
      ])
    : [products, relatedCategories];

  const heroImage = resolveHeroImage(slug, category.heroImage);
  const faqItems = parseFaq(category.faq);
  const editEnabled = await isAnnotateEditEnabled();
  const contentBlocks = categoryDescriptionLong
    ? renderContentBlocks(categoryDescriptionLong)
    : [];

  // JSON-LD BreadcrumbList — for Google's site-link breadcrumbs i SERP
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    {
      "@type": "ListItem",
      position: 1,
      name: homeBreadcrumbLabel(locale),
      item: brandSettings.url,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: brandSettings.uiLabels.categoryAllProductsBreadcrumb,
      item: `${brandSettings.url}/${locale}/produkter`,
    },
    {
      "@type": "ListItem",
      position: 3,
      name: categoryName,
      item: `${brandSettings.url}/${locale}/category/${slug}`,
    },
  ]);

  // JSON-LD FAQPage — kun hvis vi har FAQ. Giver rich-snippets i SERP (Q+A list).
  const faqJsonLd = buildFaqJsonLd(faqItems);

  // JSON-LD ItemList — gør kategoriens sortiment maskin-synligt (tidligere
  // emitterede category-siden kun Breadcrumb + evt. FAQ, så AI ikke kunne se
  // hvilke produkter kategorien indeholder). No-locale PDP-stier som PDP'en.
  const itemListJsonLd =
    localizedProducts.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: categoryName,
          numberOfItems: localizedProducts.length,
          itemListElement: localizedProducts.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${brandSettings.url}/${locale}/product/${p.slug}`,
            name: p.name,
          })),
        }
      : null;

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      {faqJsonLd && <JsonLd data={faqJsonLd} />}
      {itemListJsonLd && <JsonLd data={itemListJsonLd} />}

      <div>

      {/* === 1. HERO BAND === */}
      <div className="relative h-64 w-full overflow-hidden px-6 sm:h-80">
        {category.heroVideo ? (
          <CategoryHeroVideo
            videoUrl={category.heroVideo}
            posterImage={heroImage}
            alt={categoryName}
          />
        ) : (
          <Image
            src={heroImage}
            alt={categoryName}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-sol-ink/80 via-sol-ink/45 to-sol-ink/10" />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end pb-10">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-white/75">
            Category
          </p>
          <h1
            className="mt-2 text-5xl font-black uppercase tracking-tight text-white sm:text-6xl"
            style={{ textShadow: "0 2px 16px rgba(0, 0, 0, 0.45)" }}
            {...editAttr({ kind: "category", slug, field: "name" }, editEnabled)}
          >
            {categoryName}
          </h1>
          <p className="mt-2 text-lg font-medium text-white/85">
            {localizedProducts.length} {localizedProducts.length === 1 ? "product" : "products"}
            {categoryDescriptionVoiced ? ` · ${categoryDescriptionVoiced}` : ""}
          </p>
        </div>
      </div>

      {/* Visible breadcrumb trail (mirrors the BreadcrumbList JSON-LD above). */}
      {brandSettings.features.breadcrumbs ? (
        <div className="bg-sol-cream pt-4">
          <div className="mx-auto max-w-5xl px-4">
            <Breadcrumbs
              items={[
                // Labels mirror this page's BreadcrumbList JSON-LD exactly.
                { label: homeBreadcrumbLabel(locale), href: `/${locale}` },
                {
                  label: brandSettings.uiLabels.categoryAllProductsBreadcrumb,
                  href: `/${locale}/produkter`,
                },
                { label: categoryName },
              ]}
            />
          </div>
        </div>
      ) : null}

      {/* === 2. TRUST BADGES (smal stripe direkte under hero) === */}
      <section className="border-b border-sol-glass-border-dark bg-sol-cream py-4">
        <div className="mx-auto max-w-5xl px-4">
          <TrustBadges variant="category" />
        </div>
      </section>

      {/* === 3. PRODUCT GRID — above-the-fold prioritet === */}
      <section className="mx-auto max-w-7xl px-6 py-10 sm:py-12">
        <ProductGrid
          products={localizedProducts}
          prioritizeAboveFold={4}
          card={(await getActiveDesign().catch(() => null))?.webshop?.productCard}
          locale={locale}
        />
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
              More about {categoryName.toLowerCase()}
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
                    Read more about {categoryName.toLowerCase()}
                  </span>
                  <span className="hidden group-open:inline">
                    Show less
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
              Questions and answers
            </p>
            <h2 className="mt-2 text-3xl font-black text-sol-ink sm:text-4xl">
              What you may want to know
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
      {localizedRelatedCategories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="mb-6 text-2xl font-black text-sol-ink sm:mb-8 sm:text-3xl">
            Explore more
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {localizedRelatedCategories.map((cat) => {
              const img =
                cat.heroImage ?? CATEGORY_IMAGES[cat.slug] ?? LIFESTYLE_IMAGE;
              return (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
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
      {brandSettings.features.aiStylist && (
        <section className="bg-sol-accent-deep py-14 text-white">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-sol-sun">
              {brandSettings.ai.assistantLabel}
            </p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">
              Need help choosing?
            </h2>
            <p className="mt-4 text-base leading-7 text-white/80 sm:text-lg">
              Our AI assistant helps you find the right product based on your
              needs, use case, and budget. Ask a question and it will suggest
              3-5 options from the {categoryName.toLowerCase()} collection.
            </p>
            <p className="mt-6 text-sm text-white/65">
              Click the {brandSettings.ai.assistantLabel} button in the bottom-right corner.
            </p>
          </div>
        </section>
      )}
      </div>
    </>
  );
}
