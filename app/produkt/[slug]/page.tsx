import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { parseProductImages } from "@/lib/products";
import { formatPriceDkk } from "@/lib/format";
import { ProductGrid } from "@/components/ProductGrid";
import { AddToCartButton } from "@/components/AddToCartButton";
import VariantPicker, {
  type VariantOption,
} from "@/components/VariantPicker";
import PDPStickyAtcBar from "@/components/PDPStickyAtcBar";
import TrustBadges from "@/components/TrustBadges";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) return { title: "Produkt ikke fundet" };
  return { title: product.name };
}

export default async function ProductPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: true,
      // Task B: hent variants så PDP kan rendere VariantPicker. Sortér på sku
      // så UI er deterministisk på tværs af requests.
      variants: { orderBy: { sku: "asc" } },
    },
  });

  if (!product) notFound();

  const images = parseProductImages(product.images);
  const mainImage = images[0] ?? null;
  // Task B: hvis product har variants, brug summen af variants.stock som
  // "in stock"-indikator. Ellers product.stock (eksisterende adfærd).
  const hasVariants = product.variants.length > 0;
  const variantStockSum = product.variants.reduce((s, v) => s + v.stock, 0);
  const inStock = hasVariants ? variantStockSum > 0 : product.stock > 0;
  // Pris-display: hvis variants, vis "fra <min-variant-pris>"; ellers product.priceDkk
  const minVariantPrice = hasVariants
    ? Math.min(...product.variants.map((v) => v.priceDkk))
    : product.priceDkk;

  // Cast variant attributes til flat string-record som VariantPicker forventer.
  const variantOptions: VariantOption[] = product.variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    priceDkk: v.priceDkk,
    stock: v.stock,
    attributes: (v.attributes ?? {}) as Record<string, string>,
  }));

  const relatedProducts = await prisma.product.findMany({
    where: {
      categoryId: product.categoryId,
      id: { not: product.id },
    },
    take: 4,
  });

  return (
    <div className="pb-24 md:pb-0">
      {/* Product detail. pb-24 på root så mobile sticky-bar ikke skjuler
          bunden af related products; md+ er upåvirket (sticky-bar er md:hidden). */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">
          {/* Left: product image + try-on */}
          <div>
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-sol-cream">
              {mainImage ? (
                <Image
                  src={mainImage}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain p-8"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-sol-sun/30">
                  <span className="text-sol-muted text-sm">Intet billede</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: product info */}
          <div className="flex flex-col gap-5">
            {/* Brand */}
            {product.brand && (
              <p className="text-sol-muted text-sm font-medium uppercase tracking-widest">
                {product.brand}
              </p>
            )}

            {/* Name */}
            <h1 className="text-sol-ink font-black text-4xl lg:text-5xl leading-tight">
              {product.name}
            </h1>

            {/* Price — "fra X kr" hvis variants har forskellige priser */}
            <p className="text-sol-accent font-black text-3xl">
              {hasVariants && minVariantPrice !== product.priceDkk
                ? `fra ${formatPriceDkk(minVariantPrice)}`
                : formatPriceDkk(product.priceDkk)}
            </p>

            {/* Description */}
            {product.description && (
              <p className="text-sol-muted text-base leading-relaxed">
                {product.description}
              </p>
            )}

            {/* Attributes
                Task G: hvis product.attributes (JSON) er udfyldt, render dem
                som key/value-pairs (panel-hegn: højde/bredde/materiale; landbrug:
                vægt/oprindelse). Fallback til solbrille-specifikke felter
                (frameColor/lensColor) hvis attributes er null/empty — så
                eksisterende solbrille-produkter rendrer uændret. */}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-t border-sol-ink/10 pt-5">
              {product.category && (
                <>
                  <dt className="text-sol-muted font-medium">Kategori</dt>
                  <dd className="text-sol-ink">{product.category.name}</dd>
                </>
              )}
              {(() => {
                const attrs = product.attributes as Record<string, string> | null;
                const attrEntries = attrs
                  ? Object.entries(attrs).filter(([, v]) => typeof v === "string" && v.length > 0)
                  : [];
                if (attrEntries.length > 0) {
                  return attrEntries.map(([key, value]) => (
                    <span key={key} className="contents">
                      <dt className="text-sol-muted font-medium capitalize">{key}</dt>
                      <dd className="text-sol-ink">{value}</dd>
                    </span>
                  ));
                }
                // Legacy fallback for solbrille-produkter uden attributes
                return (
                  <>
                    {product.frameColor && (
                      <>
                        <dt className="text-sol-muted font-medium">Stelfarve</dt>
                        <dd className="text-sol-ink">{product.frameColor}</dd>
                      </>
                    )}
                    {product.lensColor && (
                      <>
                        <dt className="text-sol-muted font-medium">Glasfarve</dt>
                        <dd className="text-sol-ink">{product.lensColor}</dd>
                      </>
                    )}
                  </>
                );
              })()}
            </dl>

            {/* Stock status */}
            <p
              className={
                inStock
                  ? "text-green-700 font-semibold text-sm"
                  : "text-sol-accent font-semibold text-sm"
              }
            >
              {inStock ? "På lager" : "Udsolgt"}
            </p>

            {/* Add to cart — VariantPicker (med integreret button + pris) hvis
                produktet har varianter; ellers den klassiske AddToCartButton. */}
            <div className="flex flex-col gap-2 pt-1">
              {hasVariants ? (
                <VariantPicker
                  productId={product.id}
                  basePriceDkk={minVariantPrice}
                  variants={variantOptions}
                />
              ) : (
                <AddToCartButton
                  productId={product.id}
                  disabled={product.stock === 0}
                />
              )}
              <TrustBadges variant="product" className="pt-2" />
            </div>
          </div>
        </div>

        {/* Related products */}
        <section className="mt-20">
          <h2 className="text-sol-ink font-black text-3xl mb-8">
            Mere fra samme kategori
          </h2>
          <ProductGrid products={relatedProducts} />
        </section>
      </div>
      {/* Phase 7 Task E: mobile sticky add-to-cart-bar (md:hidden). Genbruger
          AddToCartButton + tilføjer pris+navn-context så kunde ikke skal
          scrolle for at se hvad de tilføjer. */}
      <PDPStickyAtcBar
        productId={product.id}
        name={product.name}
        priceDkk={product.priceDkk}
        inStock={inStock}
      />
    </div>
  );
}
