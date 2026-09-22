import { describe, expect, it } from "vitest";
import { brand } from "@/brand.config";
import { buildLocalizedPageMetadata } from "@/lib/localized-page-metadata";
import { buildServiceJsonLd } from "@/lib/service-jsonld";

// Same scaffold-context rule as contact-metadata.test.ts: hreflang follows
// the scaffold's own brand.locales — single-locale scaffolds legitimately
// produce an empty `languages` map (hreflang auto-off).
const MULTI_LOCALE = brand.locales.length > 1;

describe("localized public metadata", () => {
  it("builds canonical, hreflang and complete social metadata from runtime URL", () => {
    const metadata = buildLocalizedPageMetadata({
      locale: "en",
      pathTemplate: "/{locale}/services/strategy",
      baseUrl: "https://example.com/",
      siteName: "Example",
      title: "Strategy | Example",
      description: "A clear service description.",
    });

    expect(metadata.alternates).toEqual({
      canonical: "https://example.com/en/services/strategy",
      languages: MULTI_LOCALE
        ? {
            "da-DK": "https://example.com/da/services/strategy",
            en: "https://example.com/en/services/strategy",
            "x-default": "https://example.com/da/services/strategy",
          }
        : {},
    });
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      siteName: "Example",
      url: "https://example.com/en/services/strategy",
      locale: "en_US",
      images: [{ url: expect.stringMatching(/^https:\/\/example\.com\/og\?/) }],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [expect.stringMatching(/^https:\/\/example\.com\/og\?/)],
    });
  });

  it("uses locale-prefixed URLs throughout service structured data", () => {
    const jsonLd = buildServiceJsonLd(
      { slug: "strategy", heroImage: "/images/strategy.jpg" },
      {
        title: "Strategy",
        description: "A clear service description.",
        brandUrl: "https://example.com/",
        brandName: "Example",
        locale: "en",
      },
    );

    expect(jsonLd[0]).toMatchObject({
      "@type": "Service",
      url: "https://example.com/en/services/strategy",
      image: "https://example.com/images/strategy.jpg",
      provider: { url: "https://example.com" },
    });
    expect(jsonLd[1]).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, item: "https://example.com/en" },
        { position: 2, item: "https://example.com/en/services" },
        { position: 3, item: "https://example.com/en/services/strategy" },
      ],
    });
  });
});
