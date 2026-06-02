import { Suspense } from "react";
import { redirect } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { buildProductQuery, type CatalogParams } from "@/lib/catalog";
import { ProductGrid } from "@/components/ProductGrid";
import { CatalogFilters } from "@/components/CatalogFilters";
import { HERO_IMAGE } from "@/lib/images";
import { brand as brandConfig } from "@/brand.config";
import { getBrand } from "@/lib/brand";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{ locale: string }>;
};

function normalize(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

export default async function ProdukterPage({ searchParams, params: localeParams }: PageProps) {
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
  const [products, categories, brandRows, frameColorRows, lensColorRows] =
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

  if (locale === "en") {
    products.forEach((p) => {
      if (p.translations) {
        const translations = p.translations as { en?: { name?: string; description?: string } } | null;
        if (translations?.en?.name) p.name = translations.en.name;
        if (translations?.en?.description) p.description = translations.en.description;
      }
    });
    categories.forEach((c) => {
      if (c.translations) {
        const translations = c.translations as { en?: { name?: string } } | null;
        if (translations?.en?.name) c.name = translations.en.name;
      }
    });
  }

  // P1.2: distinct returnerer nu også null-rows for non-eyewear shops.
  // Filtrér væk så CatalogFilters kun ser konkrete strings. Tomt array =
  // section vises ikke (CatalogFilters returnerer null hvis values.length===0).
  const brands = brandRows.map((r) => r.brand).filter((v): v is string => Boolean(v));
  const frameColors = frameColorRows.map((r) => r.frameColor).filter((v): v is string => Boolean(v));
  const lensColors = lensColorRows.map((r) => r.lensColor).filter((v): v is string => Boolean(v));

  return (
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
            {products.length}{" "}
            {products.length === 1 ? "product" : "products"}
          </p>
        </div>
      </div>

      {/* Main content: sidebar + grid */}
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
            <ProductGrid products={products} prioritizeAboveFold={4} />
          </div>
        </div>
      </div>
    </div>
  );
}
