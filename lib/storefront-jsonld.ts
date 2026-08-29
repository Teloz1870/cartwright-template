/**
 * Pure builders for the storefront's core Schema.org contracts.
 *
 * Keeping these shapes outside page components makes the machine-readable
 * surface independently testable without a database or a browser. Pages still
 * own data loading and localization; these helpers only assemble JSON-LD.
 */

export type JsonLdObject = Record<string, unknown>;

export function buildWebsiteJsonLd(input: {
  name: string;
  url: string;
  description: string;
  ecommerceEnabled: boolean;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: input.name,
    url: input.url,
    description: input.description,
    ...(input.ecommerceEnabled
      ? {
          potentialAction: {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${input.url}/produkter?q={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
          },
        }
      : {}),
  };
}

export function buildBreadcrumbJsonLd(
  items: ReadonlyArray<JsonLdObject>,
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

export function buildFaqJsonLd(
  items: ReadonlyArray<{ q: string; a: string }>,
): JsonLdObject | null {
  if (items.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

type ProductVariantOfferInput = {
  sku: string;
  priceDkk: number;
  stock: number;
};

export function buildProductOffersJsonLd(input: {
  productUrl: string;
  currency: string;
  country: string;
  shippingDefaultDkk: number;
  returnDays: number;
  priceValidUntil: string;
  priceDkk: number;
  inStock: boolean;
  variants: ReadonlyArray<ProductVariantOfferInput>;
}): JsonLdObject {
  const availability = input.inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
  const shippingDetails = {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: (input.shippingDefaultDkk / 100).toFixed(2),
      currency: input.currency,
    },
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: input.country,
    },
  };
  const hasMerchantReturnPolicy = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: input.country,
    returnPolicyCategory:
      "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: input.returnDays,
    returnMethod: "https://schema.org/ReturnByMail",
  };
  const offerExtras = {
    priceValidUntil: input.priceValidUntil,
    shippingDetails,
    hasMerchantReturnPolicy,
  };

  if (input.variants.length > 0) {
    const prices = input.variants.map((variant) => variant.priceDkk);
    return {
      "@type": "AggregateOffer",
      priceCurrency: input.currency,
      lowPrice: (Math.min(...prices) / 100).toFixed(2),
      highPrice: (Math.max(...prices) / 100).toFixed(2),
      offerCount: input.variants.length,
      availability,
      url: input.productUrl,
      offers: input.variants.map((variant) => ({
        "@type": "Offer",
        sku: variant.sku,
        priceCurrency: input.currency,
        price: (variant.priceDkk / 100).toFixed(2),
        availability:
          variant.stock > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        url: input.productUrl,
        ...offerExtras,
      })),
    };
  }

  return {
    "@type": "Offer",
    priceCurrency: input.currency,
    price: (input.priceDkk / 100).toFixed(2),
    availability,
    url: input.productUrl,
    ...offerExtras,
  };
}

export function buildProductJsonLd(input: {
  name: string;
  description: string;
  images: ReadonlyArray<string>;
  sku: string;
  brand?: string | null;
  category?: string | null;
  aggregateRating?: { average: number; count: number } | null;
  offers: JsonLdObject;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    ...(input.images.length > 0 ? { image: input.images } : {}),
    sku: input.sku,
    ...(input.brand
      ? { brand: { "@type": "Brand", name: input.brand } }
      : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.aggregateRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: input.aggregateRating.average,
            reviewCount: input.aggregateRating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    offers: input.offers,
  };
}
