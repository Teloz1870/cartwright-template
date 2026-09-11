import { Suspense } from "react";
import { redirect } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { buildProductQuery, type CatalogParams } from "@/lib/catalog";
import { ProductGrid } from "@/components/ProductGrid";
import { CatalogFilters } from "@/components/CatalogFilters";
import { getActiveDesign } from "@/lib/theme";
import { HERO_IMAGE } from "@/lib/images";
import { brand as brandConfig } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/Breadcrumbs";
import { homeBreadcrumbLabel } from "@/lib/breadcrumbs";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";
import { getTranslations } from "next-intl/server";
import PlpWebMcpMount from "@/components/webmcp/PlpWebMcpMount";
import { buildLocalizedPageMetadata } from "@/lib/localized-page-metadata";
import type { Metadata } from "next";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const resolvedBrand = await getBrand();
  const title =
    locale === "da"
      ? `${brandConfig.uiLabels.productsPageHeading} | ${resolvedBrand.storeName}`
      : `Products | ${resolvedBrand.storeName}`;
  const description =
    locale === "da"
      ? `Udforsk det offentlige produktkatalog fra ${resolvedBrand.storeName}.`
      : `Explore the public product catalogue from ${resolvedBrand.storeName}.`;

  return buildLocalizedPageMetadata({
    locale,
    pathTemplate: "/{locale}/produkter",
    baseUrl: resolvedBrand.url,
    siteName: resolvedBrand.storeName,
    title,
    description,
    imageUrl: HERO_IMAGE,
  });
}

function normalize(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

export default async function ProdukterPage({ searchParams, params: localeParams }: PageProps) {
  const tCatalog = await getTranslations("Catalog");
  const { locale } = await localeParams;
  const brandSettings = await getBrand();
  if (!brandSettings.ecommerceEnabled) {
    redirect("/");
  }

  const sp = await searchParams;

  const q = normalize(sp.q);
  const kategori = normalize(sp.kategori);
  const brand = normalize(sp.brand);
  const stelfarve = normalize(sp.stelfarve);
  const glasfarve = normalize(sp.glasfarve);
  const minPris = normalize(sp.minPris);
  const maxPris = normalize(sp.maxPris);
  const sort = normalize(sp.sort);

  const params: CatalogParams = {
    q,
    kategori,
    brand,
    stelfarve,
    glasfarve,
    minPris,
    maxPris,
    sort,
  };

  const { where, orderBy } = buildProductQuery(params);

  // Phase G fail-soft (2026-05-28): wrap each Prisma call so DB drift on
  // one column doesn't 500 the whole PLP. Same pattern as PRs #51/#52.
  const [productsBase, categoriesBase, brandRows, frameColorRows, lensColorRows] =
    await Promise.all([
      prisma.product
        .findMany({ where: where as never, orderBy: orderBy as never })
        .catch((err) => {
          console.error("[plp] product.findMany failed, falling back to []:", err);
          return [];
        }),
      prisma.category.findMany({ orderBy: { name: "asc" } }).catch((err) => {
        console.error("[plp] category.findMany failed, falling back to []:", err);
        return [];
      }),
      prisma.product
        .findMany({
          select: { brand: true },
          distinct: ["brand"],
          orderBy: { brand: "asc" },
        })
        .catch((err) => {
          console.error("[plp] brand.findMany failed, falling back to []:", err);
          return [];
        }),
      prisma.product
        .findMany({
          select: { frameColor: true },
          distinct: ["frameColor"],
          orderBy: { frameColor: "asc" },
        })
        .catch((err) => {
          console.error("[plp] frameColor.findMany failed, falling back to []:", err);
          return [];
        }),
      prisma.product
        .findMany({
          select: { lensColor: true },
          distinct: ["lensColor"],
          orderBy: { lensColor: "asc" },
        })
        .catch((err) => {
          console.error("[plp] lensColor.findMany failed, falling back to []:", err);
          return [];
        }),
    ]);

  const shouldTranslate = locale !== brandConfig.defaultLocale;
  const [products, categories]: [
    typeof productsBase,
    typeof categoriesBase,
  ] = shouldTranslate
    ? await Promise.all([
        Promise.all(
          productsBase.map(async (product) => {
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
          categoriesBase.map(async (category) => {
            const [name, description] = await Promise.all([
              getDynamicTranslation(category, "name", category.name, locale),
              getDynamicTranslation(
                category,
                "description",
                category.description,
                locale,
              ),
            ]);
            return { ...category, name, description };
          }),
        ),
      ])
    : [productsBase, categoriesBase];

  // P1.2: distinct returnerer nu også null-rows for non-eyewear shops.
  // Filtrér væk så CatalogFilters kun ser konkrete strings. Tomt array =
  // section vises ikke (CatalogFilters returnerer null hvis values.length===0).
  const brands = brandRows.map((r) => r.brand).filter((v): v is string => Boolean(v));
  const frameColors = frameColorRows.map((r) => r.frameColor).filter((v): v is string => Boolean(v));
  const lensColors = lensColorRows.map((r) => r.lensColor).filter((v): v is string => Boolean(v));

  // JSON-LD CollectionPage + ItemList — gør hele kataloget maskin-synligt så
  // AI-agenter/crawlers kan opregne produkterne fra PLP'en (tidligere emitterede
  // siden INGEN structured data). Bruger runtime-domænet fra getBrand() ligesom
  // catalog-feed.ts. Every URL mirrors the locale-aware storefront route.
  const base = brandSettings.url.replace(/\/+$/, "");
  const localeHome = `${base}/${locale}`;
  const catalogueUrl = `${localeHome}/produkter`;
  const collectionJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: brandConfig.uiLabels.productsPageHeading,
    url: catalogueUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${localeHome}/product/${encodeURIComponent(p.slug)}`,
        name: p.name,
      })),
    },
  };
  const breadcrumbJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: homeBreadcrumbLabel(locale), item: localeHome },
      {
        "@type": "ListItem",
        position: 2,
        name: brandConfig.uiLabels.categoryAllProductsBreadcrumb,
        item: catalogueUrl,
      },
    ],
  };

  // Mixer 2.0 Phase 4 — PLP layout hook (WebshopOverrides.plpLayout): a design
  // can own the listing-page frame. Only consulted when designSurfaces is on.
  // When a pack implements it, the engine hands over the frame: the default
  // hero band is NOT rendered — children = breadcrumb (when enabled) +
  // filters/grid — and heading/productCount carry what the engine would have
  // shown (contract in designs/types.ts). Flag off (or no implementer) → the
  // default frame below renders byte-identically to before the hook existed.
  const PlpLayout = brandSettings.features.designSurfaces
    ? (await getActiveDesign().catch(() => null))?.webshop?.plpLayout
    : undefined;

  // Visible breadcrumb trail (mirrors the BreadcrumbList JSON-LD above).
  const breadcrumbBlock = brandSettings.features.breadcrumbs ? (
    <div className="max-w-7xl mx-auto px-6 pt-6">
      <Breadcrumbs
        items={[
          // Labels mirror this page's BreadcrumbList JSON-LD exactly.
          { label: homeBreadcrumbLabel(locale), href: `/${locale}` },
          { label: brandConfig.uiLabels.categoryAllProductsBreadcrumb },
        ]}
      />
    </div>
  ) : null;

  const filtersAndGrid = (
    /* Main content: sidebar + grid */
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Filters sidebar */}
        <div className="w-full lg:w-64 shrink-0">
          <Suspense>
            <CatalogFilters
              categories={categories}
              brands={brands}
              frameColors={frameColors}
              lensColors={lensColors}
              q={q}
              kategori={kategori}
              brand={brand}
              stelfarve={stelfarve}
              glasfarve={glasfarve}
              minPris={minPris}
              maxPris={maxPris}
              sort={sort ?? "nyeste"}
            />
          </Suspense>
        </div>

        {/* Product grid */}
        <div className="flex-1 min-w-0">
          <ProductGrid
            products={products}
            prioritizeAboveFold={4}
            card={(await getActiveDesign().catch(() => null))?.webshop?.productCard}
            locale={locale}
            query={q}
          />
        </div>
      </div>
    </div>
  );

  // WebMCP experiment: the catalogue page's contextual agent tools. The gate
  // lives inside the mount (flag off ⇒ null ⇒ byte-identical) — one
  // unconditional line per render branch, like the PDP/cart mounts.
  const plpWebMcp = (
    <PlpWebMcpMount
      products={products}
      categories={categories}
      filters={{ q, kategori, minPris, maxPris, sort }}
      locale={locale}
    />
  );

  if (PlpLayout) {
    return (
      <>
        <JsonLd data={[collectionJsonLd, breadcrumbJsonLd]} />
        <PlpLayout
          heading={brandConfig.uiLabels.productsPageHeading}
          productCount={products.length}
          locale={locale}
        >
          {breadcrumbBlock}
          {filtersAndGrid}
        </PlpLayout>
        {plpWebMcp}
      </>
    );
  }

  return (
    <>
      <JsonLd data={[collectionJsonLd, breadcrumbJsonLd]} />
      <div className="bg-sol-cream min-h-screen">
      {/* Page header */}
      <div className="relative h-64 w-full overflow-hidden px-6 sm:h-72">
        <Image
          src={HERO_IMAGE}
          alt={brandConfig.uiLabels.productsPageHeading}
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-sol-ink/80 via-sol-ink/45 to-sol-ink/15" />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end pb-10">
          <h1 className="text-5xl font-black uppercase tracking-tight text-white sm:text-6xl">
            {brandConfig.uiLabels.productsPageHeading}
          </h1>
          <p className="mt-2 text-lg font-medium text-white/85">
            {tCatalog("productCount", { count: products.length })}
          </p>
        </div>
      </div>

      {breadcrumbBlock}

      {filtersAndGrid}
      </div>
      {plpWebMcp}
    </>
  );
}
