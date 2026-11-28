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
  /**
   * What shipping one unit of THIS variant costs (its own price can cross a
   * free-shipping threshold the product's does not). Absent → the product's
   * rate; null → no rate claimed for this variant.
   */
  shippingDkk?: number | null;
  /**
   * The variant as the picker shows it ("Whole beans, 250 g"). Emitted as
   * `Offer.name` so an agent can tell sibling offers apart by more than sku.
   * Omitted or null → no `name` key, the shape every existing caller got.
   */
  name?: string | null;
};

export function buildProductOffersJsonLd(input: {
  productUrl: string;
  currency: string;
  country: string;
  /** What shipping one unit costs, or null when it cannot be said: then no shipping rate is claimed. */
  shippingDefaultDkk: number | null;
  returnDays: number;
  priceValidUntil: string;
  priceDkk: number;
  inStock: boolean;
  variants: ReadonlyArray<ProductVariantOfferInput>;
}): JsonLdObject {
  const availability = input.inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
  const shippingDetailsFor = (dkk: number | null) =>
    dkk === null
      ? undefined
      : {
          "@type": "OfferShippingDetails",
          shippingRate: {
            "@type": "MonetaryAmount",
            value: (dkk / 100).toFixed(2),
            currency: input.currency,
          },
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: input.country,
          },
        };
  const shippingDetails = shippingDetailsFor(input.shippingDefaultDkk);
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
    ...(shippingDetails ? { shippingDetails } : {}),
    hasMerchantReturnPolicy,
  };

  // A variant's own rate replaces the product's (or removes it, when unknown).
  const variantShipping = (dkk: number | null) => {
    const details = shippingDetailsFor(dkk);
    return details ? { shippingDetails: details } : { shippingDetails: undefined };
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
        ...(variant.name ? { name: variant.name } : {}),
        sku: variant.sku,
        priceCurrency: input.currency,
        price: (variant.priceDkk / 100).toFixed(2),
        availability:
          variant.stock > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        url: input.productUrl,
        ...offerExtras,
        ...(variant.shippingDkk !== undefined ? variantShipping(variant.shippingDkk) : {}),
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
