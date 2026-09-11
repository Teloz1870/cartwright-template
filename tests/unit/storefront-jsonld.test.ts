import { describe, expect, it } from "vitest";
import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildProductJsonLd,
  buildProductOffersJsonLd,
  buildWebsiteJsonLd,
} from "@/lib/storefront-jsonld";

describe("storefront JSON-LD regression contracts", () => {
  it("keeps WebSite and ecommerce SearchAction machine-readable", () => {
    const website = buildWebsiteJsonLd({
      name: "Example Store",
      url: "https://example.com",
      description: "A public storefront.",
      ecommerceEnabled: true,
    });

    expect(website).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Example Store",
      url: "https://example.com",
      description: "A public storefront.",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate:
            "https://example.com/produkter?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    });
    expect(
      buildWebsiteJsonLd({
        name: "Example Site",
        url: "https://example.com",
        description: "A corporate site.",
        ecommerceEnabled: false,
      }),
    ).not.toHaveProperty("potentialAction");
  });

  it("keeps Product, AggregateOffer and nested Offer merchant fields intact", () => {
    const offers = buildProductOffersJsonLd({
      productUrl: "https://example.com/en/product/frame",
      currency: "DKK",
      country: "DK",
      shippingDefaultDkk: 3900,
      returnDays: 30,
      priceValidUntil: "2027-08-23",
      priceDkk: 129900,
      inStock: true,
      variants: [
        { sku: "FRAME-BLACK", priceDkk: 119900, stock: 2 },
        { sku: "FRAME-BLUE", priceDkk: 139900, stock: 0 },
      ],
    });
    const product = buildProductJsonLd({
      name: "Frame",
      description: "A lightweight frame.",
      images: ["https://example.com/frame.jpg"],
      sku: "product-1",
      brand: "Example",
      category: "Eyewear",
      aggregateRating: { average: 4.8, count: 12 },
      offers,
    });

    expect(product).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Product",
      image: ["https://example.com/frame.jpg"],
      brand: { "@type": "Brand", name: "Example" },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: 4.8,
        reviewCount: 12,
        bestRating: 5,
        worstRating: 1,
      },
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "DKK",
        lowPrice: "1199.00",
        highPrice: "1399.00",
        offerCount: 2,
      },
    });

    const variants = (offers.offers as Array<Record<string, unknown>>);
    expect(variants[0]).toMatchObject({
      "@type": "Offer",
      sku: "FRAME-BLACK",
      price: "1199.00",
      availability: "https://schema.org/InStock",
      priceValidUntil: "2027-08-23",
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { value: "39.00", currency: "DKK" },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "DK",
        merchantReturnDays: 30,
      },
    });
    expect(variants[1].availability).toBe("https://schema.org/OutOfStock");
  });

  it("keeps the non-variant Offer contract", () => {
    const offer = buildProductOffersJsonLd({
      productUrl: "https://example.com/da/product/frame",
      currency: "DKK",
      country: "DK",
      shippingDefaultDkk: 0,
      returnDays: 14,
      priceValidUntil: "2027-08-23",
      priceDkk: 99900,
      inStock: false,
      variants: [],
    });

    expect(offer).toMatchObject({
      "@type": "Offer",
      priceCurrency: "DKK",
      price: "999.00",
      availability: "https://schema.org/OutOfStock",
      url: "https://example.com/da/product/frame",
    });
  });

  it("keeps BreadcrumbList positions and FAQPage answers intact", () => {
    const breadcrumbs = buildBreadcrumbJsonLd([
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://example.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Frame",
        item: "https://example.com/en/product/frame",
      },
    ]);
    const faq = buildFaqJsonLd([
      { q: "Is it in stock?", a: "Yes, while supplies last." },
    ]);

    expect(breadcrumbs).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1 },
        { "@type": "ListItem", position: 2 },
      ],
    });
    expect(faq).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is it in stock?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, while supplies last.",
          },
        },
      ],
    });
    expect(buildFaqJsonLd([])).toBeNull();
  });
});
