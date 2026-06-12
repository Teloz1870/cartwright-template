import { describe, it, expect } from "vitest";
import {
  buildGoogleMerchantXml,
  escapeXml,
  type MerchantChannel,
} from "@/lib/feeds/google-merchant";
import type { CatalogFeedItem } from "@/lib/feeds/catalog-feed";

const channel: MerchantChannel = {
  title: "Test Shop",
  link: "https://shop.example",
  description: "A test shop",
};

function item(overrides: Partial<CatalogFeedItem> = {}): CatalogFeedItem {
  return {
    id: "sku-1",
    title: "Blue Mug",
    description: "A nice mug.",
    priceMinor: 19900,
    currency: "DKK",
    availability: "in_stock",
    url: "https://shop.example/product/blue-mug",
    imageUrl: "https://shop.example/img/blue-mug.jpg",
    brand: "Acme",
    category: "Mugs",
    ...overrides,
  };
}

describe("escapeXml", () => {
  it("escaper &, <, >, \" og '", () => {
    expect(escapeXml(`Tom & "Jerry" <b> 'x'`)).toBe(
      "Tom &amp; &quot;Jerry&quot; &lt;b&gt; &apos;x&apos;",
    );
  });
});

describe("buildGoogleMerchantXml", () => {
  it("bygger valid RSS 2.0 med g:-namespace og channel-metadata", () => {
    const xml = buildGoogleMerchantXml([item()], channel);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toContain("<title>Test Shop</title>");
    expect(xml).toContain("<link>https://shop.example</link>");
    expect(xml).toContain("<description>A test shop</description>");
  });

  it("formaterer pris fra øre til major-enhed med valuta", () => {
    const xml = buildGoogleMerchantXml([item({ priceMinor: 19900 })], channel);
    expect(xml).toContain("<g:price>199.00 DKK</g:price>");
  });

  it("emitter g:id, g:availability, g:condition og g:product_type", () => {
    const xml = buildGoogleMerchantXml([item()], channel);
    expect(xml).toContain("<g:id>sku-1</g:id>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).toContain("<g:condition>new</g:condition>");
    expect(xml).toContain("<g:product_type>Mugs</g:product_type>");
  });

  it("udelader g:image_link når imageUrl er null", () => {
    const xml = buildGoogleMerchantXml([item({ imageUrl: null })], channel);
    expect(xml).not.toContain("<g:image_link>");
  });

  it("udelader g:brand når brand er null", () => {
    const xml = buildGoogleMerchantXml([item({ brand: null })], channel);
    expect(xml).not.toContain("<g:brand>");
  });

  it("escaper produktfelter så &/< ikke bryder XML'en", () => {
    const xml = buildGoogleMerchantXml(
      [item({ title: "Salt & Pepper <set>" })],
      channel,
    );
    expect(xml).toContain("<title>Salt &amp; Pepper &lt;set&gt;</title>");
    expect(xml).not.toContain("Salt & Pepper <set>");
  });

  it("håndterer tomt katalog og bevarer channel-strukturen", () => {
    const xml = buildGoogleMerchantXml([], channel);
    expect(xml).toContain("<channel>");
    expect(xml).toContain("</channel>");
    expect(xml).not.toContain("<item>");
  });

  it("emitter g:native_commerce per item når nativeCommerce er sat", () => {
    const xml = buildGoogleMerchantXml([item(), item({ id: "sku-2" })], channel, {
      nativeCommerce: true,
    });
    const matches = xml.match(/<g:native_commerce>enabled<\/g:native_commerce>/g);
    expect(matches).toHaveLength(2);
  });

  it("udelader g:native_commerce når flaget er false/udefineret (bagudkompat)", () => {
    expect(buildGoogleMerchantXml([item()], channel)).not.toContain(
      "<g:native_commerce>",
    );
    expect(
      buildGoogleMerchantXml([item()], channel, { nativeCommerce: false }),
    ).not.toContain("<g:native_commerce>");
  });
});
