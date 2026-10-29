import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getBrand, type MergedBrand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { LIVE_PRODUCT_WHERE } from "@/lib/product-visibility";
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
import { productHref, categoryHref, localeHref } from "@/lib/urls";
import {
  CATEGORY_TREE_SELECT,
  categoryAncestorCrumbs,
  categoryProductsWhere,
} from "@/lib/category-tree";
import { findLinkedCategoryIds } from "@/lib/category-links";
import { CategorySkeleton } from "./category-skeleton";

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
  const baseUrl = resolvedBrand.url.replace(/\/+$/, "");
  const encodedSlug = encodeURIComponent(slug);
  const url = `${baseUrl}${categoryHref({ slug: encodedSlug, permalink: category.permalink }, locale)}`;
  const image = resolveHeroImage(slug, category.heroImage);
  // Multi-locale shops always expose alternates; single-locale forks get an
  // empty map from hreflangFor and therefore emit no misleading tags.
  const languages = hreflangFor(
    categoryHref({ slug: encodedSlug, permalink: category.permalink }, "{locale}"),
    resolvedBrand.url,
  );

  return {
    title,
    description,
    alternates: {
      canonical: url,
      ...(Object.keys(languages).length > 0 ? { languages } : {}),
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

/**
 * The category a slug names, with its number of subcategories: the one lookup
 * that decides the status also says whether the page needs the tree.
 */
function findCategory(slug: string) {
  return prisma.category.findUnique({
    where: { slug },
    include: { _count: { select: { children: true } } },
  });
}

/** The whole category tree (fail-soft to []). */
function findCategoryTree() {
  return prisma.category.findMany({ select: CATEGORY_TREE_SELECT }).catch((err) => {
    console.error("[category] category tree failed, falling back to []:", err);
    return [];
  });
}

type FoundCategory = NonNullable<Awaited<ReturnType<typeof findCategory>>>;
type CategoryTree = Awaited<ReturnType<typeof findCategoryTree>>;

/**
 * SOFT-404-PDP-PLP, as on the PDP: the redirect and the lookup that decide the
 * HTTP status run here, before any Suspense boundary — a streamed response is
 * already a 200 once a fallback renders, so a `notFound()` behind one became a
 * `noindex` page served with 200. The skeleton covers only what comes after.
 */
export default async function CategoryPage({ params }: Props) {
  const brandSettings = await getBrand();
  if (!brandSettings.ecommerceEnabled) {
    redirect("/");
  }

  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);

  // The lookup alone decides the status: a 404 reads nothing more.
  const category = await findCategory(slug);
  if (!category) notFound();

  return (
    <Suspense fallback={<CategorySkeleton />}>
      <CategoryDetail brandSettings={brandSettings} category={category} slug={slug} locale={locale} />
    </Suspense>
  );
}

async function CategoryDetail({
  brandSettings,
  category,
  slug,
  locale,
}: {
  brandSettings: MergedBrand;
  category: FoundCategory;
  slug: string;
  locale: string;
}) {
  // WP2-r1′: the tree serves the descendant rollup and the breadcrumb's parent
  // chain, so only a category with a parent or children reads it — never one
  // of a flat shop (WP2-TREE-READ-COST). Fail-soft to [] = the page as it was
  // before the tree: only its own products, no ancestors. Started here and
  // awaited at the product query, so it runs beside the copy reads.
  const categoryTreeRead: Promise<CategoryTree> =
    category.parentId !== null || category._count.children > 0 ? findCategoryTree() : Promise.resolve([]);
  // WP2-r2′: products filed here as an EXTRA category are listed too; none
  // linked anywhere = the product query below is the one it always was.
  const linkedRead = findLinkedCategoryIds("category");

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

  const [categoryTree, linked] = await Promise.all([categoryTreeRead, linkedRead]);

  // Phase G fail-soft (2026-05-28): same pattern as PRs #51/#52 — DB drift
  // on one column shouldn't 500 the whole category page.
  const [products, relatedCategories] = await Promise.all([
    prisma.product
      .findMany({
        // A parent lists its subcategories' products too (products sit in the
        // leaves after a WooCommerce import); a leaf keeps `{ categoryId }`.
        // A soft-deleted product (schema rule) and a draft have no page, so
        // neither is listed, counted or put in the ItemList — whether it sits
        // here as its primary category or as an extra one (WP2-r2′).
        where: { ...categoryProductsWhere(categoryTree, category.id, linked), ...LIVE_PRODUCT_WHERE },
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
  const tCatalog = await getTranslations({ locale, namespace: "Catalog" });
  const contentBlocks = categoryDescriptionLong
    ? renderContentBlocks(categoryDescriptionLong)
    : [];

  // Parent chain, root first — empty for a top-level category (and for every
  // category of a shop that nests none), so both trails stay as they were.
  const ancestorCrumbs = categoryAncestorCrumbs(categoryTree, category.id, locale);

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
      item: `${brandSettings.url}${localeHref("/produkter", locale)}`,
    },
    ...ancestorCrumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: 3 + i,
      name: crumb.label,
      item: `${brandSettings.url}${crumb.href}`,
    })),
    {
      "@type": "ListItem",
      position: 3 + ancestorCrumbs.length,
      name: categoryName,
      item: `${brandSettings.url}${categoryHref({ slug, permalink: category.permalink }, locale)}`,
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
            url: `${brandSettings.url}${productHref({ slug: p.slug, permalink: p.permalink }, locale)}`,
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
                { label: homeBreadcrumbLabel(locale), href: localeHref("/", locale) },
                {
                  label: brandSettings.uiLabels.categoryAllProductsBreadcrumb,
                  href: localeHref("/produkter", locale),
                },
                ...ancestorCrumbs,
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
            {tCatalog("exploreMore")}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {localizedRelatedCategories.map((cat) => {
              const img =
                cat.heroImage ?? CATEGORY_IMAGES[cat.slug] ?? LIFESTYLE_IMAGE;
              return (
                <Link
                  key={cat.id}
                  href={categoryHref({ slug: cat.slug, permalink: cat.permalink }, locale)}
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
