import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { brand } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { resolveProductImageUrls } from "@/lib/media/shim";
import { hreflangFor } from "@/i18n/routing";
import ReviewList from "@/components/ReviewList";
import WriteReviewForm from "@/components/WriteReviewForm";
import { getAggregateRating } from "@/lib/reviews";
import { Price } from "@/components/Price";
import { ProductGrid } from "@/components/ProductGrid";
import { AddToCartButton } from "@/components/AddToCartButton";
import { WishlistButton } from "@/components/WishlistButton";
import VariantPicker, {
  type VariantOption,
} from "@/components/VariantPicker";
import PDPStickyAtcBar from "@/components/PDPStickyAtcBar";
import TrustBadges from "@/components/TrustBadges";
import JsonLd from "@/components/JsonLd";
import { productHeroTransitionName } from "@/app/lib/view-transitions";
import { isAnnotateEditEnabled } from "@/lib/annotate/server";
import { editAttr } from "@/components/annotate/editAttr";
import { toAbsoluteUrl } from "@/lib/og";
import { getDynamicTranslation } from "@/lib/i18n-dynamic";

type Props = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug);
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) return { title: "Produkt ikke fundet" };

  const productName = await getDynamicTranslation(product, "name", product.name);
  const productDescription = await getDynamicTranslation(
    product,
    "description",
    product.description,
  );

  const url = `${brand.url}/${locale}/product/${slug}`;
  // `||` not `??`: getDynamicTranslation can return "" (empty base) which should
  // still fall back to the brand description for a non-empty meta description.
  const description = productDescription || brand.metadata.description;
  // Phase 10 Slice 6: kun emit hreflang når flag er on (solbriller er da-only).
  const hreflangFlag = (brand.features as { hreflang?: boolean }).hreflang;
  const languages = hreflangFlag
    ? hreflangFor(`/{locale}/product/${slug}`, brand.url)
    : undefined;
  const images = resolveProductImageUrls(product);
  // Kun emit et OG/Twitter-billede hvis produktet faktisk har ét — undgå at
  // pege på en evt. ikke-eksisterende placeholder og servere et dødt link.
  const ogImage = images[0] ? toAbsoluteUrl(images[0]) : null;

  return {
    title: productName,
    description,
    alternates: {
      canonical: url,
      ...(languages && Object.keys(languages).length > 0 ? { languages } : {}),
    },
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
              { url: ogImage, width: 1200, height: 630, alt: productName },
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

  const productName = await getDynamicTranslation(product, "name", product.name);
  const productDescription = await getDynamicTranslation(
    product,
    "description",
    product.description,
  );
  const productCategoryName = product.category
    ? await getDynamicTranslation(product.category, "name", product.category.name)
    : null;

  const images = resolveProductImageUrls(product);
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

  const relatedProductsBase = await prisma.product.findMany({
    where: {
      categoryId: product.categoryId,
      id: { not: product.id },
    },
    take: 4,
  });
  const relatedProducts = await Promise.all(
    relatedProductsBase.map(async (relatedProduct) => ({
      ...relatedProduct,
      name: await getDynamicTranslation(
        relatedProduct,
        "name",
        relatedProduct.name,
      ),
      description: await getDynamicTranslation(
        relatedProduct,
        "description",
        relatedProduct.description,
      ),
    })),
  );

  // JSON-LD Product/Offer — Google rich snippets (pris, lager, fragt, retur) +
  // lader AI-agenter (ChatGPT, Gemini, Perplexity) forstå produktet som handelsvare.
  const productUrl = `${brand.url}/product/${slug}`;
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
  // eslint-disable-next-line react-hooks/purity -- Server Component render; Date.now() stamped once per request into JSON-LD, no client re-render.
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
  // Phase 10 Slice 7c: AggregateRating JSON-LD. getAggregateRating returnerer
  // null under threshold (3 reviews) — vi udelader nøglen helt frem for at
  // emitte count=0, som Google ignorerer alligevel og som ser spammy ud.
  const reviewsFlag = (brand.features as { reviews?: boolean }).reviews;
  const aggregateRating = reviewsFlag
    ? await getAggregateRating(product.id)
    : null;
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
    ...(productCategoryName ? { category: productCategoryName } : {}),
    ...(aggregateRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: aggregateRating.average,
            reviewCount: aggregateRating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
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
      name: productCategoryName ?? product.category.name,
      item: `${brand.url}/category/${product.category.slug}`,
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

  // AEO (answer-first) indhold — gated på brand.features.aeoContent. Felterne er
  // nullable/lossless; vi parser kun + renderer + emitter FAQPage JSON-LD når
  // flaget er on OG feltet er udfyldt. faq gemmes som JSON-streng (som Category.faq).
  const aeoEnabled = Boolean((brand.features as { aeoContent?: boolean }).aeoContent);
  const answerSummary = aeoEnabled ? (product.answerSummary ?? "") : "";
  const productFaq: Array<{ q: string; a: string }> = (() => {
    if (!aeoEnabled || !product.faq) return [];
    try {
      const parsed = JSON.parse(product.faq);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (it): it is { q: string; a: string } =>
          typeof it === "object" &&
          it !== null &&
          typeof (it as { q?: unknown }).q === "string" &&
          typeof (it as { a?: unknown }).a === "string",
      );
    } catch {
      return [];
    }
  })();
  const productUseCases: Array<{ title: string; description: string }> =
    aeoEnabled && Array.isArray(product.useCases)
      ? (product.useCases as unknown[]).filter(
          (it): it is { title: string; description: string } =>
            typeof it === "object" &&
            it !== null &&
            typeof (it as { title?: unknown }).title === "string" &&
            typeof (it as { description?: unknown }).description === "string",
        )
      : [];
  const productComparison: Record<string, string> =
    aeoEnabled &&
    product.comparisonFacts &&
    typeof product.comparisonFacts === "object" &&
    !Array.isArray(product.comparisonFacts)
      ? (Object.fromEntries(
          Object.entries(product.comparisonFacts as Record<string, unknown>).filter(
            ([, v]) => typeof v === "string",
          ),
        ) as Record<string, string>)
      : {};
  const faqJsonLd =
    productFaq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: productFaq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }
      : null;

  // In-place editing (admin + flag + standard-locale). På standard-locale er
  // productName/productDescription == base-værdierne, så et edit rammer det
  // rigtige felt.
  const editEnabled = await isAnnotateEditEnabled();

  return (
    <div className="pb-24 md:pb-0">
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      {faqJsonLd && <JsonLd data={faqJsonLd} />}
      {/* Product detail. pb-24 på root så mobile sticky-bar ikke skjuler
          bunden af related products; md+ er upåvirket (sticky-bar er md:hidden). */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">
          {/* Left: product image / cinematic video */}
          <div>
            {/* Phase B5: shared `view-transition-name` with the PLP card so
                the hero morphs across PLP → PDP navigation. The name is
                product-id-scoped to keep it unique on each page. Style only
                applied when `brand.features.viewTransitions` is on. */}
            <div
              className="relative aspect-square overflow-hidden rounded-2xl bg-sol-cream shadow-inner group"
              style={
                brand.features.viewTransitions
                  ? { viewTransitionName: productHeroTransitionName(product.id) }
                  : undefined
              }
            >
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
                  alt={productName}
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
            <div className="flex items-start justify-between gap-3">
              <h1
                className="text-sol-ink font-black text-4xl lg:text-5xl leading-tight"
                {...editAttr({ kind: "product", slug: product.slug, field: "name" }, editEnabled)}
              >
                {productName}
              </h1>
              {brand.features.wishlist && (
                <WishlistButton productId={product.id} className="mt-1 shrink-0" />
              )}
            </div>

            {/* Price — "fra X" hvis variants har forskellige priser. Bruger
                <Price> (currency-aware client component) så hovedprisen følger
                currencySwitcher ligesom product-cards/cart — frem for den
                server-side DKK-only formatPriceDkk der ignorerede valgt valuta. */}
            <p className="text-sol-accent font-black text-3xl">
              {hasVariants && minVariantPrice !== product.priceDkk ? (
                <>
                  from <Price oere={minVariantPrice} />
                </>
              ) : (
                <Price oere={product.priceDkk} />
              )}
            </p>

            {/* Answer-first summary (AEO) — fremhævet lead, så svar-motorer og
                kunder får det direkte svar øverst. Gated på aeoContent. */}
            {answerSummary && (
              <p className="rounded-lg border-l-4 border-sol-accent bg-sol-accent/5 px-4 py-3 text-base font-semibold leading-relaxed text-sol-ink">
                {answerSummary}
              </p>
            )}

            {/* Description */}
            {productDescription && (
              <p
                className="text-sol-muted text-base leading-relaxed"
                {...editAttr({ kind: "product", slug: product.slug, field: "description" }, editEnabled)}
              >
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
                  <dd className="text-sol-ink">
                    {productCategoryName ?? product.category.name}
                  </dd>
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
                  ? "text-green-800 dark:text-green-400 font-semibold text-sm"
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

        {/* AEO long-form (answer-first) — use-cases, sammenligning, FAQ. Scannbare
            sektioner med isolérbare H2/H3 så et AI-svar kan citere ét afsnit ude
            af kontekst. Gated på aeoContent (tomme arrays når off). */}
        {(productUseCases.length > 0 ||
          Object.keys(productComparison).length > 0 ||
          productFaq.length > 0) && (
          <section className="mt-16 grid gap-12">
            {productUseCases.length > 0 && (
              <div>
                <h2 className="text-sol-ink font-black text-2xl sm:text-3xl mb-5">
                  What it&apos;s good for
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {productUseCases.map((uc, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-sol-ink/10 bg-sol-cream/40 p-4"
                    >
                      <h3 className="font-bold text-sol-ink text-lg">{uc.title}</h3>
                      <p className="mt-1 text-sol-muted text-sm leading-relaxed">
                        {uc.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(productComparison).length > 0 && (
              <div>
                <h2 className="text-sol-ink font-black text-2xl sm:text-3xl mb-5">
                  How it compares
                </h2>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 border-t border-sol-ink/10 pt-5 text-sm">
                  {Object.entries(productComparison).map(([k, v]) => (
                    <span key={k} className="contents">
                      <dt className="text-sol-muted font-medium capitalize">
                        {k.replace(/_/g, " ")}
                      </dt>
                      <dd className="text-sol-ink">{v}</dd>
                    </span>
                  ))}
                </dl>
              </div>
            )}

            {productFaq.length > 0 && (
              <div>
                <h2 className="text-sol-ink font-black text-2xl sm:text-3xl mb-5">
                  Questions and answers
                </h2>
                <div className="space-y-3">
                  {productFaq.map((item, i) => (
                    <details
                      key={i}
                      className="group rounded-xl border border-sol-ink/10 overflow-hidden"
                    >
                      <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-base font-bold text-sol-ink transition hover:bg-sol-cream/50">
                        <span>{item.q}</span>
                        <span
                          aria-hidden
                          className="shrink-0 text-sol-accent transition-transform group-open:rotate-180"
                        >
                          ▾
                        </span>
                      </summary>
                      <div className="border-t border-sol-ink/10 px-5 py-4 text-sm leading-7 text-sol-muted">
                        {item.a}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Related products */}
        <section className="mt-20">
          <h2 className="text-sol-ink font-black text-3xl mb-8">
            More from this category
          </h2>
          <ProductGrid products={relatedProducts} />
        </section>
      </div>

      {/* Phase 10 Slice 7b: kunde-reviews + write-CTA. Flag-gated så solbriller
          (legacy canary) ikke får ny UI før vi er klar. */}
      {(brand.features as { reviews?: boolean }).reviews && (
        <>
          <ReviewList
            productId={product.id}
            productName={productName}
            productSlug={product.slug}
            locale={locale}
          />
          <section
            id="skriv-anmeldelse"
            className="border-t border-sol-ink/10 bg-sol-cream/40 px-4 py-12 md:px-8"
          >
            <div className="mx-auto w-full max-w-2xl">
              <WriteReviewForm
                productId={product.id}
                productName={productName}
                locale={locale as "da" | "en"}
              />
            </div>
          </section>
        </>
      )}
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
