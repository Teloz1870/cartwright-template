import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { brand } from "@/brand.config";
import { getBrand } from "@/lib/brand";
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
import JsonLd from "@/components/JsonLd";

type Props = { params: Promise<{ slug: string; locale: string }> };

/**
 * Gør en (potentielt relativ) billede-URL absolut. JSON-LD og OpenGraph
 * kræver absolutte URLs — relative stier ignoreres af crawlers og AI-agenter.
 */
function toAbsoluteUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${brand.url}${url.startsWith("/") ? "" : "/"}${url}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) return { title: "Produkt ikke fundet" };

  let productName = product.name;
  let productDescription = product.description;
  
  if (locale === "en" && product.translations) {
    const translations = product.translations as any;
    if (translations?.en?.name) productName = translations.en.name;
    if (translations?.en?.description) productDescription = translations.en.description;
  }

  const url = `${brand.url}/${locale}/produkt/${slug}`;
  const description = productDescription ?? brand.metadata.description;
  const images = parseProductImages(product.images);
  // Kun emit et OG/Twitter-billede hvis produktet faktisk har ét — undgå at
  // pege på en evt. ikke-eksisterende placeholder og servere et dødt link.
  const ogImage = images[0] ? toAbsoluteUrl(images[0]) : null;

  return {
    title: productName,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: productName,
      description,
      url,
      type: "website",
      siteName: brand.storeName,
      locale: "da_DK",
      ...(ogImage
        ? {
            images: [
              { url: ogImage, width: 1200, height: 630, alt: product.name },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: productName,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const brand = await getBrand();
  if (!brand.ecommerceEnabled) {
    redirect("/");
  }

  const { slug: rawSlug, locale } = await params;
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

  let productName = product.name;
  let productDescription = product.description;
  
  if (locale === "en" && product.translations) {
    const translations = product.translations as any;
    if (translations?.en?.name) productName = translations.en.name;
    if (translations?.en?.description) productDescription = translations.en.description;
  }

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

  // JSON-LD Product/Offer — Google rich snippets (pris, lager, fragt, retur) +
  // lader AI-agenter (ChatGPT, Gemini, Perplexity) forstå produktet som handelsvare.
  const productUrl = `${brand.url}/produkt/${slug}`;
  const productImages = images.map(toAbsoluteUrl);
  const availability = inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";

  // Merchant Listing-felter: fragt + returret. Løfter resultatet fra et basalt
  // produkt-snippet til et fuldt Merchant Listing (pris/fragt/retur-callouts).
  const shippingDetails = {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: (brand.policies.shippingDefaultDkk / 100).toFixed(2),
      currency: brand.policies.currency,
    },
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: brand.policies.country,
    },
  };
  const merchantReturnPolicy = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: brand.policies.country,
    returnPolicyCategory:
      "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: brand.policies.returnDays,
    returnMethod: "https://schema.org/ReturnByMail",
  };
  // priceValidUntil ~1 år frem — så AI-caches ikke serverer forældede priser.
  const priceValidUntil = new Date(Date.now() + 365 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  // Fælles Merchant Listing-felter spredt ind på hvert Offer-objekt.
  const offerExtras = {
    priceValidUntil,
    shippingDetails,
    hasMerchantReturnPolicy: merchantReturnPolicy,
  };

  const variantPrices = product.variants.map((v) => v.priceDkk);
  const offers: Record<string, unknown> = hasVariants
    ? {
        "@type": "AggregateOffer",
        priceCurrency: brand.policies.currency,
        lowPrice: (Math.min(...variantPrices) / 100).toFixed(2),
        highPrice: (Math.max(...variantPrices) / 100).toFixed(2),
        offerCount: product.variants.length,
        availability,
        url: productUrl,
        offers: product.variants.map((v) => ({
          "@type": "Offer",
          sku: v.sku,
          priceCurrency: brand.policies.currency,
          price: (v.priceDkk / 100).toFixed(2),
          availability:
            v.stock > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          url: productUrl,
          ...offerExtras,
        })),
      }
    : {
        "@type": "Offer",
        priceCurrency: brand.policies.currency,
        price: (product.priceDkk / 100).toFixed(2),
        availability,
        url: productUrl,
        ...offerExtras,
      };
  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName,
    description: productDescription ?? brand.metadata.description,
    ...(productImages.length > 0 ? { image: productImages } : {}),
    sku: product.id,
    ...(product.brand
      ? { brand: { "@type": "Brand", name: product.brand } }
      : {}),
    ...(product.category ? { category: product.category.name } : {}),
    offers,
  };

  // JSON-LD BreadcrumbList — Forside → alle produkter → (kategori) → produkt.
  // Giver Google site-link-breadcrumbs i SERP og hjælper AI med katalog-hierarkiet.
  const breadcrumbItems: Array<Record<string, unknown>> = [
    { "@type": "ListItem", position: 1, name: "Forside", item: brand.url },
    {
      "@type": "ListItem",
      position: 2,
      name: brand.uiLabels.categoryAllProductsBreadcrumb,
      item: `${brand.url}/produkter`,
    },
  ];
  if (product.category) {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 3,
      name: product.category.name,
      item: `${brand.url}/kategori/${product.category.slug}`,
    });
  }
  breadcrumbItems.push({
    "@type": "ListItem",
    position: breadcrumbItems.length + 1,
    name: productName,
    item: productUrl,
  });
  const breadcrumbJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems,
  };

  return (
    <div className="pb-24 md:pb-0">
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      {/* Product detail. pb-24 på root så mobile sticky-bar ikke skjuler
          bunden af related products; md+ er upåvirket (sticky-bar er md:hidden). */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">
          {/* Left: product image / cinematic video */}
          <div>
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-sol-cream shadow-inner group">
              {product.videoUrl ? (
                <video
                  src={product.videoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : mainImage ? (
                <Image
                  src={mainImage}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain p-8 transition-transform duration-700 group-hover:scale-105"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-sol-sun/30">
                  <span className="text-sol-muted text-sm">No image</span>
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
              {productName}
            </h1>

            {/* Price — "fra X kr" hvis variants har forskellige priser */}
            <p className="text-sol-accent font-black text-3xl">
              {hasVariants && minVariantPrice !== product.priceDkk
                ? `from ${formatPriceDkk(minVariantPrice)}`
                : formatPriceDkk(product.priceDkk)}
            </p>

            {/* Description */}
            {productDescription && (
              <p className="text-sol-muted text-base leading-relaxed">
                {productDescription}
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
                  <dt className="text-sol-muted font-medium">Category</dt>
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
                        <dt className="text-sol-muted font-medium">Frame color</dt>
                        <dd className="text-sol-ink">{product.frameColor}</dd>
                      </>
                    )}
                    {product.lensColor && (
                      <>
                        <dt className="text-sol-muted font-medium">Lens color</dt>
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
              {inStock ? "In stock" : "Sold out"}
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
            More from this category
          </h2>
          <ProductGrid products={relatedProducts} />
        </section>
      </div>
      {/* Phase 7 Task E: mobile sticky add-to-cart-bar (md:hidden). Genbruger
          AddToCartButton + tilføjer pris+navn-context så kunde ikke skal
          scrolle for at se hvad de tilføjer. */}
      <PDPStickyAtcBar
        productId={product.id}
        name={productName}
        priceDkk={product.priceDkk}
        inStock={inStock}
      />
    </div>
  );
}
