import { createElement as h, Suspense } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import JsonLd from "@/components/JsonLd";
import { buildProductJsonLd, buildProductOffersJsonLd } from "@/lib/storefront-jsonld";
import { extractPage, jsonLdBlocks } from "@/lib/migration/html";
import { minorUnits, readProduct, type ProductFacts } from "@/lib/migration/jsonld";
import { checkPage, judgeProduct, type PageEntry } from "@/lib/migration/checks/page";
import type { MigrationFetcher, MigrationResponse } from "@/lib/migration/fetch";

/**
 * MIGD-4b — `seo.product-jsonld`: the Product each page's JSON-LD describes,
 * read from the shapes a WooCommerce shop and this engine emit, and compared.
 * The old-side fixtures follow the shape measured on two public WooCommerce
 * product pages (Yoast's one `@graph`, a number price, an Offer with a nested
 * priceSpecification); every name, SKU and price here is invented. Pure: the
 * fetchers are tables of answers, and the currency is an argument, so nothing
 * here depends on the shop's own market.
 */

const OLD_URL = "https://shop.example.test/fences/type-1/";
const NEW_URL = "https://new.example.test/da/product/type-1";
const IMAGE = "https://shop.example.test/wp-content/uploads/type-1.jpg";

const offer = (over: Record<string, unknown> = {}) => ({
  "@type": "Offer",
  priceCurrency: "DKK",
  price: 999,
  priceValidUntil: "2027-12-31",
  availability: "https://schema.org/InStock",
  url: OLD_URL,
  shippingDetails: [{ "@type": "OfferShippingDetails", shippingRate: { "@type": "MonetaryAmount", value: 49, currency: "DKK" } }],
  priceSpecification: { "@type": "UnitPriceSpecification", price: 999, priceCurrency: "DKK", valueAddedTaxIncluded: true },
  ...over,
});
const productNode = (over: Record<string, unknown> = {}) => ({
  "@type": "Product",
  "@id": `${OLD_URL}#product`,
  name: "Invented fence",
  url: OLD_URL,
  sku: "EX-100",
  brand: { "@type": "Brand", name: "Example" },
  offers: offer(),
  isPartOf: { "@id": `${OLD_URL}#webpage` },
  mainEntityOfPage: { "@id": `${OLD_URL}#webpage` },
  image: IMAGE,
  ...over,
});
/** Yoast's one block, as measured: a graph of six nodes with the Product last. */
const yoast = (product: Record<string, unknown> = productNode()) => ({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", "@id": `${OLD_URL}#webpage`, url: OLD_URL, name: "Type 1", primaryImageOfPage: { "@id": `${OLD_URL}#primaryimage` } },
    { "@type": "ImageObject", "@id": `${OLD_URL}#primaryimage`, url: IMAGE },
    { "@type": "BreadcrumbList", "@id": `${OLD_URL}#breadcrumb`, itemListElement: [] },
    { "@type": "WebSite", "@id": "https://shop.example.test/#website", url: "https://shop.example.test/" },
    { "@type": "Organization", "@id": "https://shop.example.test/#organization", name: "Example" },
    product,
  ],
});

const read = (...blocks: unknown[]) =>
  readProduct(blocks.map((b) => (typeof b === "string" ? b : JSON.stringify(b))), { url: OLD_URL, currency: "DKK" });

describe("minorUnits", () => {
  it.each([
    [999, "DKK", 99900],
    ["999.00", "DKK", 99900],
    ["1299.5", "DKK", 129950],
    [12.34, "DKK", 1234],
    [0, "DKK", 0],
    ["0.00", "DKK", 0],
    [" 12.50 ", "DKK", 1250],
    // The currency's own scale, never a fixed 100.
    ["1000", "JPY", 1000],
    ["1000.00", "JPY", 1000],
    ["1.234", "BHD", 1234],
    // By digits, so no float makes 1.005 into 100.49…
    ["1.005", "DKK", 101],
    ["1.004", "DKK", 100],
    ["1299.995", "DKK", 130000],
    // A code Intl does not know still compares with itself.
    ["12.50", "not a code", 1250],
  ])("%j in %s → %i", (value, currency, minor) => {
    expect(minorUnits(value, currency)).toBe(minor);
  });

  it.each([["1.299,00"], ["1299,00"], ["1,299.00"], ["kr. 1299"], ["Call for price"], [""], [-5], ["-5"], [Number.NaN], [Infinity], [1e21], ["99999999999999999999"], [null], [undefined], [{}], [[999]]])(
    "%j is no price",
    (value) => expect(minorUnits(value, "DKK")).toBeNull(),
  );
});

describe("readProduct — the shapes a page's JSON-LD comes in", () => {
  it("Yoast's @graph: a number price, https availability, one image", () => {
    expect(read(yoast())).toEqual({
      unreadableBlocks: 0,
      product: { sku: "EX-100", offered: true, price: 99900, unreadablePrice: null, currency: "DKK", severalCurrencies: false, availability: "InStock", images: 1, unreadableFields: [] },
    });
  });

  it.each<[string, unknown, Partial<ProductFacts>]>([
    ["an array at the top", [{ "@type": "BreadcrumbList" }, productNode()], { sku: "EX-100", price: 99900 }],
    ["one plain object", productNode(), { sku: "EX-100", price: 99900 }],
    ["a JSON number sku", productNode({ sku: 1042 }), { sku: "1042" }],
    ["a @type array", productNode({ "@type": ["Thing", "Product"] }), { sku: "EX-100" }],
    ["a @type as a full IRI", productNode({ "@type": "https://schema.org/Product" }), { sku: "EX-100" }],
    ["a Product nested in WebPage.mainEntity", { "@type": "WebPage", mainEntity: productNode() }, { sku: "EX-100", price: 99900 }],
    [
      "WooCommerce's own block: offers as an array, a string price, http availability",
      { "@context": "https://schema.org/", "@graph": [{ "@type": "BreadcrumbList" }, productNode({ offers: [offer({ price: "1299.00", availability: "http://schema.org/InStock" })] })] },
      { price: 129900, availability: "InStock" },
    ],
    ["the price only in priceSpecification", productNode({ offers: offer({ price: undefined }) }), { price: 99900, currency: "DKK" }],
    ["the currency only in priceSpecification", productNode({ offers: offer({ priceCurrency: undefined }) }), { currency: "DKK" }],
    ["a lower-case currency", productNode({ offers: offer({ priceCurrency: "dkk" }) }), { currency: "DKK" }],
    ["a price in the scale of the currency its offer names, not the shop's", productNode({ offers: offer({ price: "1000", priceCurrency: "JPY", priceSpecification: undefined }) }), { price: 1000, currency: "JPY" }],
    [
      "an AggregateOffer's lowPrice",
      productNode({ offers: { "@type": "AggregateOffer", lowPrice: "100.00", highPrice: "200.00", offerCount: 2, priceCurrency: "DKK", availability: "http://schema.org/InStock" } }),
      { price: 10000, currency: "DKK", availability: "InStock", offered: true },
    ],
    [
      "an AggregateOffer with no price of its own stands for the offers inside it",
      productNode({ offers: { "@type": "AggregateOffer", offerCount: 2, offers: [offer({ price: "200.00" }), offer({ price: "150.00" })] } }),
      { price: 15000, currency: "DKK", availability: "InStock" },
    ],
    [
      "an AggregateOffer's lowPrice wins over a lower offer inside it; the currency and stock may sit only inside it",
      productNode({ offers: { "@type": "AggregateOffer", lowPrice: "100.00", offers: [offer({ price: "50.00", priceCurrency: "EUR", priceSpecification: undefined })] } }),
      { price: 10000, currency: "EUR", availability: "InStock" },
    ],
    ["an empty AggregateOffer is still an offer, with no price", productNode({ offers: { "@type": "AggregateOffer", offerCount: 0, offers: [] } }), { offered: true, price: null, unreadablePrice: null }],
    ["several offers: the lowest", productNode({ offers: [offer({ price: 300 }), offer({ price: 200 }), offer({ price: 250 })] }), { price: 20000 }],
    [
      "offers named by reference, elsewhere on the page",
      { "@graph": [productNode({ offers: [{ "@id": "#offer-1" }] }), offer({ "@id": "#offer-1", price: 40 })] },
      { price: 4000, currency: "DKK" },
    ],
    [
      "a ProductGroup: its id is the sku, its offers are on the variants, in stock when any is",
      {
        "@type": "ProductGroup",
        productGroupID: "EX-GROUP",
        image: IMAGE,
        hasVariant: [
          { "@type": "Product", sku: "EX-V1", offers: offer({ price: 300, availability: "https://schema.org/OutOfStock" }) },
          { "@type": "Product", sku: "EX-V2", offers: offer({ price: 200, availability: "https://schema.org/InStock" }) },
        ],
      },
      { sku: "EX-GROUP", price: 20000, availability: "InStock", images: 1 },
    ],
    [
      "a ProductGroup with its images on the variants has images, not one per variant",
      { "@type": "ProductGroup", sku: "EX-GROUP", hasVariant: [{ "@type": "Product", image: IMAGE }, { "@type": "Product", image: IMAGE }] },
      { sku: "EX-GROUP", images: 1 },
    ],
    [
      "a ProductGroup with different images on its variants has that many; the same one twice, however written, is one",
      {
        "@type": "ProductGroup",
        sku: "EX-GROUP",
        hasVariant: [
          { "@type": "Product", image: `${IMAGE}?1` },
          { "@type": "Product", image: [`${IMAGE}?2`, ""] },
          { "@type": "Product", image: { "@type": "ImageObject", url: `${IMAGE}?2` } },
          { "@type": "Product", image: { "@type": "ImageObject", contentUrl: `${IMAGE}?3` } },
          { "@type": "Product", image: ` ${IMAGE}?3 ` },
          { "@type": "Product", image: { "@id": "#image" } },
          { "@type": "Product", image: { "@id": "#image" } },
          { "@type": "Product", image: { "@type": "ImageObject", caption: "no URL" } },
          { "@type": "Product", image: { "@type": "ImageObject", caption: "no URL either" } },
        ],
      },
      { images: 6 },
    ],
    ["a group's own images are not added to its variants'", { "@type": "ProductGroup", sku: "EX-GROUP", image: IMAGE, hasVariant: [{ "@type": "Product", image: `${IMAGE}?2` }] }, { images: 1 }],
    ["a Product with no offers", productNode({ offers: undefined }), { offered: false, price: null, currency: null, availability: null }],
    ["an offer named by a reference to nothing is no offer", productNode({ offers: { "@id": "#nowhere" } }), { offered: false, price: null }],
    ["a price that is no number, kept for the report", productNode({ offers: offer({ price: "Call for price" }) }), { offered: true, price: null, unreadablePrice: "Call for price" }],
    ["a price that is no number beside a readable one: it could be the lowest, so the lowest is not known", productNode({ offers: [offer({ price: "?" }), offer({ price: 50 })] }), { offered: true, price: null, unreadablePrice: "?" }],
    ["whichever comes first", productNode({ offers: [offer({ price: 50 }), offer({ price: "?" }), offer({ price: "!" })] }), { price: null, unreadablePrice: "?" }],
    ["inside an AggregateOffer with no price of its own", productNode({ offers: { "@type": "AggregateOffer", offers: [offer({ price: 200 }), offer({ price: "?" })] } }), { price: null, unreadablePrice: "?" }],
    ["on one of a group's variants", { "@type": "ProductGroup", sku: "EX-GROUP", hasVariant: [{ "@type": "Product", offers: offer({ price: 200 }) }, { "@type": "Product", offers: offer({ price: "?" }) }] }, { price: null, unreadablePrice: "?" }],
    ["a blank price beside a readable one is only no price", productNode({ offers: [offer({ price: "", priceSpecification: undefined }), offer({ price: 50 })] }), { price: 5000, unreadablePrice: null }],
    [
      "offers in two currencies have no one lowest price and no one currency; the stock still reads",
      productNode({ offers: [offer({ price: 100, priceSpecification: undefined }), offer({ price: 10, priceCurrency: "EUR", priceSpecification: undefined })] }),
      { offered: true, price: null, unreadablePrice: "offers in DKK and EUR", currency: null, severalCurrencies: true, availability: "InStock" },
    ],
    ["a priceSpecification in another currency than its offer's is two currencies", productNode({ offers: offer({ priceSpecification: { price: 999, priceCurrency: "EUR" } }) }), { price: null, unreadablePrice: "offers in DKK and EUR", currency: null, severalCurrencies: true }],
    ["an AggregateOffer in another currency than the offers inside it is two", productNode({ offers: { "@type": "AggregateOffer", lowPrice: "100.00", priceCurrency: "DKK", offers: [offer({ price: "50.00", priceCurrency: "EUR", priceSpecification: undefined })] } }), { price: null, unreadablePrice: "offers in DKK and EUR" }],
    ["one currency named twice, however spelled, is one", productNode({ offers: [offer({ price: 100, priceCurrency: "dkk" }), offer({ price: 50, priceCurrency: " DKK " })] }), { price: 5000, currency: "DKK", severalCurrencies: false, unreadablePrice: null }],
    ["an offer naming no currency beside one that does is in that one", productNode({ offers: [offer({ price: 100, priceSpecification: undefined }), offer({ price: 50, priceCurrency: undefined, priceSpecification: undefined })] }), { price: 5000, currency: "DKK", unreadablePrice: null }],
    ["an empty price is no price at all", productNode({ offers: offer({ price: "", priceSpecification: undefined }) }), { offered: true, price: null, unreadablePrice: null }],
    ["an empty price gives way to the one in priceSpecification", productNode({ offers: offer({ price: "" }) }), { price: 99900, unreadablePrice: null }],
    ["a blank one too", productNode({ offers: offer({ price: "  " }) }), { price: 99900, unreadablePrice: null }],
    ["a null one too", productNode({ offers: offer({ price: null }) }), { price: 99900, unreadablePrice: null }],
    ["an empty lowPrice gives way to the price beside it", productNode({ offers: { "@type": "AggregateOffer", lowPrice: "", price: 40, priceCurrency: "DKK" } }), { price: 4000 }],
    ["an empty lowPrice gives way to the offers inside it", productNode({ offers: { "@type": "AggregateOffer", lowPrice: "", offers: [offer({ price: 200 }), offer({ price: 150 })] } }), { price: 15000 }],
    ["a null in a priceSpecification array gives way to the next", productNode({ offers: offer({ price: undefined, priceSpecification: [{ price: null }, { price: 12 }] }) }), { price: 1200 }],
    ["a price nobody can read still beats a blank one", productNode({ offers: offer({ lowPrice: "", price: "Call us" }) }), { price: null, unreadablePrice: "Call us" }],
    ["a price of 0 is a price: nothing below it speaks", productNode({ offers: offer({ price: 0 }) }), { price: 0 }],
    ["an offer's lowPrice speaks before its price", productNode({ offers: offer({ lowPrice: "100.00", price: "200.00" }) }), { price: 10000 }],
    ["an AggregateOffer whose offers name no price has no price, not an unreadable one", productNode({ offers: { "@type": "AggregateOffer", offers: [{ "@type": "Offer" }] } }), { offered: true, price: null, unreadablePrice: null }],
    ["an unreadable price is kept short for the report", productNode({ offers: offer({ price: "x".repeat(200) }) }), { price: null, unreadablePrice: "x".repeat(80) }],
    ["one that is an object is only named, since turning someone else's into text can throw", productNode({ offers: offer({ price: { a: "x".repeat(200) } }) }), { price: null, unreadablePrice: "(an object or a list)" }],
    ["so is a list", productNode({ offers: offer({ price: [999] }) }), { price: null, unreadablePrice: "(an object or a list)" }],
    ["a number that is no price, as written", productNode({ offers: offer({ price: -5 }) }), { price: null, unreadablePrice: "-5" }],
    ["a relative reference to a node whose @id is written in full: one IRI", { "@graph": [productNode({ offers: { "@id": "#offer" } }), offer({ "@id": `${OLD_URL}#offer`, price: 40 })] }, { offered: true, price: 4000 }],
    ["a full reference to a node whose @id is relative", { "@graph": [productNode({ offers: { "@id": `${OLD_URL}#offer` } }), offer({ "@id": "#offer", price: 40 })] }, { offered: true, price: 4000 }],
    ["a reference into another page is not this page's node", { "@graph": [productNode({ offers: { "@id": "https://other.example.test/x#offer" } }), offer({ "@id": "#offer" })] }, { offered: false, price: null }],
    ["an @id that is no URL still names itself", { "@graph": [productNode({ offers: { "@id": "http://" } }), offer({ "@id": "http://", price: 40 })] }, { price: 4000 }],
    ["a reference that also names the type, the node after it", { "@graph": [productNode({ offers: { "@id": "#offer", "@type": "Offer" } }), offer({ "@id": "#offer", price: 40 })] }, { offered: true, price: 4000 }],
    ["a reference that also names the type, the node before it", { "@graph": [offer({ "@id": "#offer", price: 40 }), productNode({ offers: { "@id": "#offer", "@type": "Offer" } })] }, { offered: true, price: 4000 }],
    ["a reference with a type, to nothing, is no offer", productNode({ offers: { "@id": "#nowhere", "@type": "Offer" } }), { offered: false, price: null }],
    ["a blank @id is no @id: a reference with one reaches nothing, not the node at the page's own address", productNode({ "@id": OLD_URL, offers: { "@id": "" } }), { offered: false, price: null }],
    ["a whitespace one neither", productNode({ "@id": OLD_URL, offers: { "@id": "   " } }), { offered: false, price: null }],
    ["nor one with a type", productNode({ "@id": OLD_URL, offers: { "@id": "", "@type": "Offer" } }), { offered: false, price: null }],
    ["a node with a blank @id does not take the page's own address from the node there", { "@graph": [offer({ "@id": OLD_URL, price: 40 }), productNode({ offers: { "@id": OLD_URL } }), { "@type": "WebSite", "@id": "", name: "x" }, { "@type": "WebSite", "@id": "  ", name: "y" }] }, { offered: true, price: 4000 }],
    ["and a blank reference does not reach a node with a blank @id", { "@graph": [productNode({ offers: { "@id": "" } }), offer({ "@id": "", price: 40 })] }, { offered: false, price: null }],
    ["a node with a blank @id is still that node, inline", productNode({ offers: offer({ "@id": " ", price: 40 }) }), { offered: true, price: 4000 }],
    ["images as an array", productNode({ image: [IMAGE, `${IMAGE}?2`, { "@type": "ImageObject", url: `${IMAGE}?3` }] }), { images: 3 }],
    ["the same image twice, however written, is one", productNode({ image: [IMAGE, { "@type": "ImageObject", url: IMAGE }, ` ${IMAGE} `, { "@type": "ImageObject", contentUrl: IMAGE }, `${IMAGE}?2`] }), { images: 2 }],
    ["two image nodes naming no URL are two", productNode({ image: [{ "@type": "ImageObject", caption: "a" }, { "@type": "ImageObject", caption: "b" }] }), { images: 2 }],
    ["an image by reference", productNode({ image: { "@id": `${OLD_URL}#primaryimage` } }), { images: 1 }],
    ["no image at all", productNode({ image: undefined }), { images: 0 }],
    ["an empty image", productNode({ image: ["", "  "] }), { images: 0 }],
  ])("%s", (_name, block, facts) => {
    const { product } = read(block);
    expect(product).toMatchObject(facts);
  });

  it("a price with no currency named is in the shop's own scale", () => {
    const block = [JSON.stringify(productNode({ offers: { "@type": "Offer", price: "1000" } }))];
    expect(readProduct(block, { url: OLD_URL, currency: "JPY" }).product).toMatchObject({ price: 1000, currency: null });
    expect(readProduct(block, { url: OLD_URL, currency: "BHD" }).product).toMatchObject({ price: 1_000_000, currency: null });
    expect(readProduct(block, { url: OLD_URL, currency: "DKK" }).product).toMatchObject({ price: 100_000, currency: null, severalCurrencies: false });
  });

  it.each([
    ["https://schema.org/OutOfStock", "OutOfStock"],
    ["http://schema.org/OutOfStock", "OutOfStock"],
    ["http://www.schema.org/OutOfStock", "OutOfStock"],
    ["schema:OutOfStock", "OutOfStock"],
    ["OutOfStock", "OutOfStock"],
    [" https://schema.org/BackOrder ", "BackOrder"],
  ])("availability %s → %s", (availability, term) => {
    expect(read(productNode({ offers: offer({ availability }) })).product?.availability).toBe(term);
  });

  it("the page's Product is the outermost one naming this page: never a related product, a variant or a list item", () => {
    const other = { "@type": "Product", sku: "EX-OTHER", url: "https://shop.example.test/fences/other/" };
    const related = productNode({ isRelatedTo: [other], hasVariant: [{ "@type": "Product", sku: "EX-VARIANT" }] });
    expect(read(related).product?.sku).toBe("EX-100");
    expect(read({ "@type": "ItemList", itemListElement: [{ "@type": "ListItem", item: other }] }, related).product?.sku).toBe("EX-100");
    expect(read({ "@graph": [other, productNode()] }).product?.sku).toBe("EX-100");
    // Its own page named only by mainEntityOfPage or @id, trailing slash aside.
    const bare = { ...productNode({ url: undefined, "@id": undefined }), mainEntityOfPage: OLD_URL.slice(0, -1) };
    expect(read({ "@graph": [other, bare] }).product?.sku).toBe("EX-100");
    expect(read({ "@graph": [other, productNode({ url: undefined, "@id": "#product", mainEntityOfPage: undefined })] }).product?.sku).toBe("EX-100");
    // A variant naming this page's path (Google's documented shape) is still only a variant.
    expect(read({ "@type": "ProductGroup", sku: "EX-GROUP", hasVariant: [{ "@type": "Product", sku: "EX-V1", url: `${OLD_URL}?attribute_pa_color=black` }] }).product?.sku).toBe("EX-GROUP");
    // Nothing names the page: the first one.
    expect(read({ "@graph": [other, { "@type": "Product", sku: "EX-LAST" }] }).product?.sku).toBe("EX-OTHER");
  });

  describe("the page's own Product, when several name the page", () => {
    const OTHER_URL = "https://shop.example.test/fences/other/";
    const other = { "@type": "Product", sku: "EX-OTHER", offers: offer({ price: 50 }) };
    const own = (...graph: unknown[]) => read({ "@graph": graph }).product?.sku;

    it("its own url outranks a #fragment @id, which any node of this page can carry", () => {
      expect(own({ ...other, "@id": "#related-1", url: OTHER_URL }, productNode())).toBe("EX-100");
      expect(own({ ...other, "@id": `${OLD_URL}#related-1`, url: OTHER_URL }, productNode())).toBe("EX-100");
      expect(own({ ...other, "@id": "#related-1", url: [OTHER_URL] }, productNode())).toBe("EX-100");
    });

    it("a url or mainEntityOfPage naming the page outranks a #fragment @id, whichever comes first", () => {
      const accessory = { "@type": "Product", "@id": "#accessory-1", sku: "ACC-1" };
      const mine = { "@type": "Product", "@id": "#product", url: OLD_URL, sku: "EX-100" };
      expect(own(accessory, mine)).toBe("EX-100");
      expect(own(mine, accessory)).toBe("EX-100");
      expect(own({ ...accessory, "@id": `${OLD_URL}#accessory-1` }, mine)).toBe("EX-100");
      expect(own(accessory, { "@type": "Product", sku: "EX-100", url: [OLD_URL] })).toBe("EX-100");
      expect(own(accessory, { "@type": "Product", sku: "EX-100", mainEntityOfPage: OLD_URL })).toBe("EX-100");
      expect(own(accessory, { "@type": "Product", sku: "EX-100", mainEntityOfPage: { "@id": `${OLD_URL}#webpage` } })).toBe("EX-100");
    });

    it("an @id that is the page's own address has no #fragment to borrow, so it names the page as firmly as a url", () => {
      const accessory = { "@type": "Product", "@id": "#accessory-1", sku: "ACC-1" };
      expect(own(accessory, { "@type": "Product", "@id": OLD_URL, sku: "EX-100" })).toBe("EX-100");
      expect(own(accessory, { "@type": "Product", "@id": OLD_URL.slice(0, -1), sku: "EX-100" })).toBe("EX-100");
      // It still says nothing beside a url of its own, like any @id.
      expect(own(accessory, { "@type": "Product", "@id": OLD_URL, url: OTHER_URL, sku: "EX-100" })).toBe("ACC-1");
    });

    it("two #fragment @ids are the tie they were: what points where breaks it, then the order; either beats naming nothing", () => {
      const a = { "@type": "Product", "@id": "#a", sku: "A" };
      const b = { "@type": "Product", "@id": "#b", sku: "B" };
      expect(own(a, b)).toBe("A");
      expect(own(a, { ...b, isRelatedTo: { "@id": "#a" } })).toBe("B");
      expect(own({ "@type": "Product", sku: "NONE" }, b)).toBe("B");
      expect(own({ "@type": "Product", url: OTHER_URL, sku: "ELSEWHERE" }, b)).toBe("B");
    });

    it("an inline mainEntityOfPage names the page by its url as well as its @id, one or a list of them", () => {
      const rel = { "@type": "Product", url: OTHER_URL, sku: "ACC" };
      const named = (mainEntityOfPage: unknown) => ({ "@type": "Product", sku: "OWN", mainEntityOfPage });
      expect(own(rel, named({ "@type": "WebPage", url: OLD_URL }))).toBe("OWN");
      expect(own(rel, named({ "@type": "WebPage", url: [OTHER_URL, OLD_URL] }))).toBe("OWN");
      expect(own(rel, named({ "@type": "WebPage", "@id": `${OLD_URL}#webpage`, url: OTHER_URL }))).toBe("OWN");
      expect(own(rel, named([{ "@type": "WebPage", url: OLD_URL }]))).toBe("OWN");
      expect(own(rel, named([OLD_URL]))).toBe("OWN");
      // One naming another page, or a blank, says nothing.
      expect(own(rel, named({ "@type": "WebPage", url: OTHER_URL }))).toBe("ACC");
      expect(own(rel, named({ "@type": "WebPage", url: "" }))).toBe("ACC");
    });

    it("a blank names nothing, though a URL parser reads it as the page", () => {
      expect(own({ ...other, url: "" }, productNode())).toBe("EX-100");
      expect(own({ ...other, url: "  " }, productNode())).toBe("EX-100");
      expect(own({ ...other, "@id": "" }, productNode())).toBe("EX-100");
      expect(own({ ...other, mainEntityOfPage: "" }, productNode())).toBe("EX-100");
      expect(own({ ...other, mainEntityOfPage: { "@id": "" } }, productNode())).toBe("EX-100");
    });

    it("the @id still speaks without a usable url, and mainEntityOfPage whatever the url says", () => {
      const byFragment = { url: undefined, "@id": "#product", mainEntityOfPage: undefined };
      expect(own({ ...other, url: OTHER_URL }, productNode({ ...byFragment, url: "" }))).toBe("EX-100");
      expect(own({ ...other, url: OTHER_URL }, productNode({ ...byFragment, url: { "@id": OTHER_URL } }))).toBe("EX-100");
      expect(own({ ...other, url: OTHER_URL }, productNode({ url: OTHER_URL, "@id": undefined }))).toBe("EX-100");
      expect(own({ ...other, url: OTHER_URL }, productNode({ url: [OTHER_URL, OLD_URL], "@id": undefined, mainEntityOfPage: undefined }))).toBe("EX-100");
    });

    it("a plain-permalink shop: the page's own URL carries a query, so the query tells its Product from another's on the same path", () => {
      const PAGE = "https://shop.example.test/?product=fence";
      const plain = (...graph: unknown[]) => readProduct([JSON.stringify({ "@graph": graph })], { url: PAGE, currency: "DKK" }).product?.sku;
      const gate = { "@type": "Product", url: "https://shop.example.test/?product=gate", sku: "GATE" };
      expect(plain(gate, { "@type": "Product", url: PAGE, sku: "FENCE" })).toBe("FENCE");
      expect(plain({ "@type": "Product", url: PAGE, sku: "FENCE" }, gate)).toBe("FENCE");
      // However it names the page, with or without the slash before the query.
      expect(plain(gate, { "@type": "Product", url: "https://shop.example.test?product=fence", sku: "FENCE" })).toBe("FENCE");
      expect(plain(gate, { "@type": "Product", mainEntityOfPage: PAGE, sku: "FENCE" })).toBe("FENCE");
      expect(plain(gate, { "@type": "Product", mainEntityOfPage: { "@id": `${PAGE}#webpage` }, sku: "FENCE" })).toBe("FENCE");
      expect(plain(gate, { "@type": "Product", "@id": PAGE, sku: "FENCE" })).toBe("FENCE");
      expect(plain(gate, { "@type": "Product", "@id": "#product", sku: "FENCE" })).toBe("FENCE");
      // Another page's #fragment says nothing, as another page's url does.
      expect(plain({ "@type": "Product", "@id": "https://shop.example.test/?product=gate#product", sku: "GATE" }, { "@type": "Product", "@id": "#product", sku: "FENCE" })).toBe("FENCE");
    });

    it("a page with no query of its own: a query on what names it is not compared, so a variant's ?attribute_* is still its path", () => {
      const onPath = `${OLD_URL}?attribute_pa_color=black`;
      const elsewhere = { ...other, url: OTHER_URL };
      expect(own(elsewhere, productNode({ url: onPath, "@id": undefined, mainEntityOfPage: undefined }))).toBe("EX-100");
      expect(own(elsewhere, productNode({ url: undefined, "@id": undefined, mainEntityOfPage: onPath }))).toBe("EX-100");
    });

    it("a variant beside its group that names it in hasVariant is only a variant, whichever comes first", () => {
      const variant = (sku: string, price: number) => ({ "@type": "Product", "@id": `${OLD_URL}#${sku}`, url: `${OLD_URL}?attribute_pa_color=${sku}`, sku, image: `${IMAGE}?${sku}`, offers: offer({ price }) });
      const [v1, v2] = [variant("EX-V1", 300), variant("EX-V2", 200)];
      const group = { "@type": "ProductGroup", "@id": `${OLD_URL}#group`, url: OLD_URL, productGroupID: "EX-GROUP", hasVariant: [{ "@id": v1["@id"] }, { "@id": v2["@id"] }] };
      for (const graph of [[v1, v2, group], [group, v1, v2], [v1, group, v2]]) {
        expect(read({ "@graph": graph }).product).toMatchObject({ sku: "EX-GROUP", price: 20000, images: 2 });
      }
      // With no url of its own, the group is still what the variants belong to, though they name the page's path.
      expect(own(v1, { ...group, url: undefined, "@id": undefined })).toBe("EX-GROUP");
      // Linked from both ends, nothing counts twice.
      const both = (v: typeof v1) => ({ ...v, isVariantOf: { "@id": group["@id"] } });
      expect(read({ "@graph": [both(v1), both(v2), group] }).product).toMatchObject({ sku: "EX-GROUP", price: 20000, images: 2 });
    });

    it("Google's documented flat shapes: variants beside the group, naming it in isVariantOf", () => {
      const sized = (price: number, availability: string, size: string) => ({ "@type": "Offer", url: `${OLD_URL}?size=${size}`, price, priceCurrency: "DKK", availability: `https://schema.org/${availability}` });
      // One page holds every variant. The group has no offers, no images and no hasVariant.
      const group = { "@context": "https://schema.org", "@type": "ProductGroup", "@id": "#parent", name: "Invented fence", url: OLD_URL, productGroupID: "EX-GROUP", variesBy: ["https://schema.org/size"] };
      const variant = (size: string, offers: unknown) => ({ "@context": "https://schema.org", "@type": "Product", isVariantOf: { "@id": "#parent" }, name: size, image: `${IMAGE}?${size}`, size, offers });
      const [small, large] = [variant("small", sized(39.99, "OutOfStock", "small")), variant("large", sized(59.99, "InStock", "large"))];
      const whole = { sku: "EX-GROUP", offered: true, price: 3999, unreadablePrice: null, currency: "DKK", severalCurrencies: false, availability: "InStock", images: 2, unreadableFields: [] };
      expect(read([group, small, large]).product).toEqual(whole);
      expect(read([small, large, group]).product).toEqual(whole);
      expect(read(small, large, group).product).toEqual(whole); // each in a block of its own
      // One page per variant: no url on the group, and a stub naming each variant's own page.
      const parent = { "@context": "https://schema.org", "@type": "ProductGroup", "@id": "#parent", productGroupID: "EX-GROUP" };
      const here = { ...variant("small", sized(39.99, "InStock", "small")), "@id": "#small", sku: "EX-S" };
      const stub = { "@context": "https://schema.org", "@type": "Product", isVariantOf: { "@id": "#parent" }, url: `${OTHER_URL}?size=large` };
      for (const page of [[parent, here, stub], [stub, here, parent]]) {
        expect(read(page).product).toEqual({ sku: "EX-GROUP", offered: true, price: 3999, unreadablePrice: null, currency: "DKK", severalCurrencies: false, availability: "InStock", images: 1, unreadableFields: [] });
      }
    });

    it("a Product naming a group that is not beside it, or itself, is still the page's own", () => {
      const rel = { ...other, url: OTHER_URL };
      // Google's other shape: the group nested in the variant, on the variant's own page.
      expect(own(rel, productNode({ isVariantOf: { "@type": "ProductGroup", productGroupID: "EX-GROUP" } }))).toBe("EX-100");
      expect(own(rel, productNode({ isVariantOf: { "@id": "#nowhere" } }))).toBe("EX-100");
      expect(own(rel, productNode({ isVariantOf: { "@id": `${OLD_URL}#product` } }))).toBe("EX-100");
      expect(own(rel, productNode({ hasVariant: { "@id": `${OLD_URL}#product` } }))).toBe("EX-100");
    });

    it("a related product or a list's item named by reference is still only that, whichever comes first", () => {
      const rel = { ...other, "@id": "#rel" };
      const mine = { "@type": "Product", "@id": "#own", sku: "EX-100" };
      expect(own(rel, { ...mine, isRelatedTo: { "@id": "#rel" } })).toBe("EX-100");
      expect(own(rel, { ...mine, isSimilarTo: [{ "@id": "#rel" }] })).toBe("EX-100");
      const list = (itemListElement: unknown) => ({ "@type": "ItemList", itemListElement });
      expect(own(list([{ "@type": "ListItem", position: 1, item: { "@id": "#rel" } }]), rel, mine)).toBe("EX-100");
      expect(own(list([{ "@id": "#rel" }]), rel, mine)).toBe("EX-100");
      // A list held inside the page's own Product points the same way.
      expect(own(rel, { ...mine, isRelatedTo: list([{ "@type": "ListItem", item: { "@id": "#rel" } }]) })).toBe("EX-100");
      // A breadcrumb is no such list: its last item is the page's own Product.
      expect(own({ "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", item: { "@id": "#own" } }] }, mine, rel)).toBe("EX-100");
    });

    it("naming the page outranks being pointed at: a related product may point back, or be the only one that points", () => {
      const rel = { ...other, url: OTHER_URL, "@id": `${OTHER_URL}#product` };
      const toOwn = { isRelatedTo: { "@id": `${OLD_URL}#product` } };
      expect(own({ ...rel, ...toOwn }, productNode())).toBe("EX-100");
      expect(own({ ...rel, ...toOwn }, productNode({ isRelatedTo: { "@id": rel["@id"] } }))).toBe("EX-100");
      const list = { "@type": "ItemList", itemListElement: [{ "@id": `${OLD_URL}#product` }] };
      expect(own(list, rel, productNode())).toBe("EX-100");
      // A #fragment @id names it too, if less firmly: being pointed at still only breaks a tie.
      expect(own({ ...rel, isRelatedTo: { "@id": "#own" } }, { "@type": "Product", "@id": "#own", sku: "EX-100" })).toBe("EX-100");
    });

    it("the node a WebPage's mainEntity only refers to, even with its type, is not the Product: the node itself is", () => {
      const graph = { "@graph": [{ "@type": "WebPage", mainEntity: { "@id": `${OLD_URL}#product`, "@type": "Product" } }, productNode()] };
      expect(read(graph).product).toMatchObject({ sku: "EX-100", price: 99900 });
      expect(read({ "@id": `${OLD_URL}#product`, "@type": "Product" })).toEqual({ product: null, unreadableBlocks: 0 });
    // With a blank @id it refers to nothing, so it is no Product either; with anything else on it, it is one with no @id.
    expect(read({ "@id": " ", "@type": "Product" })).toEqual({ product: null, unreadableBlocks: 0 });
    expect(read({ "@id": " ", "@type": "Product", sku: "EX-100" }).product?.sku).toBe("EX-100");
    });
  });

  it("no Product, or a list of them only, is no Product; a block that does not parse is counted, the others still read", () => {
    expect(read({ "@type": "BreadcrumbList" }, [])).toEqual({ product: null, unreadableBlocks: 0 });
    expect(read({ "@type": "ItemList", itemListElement: [{ item: productNode() }] })).toEqual({ product: null, unreadableBlocks: 0 });
    expect(read()).toEqual({ product: null, unreadableBlocks: 0 });
    expect(read('{"@type":"Product",')).toEqual({ product: null, unreadableBlocks: 1 });
    expect(read("", "not json", productNode())).toMatchObject({ product: { sku: "EX-100" }, unreadableBlocks: 2 });
  });

  it("a node with both compares its sku; productGroupID stands in only when there is no sku", () => {
    expect(read(productNode({ sku: "EX-100", productGroupID: "GROUP-1" })).product?.sku).toBe("EX-100");
    expect(read(productNode({ sku: undefined, productGroupID: "GROUP-1" })).product?.sku).toBe("GROUP-1");
  });

  describe("a field written in a shape the reader skips is named, never read as none", () => {
    const REASON = "a currency that cannot be read";
    const bare = (over: Record<string, unknown> = {}) => offer({ priceSpecification: undefined, ...over });
    const noCurrency: Partial<ProductFacts> = { currency: null, price: null, unreadablePrice: REASON, severalCurrencies: false, unreadableFields: ["priceCurrency"] };
    const noStock: Partial<ProductFacts> = { availability: null, unreadableFields: ["availability"] };
    const noSku: Partial<ProductFacts> = { sku: null, unreadableFields: ["sku"] };

    it.each<[string, unknown, Partial<ProductFacts>]>([
      ["a currency as a list", productNode({ offers: bare({ priceCurrency: ["USD"] }) }), noCurrency],
      ["a currency as a reference", productNode({ offers: bare({ priceCurrency: { "@id": "USD" } }) }), noCurrency],
      ["a currency as a number", productNode({ offers: bare({ priceCurrency: 208 }) }), noCurrency],
      ["a currency as an empty list", productNode({ offers: bare({ priceCurrency: [] }) }), noCurrency],
      ["a currency so written only in priceSpecification", productNode({ offers: offer({ priceCurrency: undefined, priceSpecification: { price: 999, priceCurrency: ["USD"] } }) }), noCurrency],
      ["a currency so written beside one that reads: which price is in which is not known", productNode({ offers: [bare({ price: 100 }), bare({ price: 50, priceCurrency: ["USD"] })] }), noCurrency],
      ["the same, the other way round", productNode({ offers: [bare({ price: 50, priceCurrency: ["USD"] }), bare({ price: 100 })] }), noCurrency],
      ["a currency so written on a group's variant", { "@type": "ProductGroup", sku: "EX-GROUP", hasVariant: [{ "@type": "Product", offers: bare() }, { "@type": "Product", offers: bare({ priceCurrency: ["USD"] }) }] }, noCurrency],
      ["a currency so written inside an AggregateOffer", productNode({ offers: { "@type": "AggregateOffer", lowPrice: "100.00", priceCurrency: "DKK", offers: [bare({ priceCurrency: ["USD"] })] } }), noCurrency],
      ["a currency so written with no price beside it: the scale of nothing, and still named", productNode({ offers: { "@type": "Offer", priceCurrency: ["USD"] } }), noCurrency],
      ["a currency so written beside two that read: offers in several, and one unread", productNode({ offers: [bare({ price: 100 }), bare({ price: 10, priceCurrency: "EUR" }), bare({ priceCurrency: ["USD"] })] }), { currency: null, price: null, unreadablePrice: "offers in DKK and EUR", severalCurrencies: true, unreadableFields: ["priceCurrency"] }],
      ["a blank currency names none, as before", productNode({ offers: bare({ priceCurrency: "  " }) }), { currency: null, price: 99900, unreadablePrice: null, unreadableFields: [] }],
      ["a null currency names none, as before", productNode({ offers: bare({ priceCurrency: null }) }), { currency: null, price: 99900, unreadablePrice: null, unreadableFields: [] }],

      ["availability as a reference", productNode({ offers: offer({ availability: { "@id": "https://schema.org/OutOfStock" } }) }), noStock],
      ["availability as a list", productNode({ offers: offer({ availability: ["https://schema.org/OutOfStock"] }) }), noStock],
      ["availability with a trailing slash, which term() does not read", productNode({ offers: offer({ availability: "https://schema.org/OutOfStock/" }) }), noStock],
      ["availability as a scheme and nothing else", productNode({ offers: offer({ availability: "schema:" }) }), noStock],
      ["availability as a number", productNode({ offers: offer({ availability: 1 }) }), noStock],
      ["availability so written beside an offer out of stock: the one not read could be in stock", productNode({ offers: [offer({ availability: ["https://schema.org/InStock"] }), offer({ availability: "https://schema.org/OutOfStock" })] }), noStock],
      ["the same, the other way round", productNode({ offers: [offer({ availability: "https://schema.org/OutOfStock" }), offer({ availability: ["https://schema.org/InStock"] })] }), noStock],
      ["availability so written inside an AggregateOffer", productNode({ offers: { "@type": "AggregateOffer", lowPrice: "100.00", priceCurrency: "DKK", offers: [offer({ availability: {} })] } }), noStock],
      ["blank availability is none, as before", productNode({ offers: offer({ availability: "  " }) }), { availability: null, unreadableFields: [] }],
      ["null availability is none, as before", productNode({ offers: offer({ availability: null }) }), { availability: null, unreadableFields: [] }],
      ["blank availability hides nothing beside it", productNode({ offers: [offer({ availability: "" }), offer({ availability: "https://schema.org/OutOfStock" })] }), { availability: "OutOfStock", unreadableFields: [] }],

      ["a sku as a list", productNode({ sku: ["B"] }), noSku],
      ["a sku as a node", productNode({ sku: { "@type": "PropertyValue", value: "B" } }), noSku],
      ["a sku as a boolean", productNode({ sku: true }), noSku],
      ["a productGroupID so written, standing in for no sku", { "@type": "ProductGroup", productGroupID: ["G"] }, noSku],
      ["a sku so written beside a productGroupID: the stand-in does not hide it", productNode({ sku: ["B"], productGroupID: "GROUP-1" }), noSku],
      ["a blank sku gives way to the productGroupID, as before", productNode({ sku: " ", productGroupID: "GROUP-1" }), { sku: "GROUP-1", unreadableFields: [] }],
      ["a null sku gives way to it, as before", productNode({ sku: null, productGroupID: "GROUP-1" }), { sku: "GROUP-1", unreadableFields: [] }],
      ["a productGroupID so written says nothing beside a sku that reads", productNode({ sku: "EX-100", productGroupID: ["G"] }), { sku: "EX-100", unreadableFields: [] }],
      ["no sku at all is none", productNode({ sku: undefined }), { sku: null, unreadableFields: [] }],

      ["a sku so written leaves the others read", productNode({ sku: ["B"] }), { sku: null, price: 99900, currency: "DKK", availability: "InStock", unreadableFields: ["sku"] }],
      ["availability so written leaves the price read", productNode({ offers: offer({ availability: ["x"] }) }), { price: 99900, currency: "DKK", unreadablePrice: null }],
      ["all three so written, each named", productNode({ sku: ["B"], offers: bare({ priceCurrency: ["USD"], availability: ["x"] }) }), { unreadableFields: ["sku", "priceCurrency", "availability"] }],
      ["no offer at all leaves nothing unread", productNode({ offers: undefined }), { unreadableFields: [] }],
    ])("%s", (_name, block, facts) => {
      expect(read(block).product).toMatchObject(facts);
    });

    it("a price in such a shape stays `unreadablePrice`'s, as it was", () => {
      expect(read(productNode({ offers: offer({ price: [999], priceSpecification: undefined }) })).product).toMatchObject({ price: null, unreadablePrice: "(an object or a list)", unreadableFields: [] });
    });

    it("no shape in them throws: nothing turns them into text", () => {
      const shadow = { toString: 1, valueOf: 1 };
      expect(read(productNode({ sku: shadow, offers: { "@type": "Offer", price: 1, priceCurrency: shadow, availability: shadow } })).product).toMatchObject({ unreadableFields: ["sku", "priceCurrency", "availability"] });
    });
  });

  it("hostile data neither throws nor runs away: nesting past the limit, a reference to itself", () => {
    const deep = `${"[".repeat(100_000)}${"]".repeat(100_000)}`;
    expect(read(deep).product).toBeNull();
    const self = { "@graph": [{ "@id": "#o", "@type": "AggregateOffer", offers: { "@id": "#o" } }, productNode({ offers: { "@id": "#o" } })] };
    expect(read(self).product).toMatchObject({ offered: true, price: null });
    expect(read(productNode({ sku: { nested: true }, image: 7, offers: [null, 3, "x", { price: {} }] })).product).toMatchObject({ sku: null, images: 0, offered: true, price: null });
    // An object whose keys shadow what turning it into a string calls, and far more offers than a spread takes.
    expect(read(productNode({ offers: { price: { toString: 1, valueOf: 1 } } })).product).toMatchObject({ price: null, unreadablePrice: "(an object or a list)" });
    expect(read(productNode({ offers: Array.from({ length: 200_000 }, () => ({ price: 2 })) })).product?.price).toBe(200);
    // A price nested deeper than JSON.stringify's stack reaches. The body parses: 1 MB holds this many brackets.
    const deepPrice = `{"@type":"Product","offers":{"price":${"[".repeat(100_000)}${"]".repeat(100_000)}}}`;
    expect(read(deepPrice)).toMatchObject({ unreadableBlocks: 0, product: { offered: true, price: null, unreadablePrice: expect.any(String) } });
    // Every candidate pointing at the first, from both ends: linear, or this outlasts the test's timeout.
    const many = Array.from({ length: 20_000 }, (_, i) => ({ "@type": "Product", "@id": `#p${i}`, isVariantOf: { "@id": "#p0" }, isRelatedTo: { "@id": "#p0" }, hasVariant: { "@id": "#p1" } }));
    expect(read({ "@graph": many }).product).toMatchObject({ sku: null });
  }, 60_000);

  it("reads what this engine's product page emits, escaped as JsonLd writes it — simple and variable", () => {
    const base = { productUrl: NEW_URL, currency: "DKK", country: "DK", shippingDefaultDkk: 4900, returnDays: 14, priceValidUntil: "2027-01-01", priceDkk: 99900, inStock: true };
    const product = (offers: Record<string, unknown>) =>
      buildProductJsonLd({ name: "A </script> name", description: "x", images: ["https://cdn.example.test/1.jpg", "https://cdn.example.test/2.jpg"], sku: "EX-100", offers });
    const html = (offers: Record<string, unknown>) => renderToStaticMarkup(h(JsonLd, { data: product(offers) }));
    const emit = (offers: Record<string, unknown>) => readProduct(jsonLdBlocks(html(offers)), { url: NEW_URL, currency: "DKK" });

    expect(emit(buildProductOffersJsonLd({ ...base, variants: [] }))).toEqual({
      unreadableBlocks: 0,
      product: { sku: "EX-100", offered: true, price: 99900, unreadablePrice: null, currency: "DKK", severalCurrencies: false, availability: "InStock", images: 2, unreadableFields: [] },
    });
    const variants = [{ sku: "V1", priceDkk: 120000, stock: 0 }, { sku: "V2", priceDkk: 99900, stock: 3 }];
    expect(emit(buildProductOffersJsonLd({ ...base, inStock: true, variants })).product).toMatchObject({ price: 99900, availability: "InStock", currency: "DKK" });
    expect(emit(buildProductOffersJsonLd({ ...base, inStock: false, variants: [{ sku: "V1", priceDkk: 100, stock: 0 }] })).product).toMatchObject({ price: 100, availability: "OutOfStock" });
  });
});

describe("jsonLdBlocks", () => {
  it("reads every ld+json script, whatever its attributes' spelling; never another script, a comment or a block cut off", () => {
    const page = `<html><head>
      <script type="application/ld+json" class="yoast-schema-graph">{"a":1}</script>
      <script type='APPLICATION/LD+JSON; charset=utf-8'>{"b":2}</script>
      <script>{"not":"json-ld"}</script>
      <script type="text/javascript">{"not":"json-ld"}</script>
      <!-- <script type="application/ld+json">{"commented":"out"}</script> -->
      <noscript><script type="application/ld+json">{"in":"noscript"}</script></noscript>
      </head><body><script type="application/ld+json">{"c":3}</script>
      <script type="application/ld+json">{"cut":`;
    expect(jsonLdBlocks(page)).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it("extractPage still reads the sku from the same blocks", () => {
    const page = `<html><head><title>T</title><script>{"sku":"NOT"}</script><script type='application/ld+json; charset=utf-8'>{"sku":"EX-1"}</script></head><body><h1>T</h1></body></html>`;
    expect(extractPage(page, { url: OLD_URL }).sku).toBe("EX-1");
  });

  it("finds a block React streamed after the shell, as the product page's Suspense boundary sends it", async () => {
    let done = false;
    const wait = new Promise<void>((r) => setTimeout(() => { done = true; r(); }, 20));
    const Late = () => {
      if (!done) throw wait;
      return h(JsonLd, { data: productNode() as Record<string, unknown> });
    };
    const app = h("html", null, h("head", null), h("body", null, h("main", null, h(Suspense, { fallback: h("p", null, "Loading") }, h(Late)))));
    const raw = await new Response(await renderToReadableStream(app)).text();
    expect(raw).toContain('<div hidden id="S:0">'); // React really streamed it after the shell
    expect(readProduct(jsonLdBlocks(raw), { url: NEW_URL, currency: "DKK" }).product).toMatchObject({ sku: "EX-100", price: 99900 });
  });
});

const facts = (over: Partial<ProductFacts> = {}): ProductFacts =>
  ({ sku: "EX-100", offered: true, price: 99900, unreadablePrice: null, currency: "DKK", severalCurrencies: false, availability: "InStock", images: 1, unreadableFields: [], ...over });
const fields = (old: ProductFacts, neu: ProductFacts, shop = "DKK") => judgeProduct(old, neu, shop).map((f) => `${f.field}:${f.status}`);

/** Facts with `field` in a shape the reader skips, as `readProduct` leaves them: its value null, a currency's price unknown. */
const skipped = (field: ProductFacts["unreadableFields"][number]): Partial<ProductFacts> => ({
  unreadableFields: [field],
  ...(field === "sku" ? { sku: null } : field === "availability" ? { availability: null } : { currency: null, price: null, unreadablePrice: "a currency that cannot be read" }),
});

describe("judgeProduct", () => {
  it("the same facts are no finding, and neither is more images on the new page", () => {
    expect(judgeProduct(facts(), facts(), "DKK")).toEqual([]);
    expect(judgeProduct(facts(), facts({ images: 5 }), "DKK")).toEqual([]);
  });

  it.each<[string, Partial<ProductFacts>, Partial<ProductFacts>, string[]]>([
    ["sku differs", {}, { sku: "cmabc123" }, ["sku:fail"]],
    ["sku gone", {}, { sku: null }, ["sku:fail"]],
    ["sku differs only in case: an identifier, as written", { sku: "Part-A" }, { sku: "part-a" }, ["sku:fail"]],
    ["no sku on the old page: nothing to hold the new one to", { sku: null }, { sku: "cmabc123" }, []],
    ["price differs by one minor unit", {}, { price: 99901 }, ["price:fail"]],
    ["price gone from the new offer", {}, { price: null }, ["price:fail"]],
    ["price unreadable on the new page", {}, { price: null, unreadablePrice: "Call us" }, ["price:fail"]],
    ["price unreadable on the old page: the source cannot be read", { price: null, unreadablePrice: "Call us" }, {}, ["price:inconclusive"]],
    ["no price on the old offer, one on the new: a warn, as with no offer at all", { price: null }, {}, ["price:warn"]],
    ["no price on the old offer, 0.00 on the new", { price: null }, { price: 0 }, ["price:warn"]],
    ["no price on the old offer, an unreadable one on the new", { price: null }, { price: null, unreadablePrice: "Call us" }, ["price:warn"]],
    ["no price on either offer", { price: null }, { price: null }, []],
    ["offers in two currencies on the old page: neither its currency nor its price holds the new page to anything", { price: null, unreadablePrice: "offers in DKK and EUR", currency: null, severalCurrencies: true }, { currency: "EUR" }, ["price:inconclusive"]],
    ["offers in two currencies on the new page", {}, { price: null, unreadablePrice: "offers in DKK and EUR", currency: null, severalCurrencies: true }, ["priceCurrency:fail", "price:fail"]],
    ["offers in two currencies on the new page, against an old one naming none: still no one currency", { currency: null }, { price: null, unreadablePrice: "offers in DKK and EUR", currency: null, severalCurrencies: true }, ["priceCurrency:fail", "price:fail"]],
    ["another currency: the prices are not compared", {}, { currency: "EUR", price: 13400 }, ["priceCurrency:fail"]],
    ["no currency on the new offer, the old one in the shop's own: the same currency, the prices compared", {}, { currency: null, price: 1 }, ["price:fail"]],
    ["no currency on the old offer, the new one in the shop's own: the same", { currency: null }, { price: 1 }, ["price:fail"]],
    ["no currency on either: both in the shop's own", { currency: null }, { currency: null, price: 1 }, ["price:fail"]],
    ["no currency on the new offer and nothing else differs", {}, { currency: null }, []],
    ["no currency on the old offer and nothing else differs", { currency: null }, {}, []],
    ["no currency on the old offer, the new one in another: a currency difference, the same digits or not", { currency: null }, { currency: "EUR" }, ["priceCurrency:fail"]],
    ["the same, with other digits: the prices are not compared", { currency: null }, { currency: "EUR", price: 1 }, ["priceCurrency:fail"]],
    ["the old offer in another currency, none on the new: the same, the other way", { currency: "EUR" }, { currency: null }, ["priceCurrency:fail"]],
    ["the same, with other digits", { currency: "EUR" }, { currency: null, price: 1 }, ["priceCurrency:fail"]],
    ["availability differs", {}, { availability: "OutOfStock" }, ["availability:fail"]],
    ["availability gone from the new offer", {}, { availability: null }, ["availability:fail"]],
    ["availability differs only in case", {}, { availability: "instock" }, []],
    ["no availability on the old offer", { availability: null }, { availability: "OutOfStock" }, []],
    ["the old page makes an offer, the new one none: one finding, not three", {}, { offered: false, price: null, currency: null, availability: null }, ["offers:fail"]],
    ["the old page makes no offer, the new one does", { offered: false, price: null, currency: null, availability: null }, {}, ["offers:warn"]],
    ["neither page makes an offer: a new Product with none fails, whatever the old page had", { offered: false, price: null, currency: null, availability: null }, { offered: false, price: null, currency: null, availability: null }, ["offers:fail"]],
    ["every image gone", { images: 3 }, { images: 0 }, ["image:fail"]],
    ["fewer images", { images: 3 }, { images: 1 }, ["image:warn"]],
    ["no image on either", { images: 0 }, { images: 0 }, []],
    ["a sku the reader skipped on the old page: unknown, whatever the new one says", skipped("sku"), {}, ["sku:inconclusive"]],
    ["an availability the reader skipped on the old page", skipped("availability"), { availability: "OutOfStock" }, ["availability:inconclusive"]],
    ["a currency the reader skipped on the old page: its price is not known either", skipped("priceCurrency"), {}, ["price:inconclusive", "priceCurrency:inconclusive"]],
    ["the same, against a new page in another currency: no difference invented", skipped("priceCurrency"), { currency: "EUR" }, ["price:inconclusive", "priceCurrency:inconclusive"]],
    ["the same, with other digits: no price compared", skipped("priceCurrency"), { currency: "EUR", price: 1 }, ["price:inconclusive", "priceCurrency:inconclusive"]],
    ["two skipped on the old page: one finding each", { ...skipped("sku"), ...skipped("availability"), unreadableFields: ["sku", "availability"] }, {}, ["sku:inconclusive", "availability:inconclusive"]],
    ["a visible difference elsewhere stays beside it", skipped("sku"), { price: 1 }, ["price:fail", "sku:inconclusive"]],
    ["a new page making no offer stays a fail beside it", skipped("sku"), { offered: false, price: null, currency: null, availability: null }, ["offers:fail", "sku:inconclusive"]],
    ["an old page making no offer stays a warn beside it", { ...skipped("sku"), offered: false, price: null, currency: null, availability: null }, {}, ["offers:warn", "sku:inconclusive"]],
    ["a sku the reader skipped on the new page reads as gone", {}, skipped("sku"), ["sku:fail"]],
    ["an availability the reader skipped on the new page reads as gone", {}, skipped("availability"), ["availability:fail"]],
    ["a currency the reader skipped on the new page is the difference, as offers in several are", {}, skipped("priceCurrency"), ["priceCurrency:fail", "price:fail"]],
    ["the same on an old page naming none", { currency: null }, skipped("priceCurrency"), ["priceCurrency:fail", "price:fail"]],
    ["skipped on both pages: the old one's is what is unknown", skipped("sku"), skipped("sku"), ["sku:inconclusive"]],
    ["the same for a currency", skipped("priceCurrency"), skipped("priceCurrency"), ["price:inconclusive", "priceCurrency:inconclusive"]],
    ["a sku the reader skipped on the new page, none on the old: nothing to hold it to, as with one it reads", { sku: null }, skipped("sku"), []],
    ["an availability the same", { availability: null }, skipped("availability"), []],
  ])("%s", (_name, old, neu, expected) => {
    expect(fields(facts(old), facts(neu))).toEqual(expected);
  });

  it("a side naming no currency is judged in the shop's own, whichever that is", () => {
    expect(fields(facts({ currency: null }), facts({ currency: "EUR" }), "EUR")).toEqual([]);
    expect(fields(facts({ currency: "EUR" }), facts({ currency: null }), "EUR")).toEqual([]);
    expect(fields(facts({ currency: null }), facts({ currency: "DKK" }), "EUR")).toEqual(["priceCurrency:fail"]);
    expect(fields(facts({ currency: "DKK" }), facts({ currency: null }), "EUR")).toEqual(["priceCurrency:fail"]);
    // The report says what each side was judged as, and why a page naming none reads as one.
    const detail = "a page naming no currency counts as in the shop's own";
    expect(judgeProduct(facts({ currency: null }), facts({ currency: "EUR" }), "DKK")).toEqual([{ field: "priceCurrency", status: "fail", old: "DKK", new: "EUR", detail }]);
    expect(judgeProduct(facts({ currency: "EUR" }), facts({ currency: null }), "DKK")).toEqual([{ field: "priceCurrency", status: "fail", old: "EUR", new: "DKK", detail }]);
    // Offers in two currencies have no one currency to report.
    expect(judgeProduct(facts(), facts({ price: null, unreadablePrice: "offers in DKK and EUR", currency: null, severalCurrencies: true }), "DKK")).toMatchObject([{ field: "priceCurrency", old: "DKK", new: "offers in DKK and EUR" }, { field: "price" }]);
  });

  it("keeps the old and new value of each difference", () => {
    expect(judgeProduct(facts(), facts({ sku: "B", price: 100, availability: "OutOfStock", currency: "DKK", images: 0 }), "DKK")).toEqual([
      { field: "sku", status: "fail", old: "EX-100", new: "B" },
      { field: "price", status: "fail", old: 99900, new: 100, detail: "in integer minor units" },
      { field: "availability", status: "fail", old: "InStock", new: "OutOfStock" },
      { field: "image", status: "fail", old: 1, new: 0 },
    ]);
    expect(judgeProduct(facts({ price: null }), facts({ price: 0 }), "DKK")).toEqual([{ field: "price", status: "warn", new: 0, detail: "the old page's offer names no price, the new one does" }]);
    expect(judgeProduct(facts({ price: null }), facts({ price: null, unreadablePrice: "Call us" }), "DKK")).toMatchObject([{ new: "Call us" }]);
    expect(judgeProduct(facts({ offered: false, price: null }), facts({ price: null, unreadablePrice: "Call us" }), "DKK")).toMatchObject([{ field: "offers", new: "Call us" }]);
    const noOffer = { offered: false, price: null, currency: null, availability: null };
    expect(judgeProduct(facts(noOffer), facts(noOffer), "DKK")).toEqual([{ field: "offers", status: "fail", detail: "the new page makes no offer, and the product is not marked lead-only" }]);
    // What the reader skipped has no value to keep: it is only named, on the old page; on the new one it reads as gone.
    const detail = "the old page writes this field in a shape that is not read, so it cannot be compared";
    expect(judgeProduct(facts(skipped("sku")), facts(), "DKK")).toEqual([{ field: "sku", status: "inconclusive", detail }]);
    expect(judgeProduct(facts(skipped("availability")), facts(), "DKK")).toEqual([{ field: "availability", status: "inconclusive", detail }]);
    expect(judgeProduct(facts(skipped("priceCurrency")), facts(), "DKK")).toEqual([
      { field: "price", status: "inconclusive", old: "a currency that cannot be read", detail: "the old page's price cannot be read as one number, so it cannot be compared" },
      { field: "priceCurrency", status: "inconclusive", detail },
    ]);
    expect(judgeProduct(facts(), facts(skipped("sku")), "DKK")).toEqual([{ field: "sku", status: "fail", old: "EX-100", new: null }]);
    expect(judgeProduct(facts(), facts(skipped("priceCurrency")), "DKK")).toMatchObject([
      { field: "priceCurrency", status: "fail", old: "DKK", new: "a currency that cannot be read" },
      { field: "price", status: "fail", old: 99900, new: "a currency that cannot be read" },
    ]);
  });
});

describe("checkPage — seo.product-jsonld over a pair of pages", () => {
  const script = (body: unknown) => `<script type="application/ld+json">${typeof body === "string" ? body : JSON.stringify(body)}</script>`;
  const htmlOf = (...bodies: unknown[]) => `<!doctype html><html><head><title>Type 1</title>${bodies.map(script).join("")}</head><body><main><h1>Type 1</h1></main></body></html>`;
  /** What the new site emits: another image URL, a string price, a differently spelled availability. */
  const newProduct = (over: Record<string, unknown> = {}) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Invented fence",
    image: ["https://cdn.example.test/type-1.jpg"],
    sku: "EX-100",
    offers: { "@type": "Offer", priceCurrency: "DKK", price: "999.00", availability: "http://schema.org/InStock", url: NEW_URL },
    ...over,
  });
  const answer = (url: string, body: string, extra: Partial<MigrationResponse> = {}): MigrationResponse =>
    ({ outcome: "answer", url, status: 200, location: null, contentType: "text/html", body, truncated: false, xRobotsTag: null, ...extra }) as MigrationResponse;
  const entry = (over: Partial<PageEntry> = {}): PageEntry => ({ oldUrl: OLD_URL, parityStatus: "pass", finalUrl: NEW_URL, ...over });

  async function run(oldPage: MigrationResponse | string, newPage: MigrationResponse | string, e: PageEntry = entry(), currency = "DKK") {
    const of = (url: string, page: MigrationResponse | string) => (typeof page === "string" ? answer(url, page) : page);
    const source = vi.fn<MigrationFetcher>(async () => of(e.oldUrl, oldPage));
    const target = vi.fn<MigrationFetcher>(async () => of(NEW_URL, newPage));
    const res = await checkPage("seo.product-jsonld", e, { targetOrigin: "https://new.example.test", expectedHost: "shop.example.test", source, target, notFound: null, currency });
    return { ...res, source, target, fields: res.findings.map((f) => `${f.field}:${f.status}`) };
  }

  it("a Yoast page and this site's product page saying the same thing pass: number vs string price, https vs http, another image URL", async () => {
    expect(await run(htmlOf(yoast()), htmlOf(newProduct()))).toMatchObject({ status: "pass", findings: [], newUrl: NEW_URL });
  });

  it("a variable product: the old AggregateOffer's lowPrice against the new one's offer", async () => {
    const aggregate = { "@type": "AggregateOffer", lowPrice: "100.00", highPrice: "200.00", priceCurrency: "DKK", availability: "http://schema.org/InStock" };
    expect(await run(htmlOf(yoast(productNode({ offers: [aggregate] }))), htmlOf(newProduct({ offers: { ...aggregate, lowPrice: "100.00" } })))).toMatchObject({ status: "pass" });
    expect(await run(htmlOf(yoast(productNode({ offers: [aggregate] }))), htmlOf(newProduct({ offers: { ...aggregate, lowPrice: "120.00" } })))).toMatchObject({ status: "fail", fields: ["price:fail"] });
    expect(await run(htmlOf(yoast(productNode({ offers: [aggregate] }))), htmlOf(newProduct({ offers: { "@type": "Offer", price: "100.00", priceCurrency: "DKK", availability: "https://schema.org/InStock" } })))).toMatchObject({ status: "pass" });
  });

  it("a real difference fails, with its old and new value; a mismatched currency says so instead of a price difference", async () => {
    const res = await run(htmlOf(yoast()), htmlOf(newProduct({ sku: "cmabc123" })));
    expect(res).toMatchObject({ status: "fail", findings: [{ field: "sku", status: "fail", old: "EX-100", new: "cmabc123" }] });
    expect(await run(htmlOf(yoast()), htmlOf(newProduct({ offers: { "@type": "Offer", priceCurrency: "EUR", price: "134.00", availability: "https://schema.org/InStock" } })))).toMatchObject({ status: "fail", fields: ["priceCurrency:fail"] });
  });

  it("no Product on the old page is a skip; on the new page, while the old has one, a fail", async () => {
    expect(await run(htmlOf({ "@type": "BreadcrumbList" }), htmlOf(newProduct()))).toMatchObject({ status: "skip", findings: [], detail: expect.stringContaining("no Product") });
    expect(await run("<html><body><h1>No JSON-LD at all</h1></body></html>", htmlOf(newProduct()))).toMatchObject({ status: "skip" });
    const gone = await run(htmlOf(yoast()), htmlOf({ "@type": "BreadcrumbList" }));
    expect(gone).toMatchObject({ status: "fail", findings: [{ field: "product", status: "fail", old: "EX-100", new: null, detail: "the new page has no Product structured data" }] });
    expect(await run(htmlOf({ "@type": "BreadcrumbList" }), htmlOf({ "@type": "BreadcrumbList" }))).toMatchObject({ status: "skip" });
  });

  /** The finding a page not read whole leaves, naming which side. */
  const notWhole = (side: "old" | "new") => ({ field: "jsonld", status: "inconclusive", detail: expect.stringContaining(`the ${side} page`) });

  it("JSON that does not parse with no Product elsewhere: the old side is inconclusive, the new side a fail", async () => {
    expect(await run(htmlOf("{broken"), htmlOf(newProduct()))).toMatchObject({ status: "inconclusive", findings: [{ ...notWhole("old"), detail: expect.stringContaining("does not parse") }] });
    const broken = await run(htmlOf(yoast()), htmlOf("{broken"));
    expect(broken).toMatchObject({ status: "fail", fields: ["product:fail"] });
    expect(broken.findings[0].detail).toContain("does not parse");
  });

  it("a block that does not parse beside a readable Product: no difference is inconclusive, naming the side; a difference stays a fail", async () => {
    expect(await run(htmlOf("{broken", yoast()), htmlOf(newProduct()))).toMatchObject({ status: "inconclusive", findings: [notWhole("old")] });
    expect(await run(htmlOf(yoast()), htmlOf("{broken", newProduct()))).toMatchObject({ status: "inconclusive", findings: [notWhole("new")] });
    expect(await run(htmlOf("{broken", yoast()), htmlOf("{broken", newProduct()))).toMatchObject({ status: "inconclusive", findings: [notWhole("old"), notWhole("new")] });
    expect(await run(htmlOf("{broken", yoast()), htmlOf(newProduct({ sku: "X" })))).toMatchObject({ status: "fail", fields: ["sku:fail", "jsonld:inconclusive"] });
    expect(await run(htmlOf(yoast()), htmlOf("{broken", newProduct({ sku: "X" })))).toMatchObject({ status: "fail", fields: ["sku:fail", "jsonld:inconclusive"] });
    const res = await run(htmlOf("{broken", yoast()), htmlOf(newProduct()));
    expect(res.findings[0].detail).toContain("does not parse");
  });

  it("a page cut at the size cap: unknown while no Product was found; once one was, no difference is inconclusive, naming the side, and a difference stays a fail", async () => {
    const cut = (url: string, body: string) => answer(url, body, { truncated: true });
    expect(await run(cut(OLD_URL, "<html><body>…"), htmlOf(newProduct()))).toMatchObject({ status: "inconclusive", findings: [notWhole("old")] });
    expect(await run(htmlOf(yoast()), cut(NEW_URL, "<html><body>…"))).toMatchObject({ status: "inconclusive", findings: [notWhole("new")] });
    expect(await run(cut(OLD_URL, htmlOf(yoast())), htmlOf(newProduct()))).toMatchObject({ status: "inconclusive", findings: [notWhole("old")] });
    expect(await run(htmlOf(yoast()), cut(NEW_URL, htmlOf(newProduct())))).toMatchObject({ status: "inconclusive", findings: [notWhole("new")] });
    expect(await run(cut(OLD_URL, htmlOf(yoast())), cut(NEW_URL, htmlOf(newProduct())))).toMatchObject({ status: "inconclusive", findings: [notWhole("old"), notWhole("new")] });
    expect(await run(cut(OLD_URL, htmlOf(yoast())), cut(NEW_URL, htmlOf(newProduct({ sku: "X" }))))).toMatchObject({ status: "fail", fields: ["sku:fail", "jsonld:inconclusive", "jsonld:inconclusive"] });
    // A warn beside it is no pass either, and no fail: the row stays unknown.
    expect(await run(cut(OLD_URL, htmlOf(yoast(productNode({ image: [IMAGE, `${IMAGE}?2`] })))), htmlOf(newProduct()))).toMatchObject({ status: "inconclusive", fields: ["image:warn", "jsonld:inconclusive"] });
    // Cut and broken on one side: each is said.
    const both = await run(cut(OLD_URL, htmlOf("{broken", yoast())), htmlOf(newProduct()));
    expect(both).toMatchObject({ status: "inconclusive", findings: [notWhole("old"), notWhole("old")] });
    expect(both.findings[0].detail).toContain("over 1024 KB");
    expect(both.findings[1].detail).toContain("does not parse");
  });

  it("what a page not read whole can hide: a cheaper variant is no false pass, and the page's own Product no silent one", async () => {
    const group = { "@type": "ProductGroup", "@id": "#parent", url: OLD_URL, productGroupID: "EX-100", image: IMAGE };
    const variant = (price: number) => ({ "@type": "Product", isVariantOf: { "@id": "#parent" }, image: IMAGE, offers: offer({ price }) });
    const sells100 = htmlOf(selling(100));
    // Read whole, the cheaper variant is the difference.
    expect(await run(htmlOf(group, variant(100), variant(50)), sells100)).toMatchObject({ status: "fail", fields: ["price:fail"] });
    // Past the cut, in a block never closed: what was read agrees, and that is no pass.
    const pastTheCut = `${htmlOf(group, variant(100))}<script type="application/ld+json">{"@type":"Product","isVariantOf":{"@id":"#parent"},"offers":{"price":50`;
    expect(await run(answer(OLD_URL, pastTheCut, { truncated: true }), sells100)).toMatchObject({ status: "inconclusive", findings: [notWhole("old")] });
    // In a block that does not parse: the same.
    expect(await run(htmlOf(group, variant(100), '{"@type":"Product","offers":{"price":50,}}'), sells100)).toMatchObject({ status: "inconclusive", findings: [notWhole("old")] });
    // An accessory read, the page's own Product past the cut: what was read differs, so a fail, and the row says the page was cut.
    const accessory = { "@type": "Product", url: "https://shop.example.test/other", sku: "ACC-1", image: IMAGE, offers: offer() };
    expect(await run(answer(OLD_URL, htmlOf(accessory), { truncated: true }), htmlOf(newProduct()))).toMatchObject({ status: "fail", fields: ["sku:fail", "jsonld:inconclusive"] });
    expect(await run(htmlOf(accessory, "{broken"), htmlOf(newProduct()))).toMatchObject({ status: "fail", fields: ["sku:fail", "jsonld:inconclusive"] });
  });

  it("a new Product with no offers fails, whatever the old page had: a product marked lead-only is left out before this", async () => {
    const noOffers = htmlOf(newProduct({ offers: undefined }));
    const failed = { status: "fail", findings: [{ field: "offers", status: "fail", detail: expect.stringContaining("lead-only") }] };
    expect(await run(htmlOf(yoast(productNode({ offers: undefined }))), noOffers)).toMatchObject(failed);
    expect(await run(htmlOf(yoast()), noOffers)).toMatchObject(failed);
    // A reference to nothing, a blank one included, is no offer either.
    expect(await run(htmlOf(yoast(productNode({ offers: undefined }))), htmlOf(newProduct({ offers: { "@id": "#nowhere" } })))).toMatchObject(failed);
    expect(await run(htmlOf(yoast(productNode({ offers: undefined }))), htmlOf(newProduct({ "@id": NEW_URL, offers: { "@id": " " } })))).toMatchObject(failed);
    expect(await run(htmlOf(yoast()), htmlOf(newProduct({ "@id": NEW_URL, offers: { "@id": "" } })))).toMatchObject(failed);
  });

  it("a plain-permalink shop's page: its query finds its own Product beside another in a flat graph", async () => {
    const PAGE = "https://shop.example.test/?product=fence";
    const gate = { "@type": "Product", url: "https://shop.example.test/?product=gate", sku: "GATE", image: IMAGE, offers: offer({ price: 5 }) };
    const fence = { "@type": "Product", url: PAGE, sku: "EX-100", image: IMAGE, offers: offer() };
    expect(await run(htmlOf({ "@graph": [gate, fence] }), htmlOf(newProduct()), entry({ oldUrl: PAGE }))).toMatchObject({ status: "pass", findings: [] });
    expect(await run(htmlOf({ "@graph": [fence, gate] }), htmlOf(newProduct()), entry({ oldUrl: PAGE }))).toMatchObject({ status: "pass", findings: [] });
  });

  it("a page naming no currency is in the shop's own: against another, the currency fails in both directions and the prices are not compared", async () => {
    const bare = (price: unknown) => ({ "@type": "Offer", price, availability: "https://schema.org/InStock" });
    const oldBare = (price: unknown) => htmlOf(yoast(productNode({ offers: bare(price) })));
    // The same digits in another currency: the false pass.
    expect(await run(oldBare("100.00"), htmlOf(selling("100.00", "EUR")))).toMatchObject({ status: "fail", findings: [{ field: "priceCurrency", status: "fail", old: "DKK", new: "EUR" }] });
    // Different digits, the same minor units: DKK 10.00 and JPY 1000.
    expect(await run(oldBare("10.00"), htmlOf(selling("1000", "JPY")))).toMatchObject({ status: "fail", fields: ["priceCurrency:fail"] });
    // The other way: no price difference invented across scales.
    const inYen = htmlOf(yoast(productNode({ offers: offer({ price: "1000", priceCurrency: "JPY", priceSpecification: undefined }) })));
    expect(await run(inYen, htmlOf(newProduct({ offers: bare("1000") })))).toMatchObject({ status: "fail", findings: [{ field: "priceCurrency", status: "fail", old: "JPY", new: "DKK" }] });
    // In the shop's own, both ways: nothing differs.
    expect(await run(oldBare("999.00"), htmlOf(selling("999.00")))).toMatchObject({ status: "pass", findings: [] });
    expect(await run(htmlOf(yoast()), htmlOf(newProduct({ offers: bare("999.00") })))).toMatchObject({ status: "pass", findings: [] });
    // The shop's own is the run's, not a fixed one, however its config spells it.
    expect(await run(oldBare("100.00"), htmlOf(selling("100.00", "EUR")), entry(), "EUR")).toMatchObject({ status: "pass", findings: [] });
    expect(await run(oldBare("999.00"), htmlOf(selling("999.00")), entry(), " dkk ")).toMatchObject({ status: "pass", findings: [] });
    expect(await run(oldBare("1000"), htmlOf(selling("1000", "JPY")), entry(), " jpy ")).toMatchObject({ status: "pass", findings: [] });
  });

  it("an old price that is no number is inconclusive, never a pass", async () => {
    const res = await run(htmlOf(yoast(productNode({ offers: offer({ price: "1.299,00", priceSpecification: undefined }) }))), htmlOf(newProduct()));
    expect(res).toMatchObject({ status: "inconclusive", findings: [{ field: "price", status: "inconclusive", old: "1.299,00" }] });
  });

  /** The new page's one offer, in stock. */
  const selling = (price: unknown, priceCurrency = "DKK") => newProduct({ offers: { "@type": "Offer", priceCurrency, price, availability: "https://schema.org/InStock" } });
  const oldOffers = (...offers: Record<string, unknown>[]) => htmlOf(yoast(productNode({ offers: offers.map((o) => offer({ priceSpecification: undefined, ...o })) })));

  it("one old price that is no number beside readable ones leaves the lowest unknown: neither the false pass nor the false fail the others would give", async () => {
    const unknown = (old: string) => ({ status: "inconclusive", findings: [{ field: "price", status: "inconclusive", old, detail: "the old page's price cannot be read as one number, so it cannot be compared" }] });
    expect(await run(oldOffers({ price: "9,00" }, { price: "50.00" }), htmlOf(selling("50.00")))).toMatchObject(unknown("9,00"));
    expect(await run(oldOffers({ price: "899,50" }, { price: 1500 }), htmlOf(selling("899.50")))).toMatchObject(unknown("899,50"));
    expect(await run(oldOffers({ price: 1500 }, { price: "899,50" }), htmlOf(selling("1500.00")))).toMatchObject(unknown("899,50"));
  });

  it("one new price that is no number beside readable ones is our own page unreadable: a fail, never a pass on the readable one", async () => {
    const newOffers = newProduct({ offers: [{ "@type": "Offer", priceCurrency: "DKK", price: "9,00", availability: "https://schema.org/InStock" }, { "@type": "Offer", priceCurrency: "DKK", price: "50.00", availability: "https://schema.org/InStock" }] });
    expect(await run(oldOffers({ price: "50.00" }), htmlOf(newOffers))).toMatchObject({ status: "fail", findings: [{ field: "price", status: "fail", old: 5000, new: "9,00" }] });
  });

  it("an old offer naming no price against a new 0.00 is a warn, as with no offer at all: never silent", async () => {
    const warned = { status: "warn", findings: [{ field: "price", status: "warn", new: 0, detail: "the old page's offer names no price, the new one does" }] };
    const zero = htmlOf(selling("0.00"));
    expect(await run(oldOffers({ price: "" }), zero)).toMatchObject(warned);
    expect(await run(oldOffers({ price: undefined }), zero)).toMatchObject(warned);
    expect(await run(oldOffers({ price: null }), zero)).toMatchObject(warned);
    expect(await run(htmlOf(yoast(productNode({ offers: { "@type": "AggregateOffer", offerCount: 0, priceCurrency: "DKK", offers: [] } }))), zero)).toMatchObject({ status: "warn", fields: ["price:warn"] });
    // A real price on the new page is no more explained by the old page than 0.00 is.
    expect(await run(oldOffers({ price: "" }), htmlOf(selling("999.00")))).toMatchObject({ status: "warn", findings: [{ field: "price", status: "warn", new: 99900 }] });
    // What the warn is the same case as: no offer on the old page at all.
    expect(await run(htmlOf(yoast(productNode({ offers: undefined }))), zero)).toMatchObject({ status: "warn", fields: ["offers:warn"] });
    // The stock on such an offer is still held to.
    expect(await run(oldOffers({ price: "" }), htmlOf(newProduct({ offers: { "@type": "Offer", priceCurrency: "DKK", price: "0.00", availability: "https://schema.org/OutOfStock" } })))).toMatchObject({ status: "fail", fields: ["price:warn", "availability:fail"] });
  });

  it("offers in two currencies on the old page are inconclusive whichever comes first: no price changed unseen, no currency change invented", async () => {
    const twoOf = { status: "inconclusive", findings: [{ field: "price", status: "inconclusive", old: "offers in DKK and EUR" }] };
    expect(await run(oldOffers({ price: 100 }, { price: 10, priceCurrency: "EUR" }), htmlOf(selling("10.00")))).toMatchObject(twoOf);
    expect(await run(oldOffers({ price: 100 }, { price: 10, priceCurrency: "EUR" }), htmlOf(selling("100.00")))).toMatchObject(twoOf);
    expect(await run(oldOffers({ price: 10, priceCurrency: "EUR" }, { price: 100 }), htmlOf(selling("100.00")))).toMatchObject({ status: "inconclusive", fields: ["price:inconclusive"] });
    // No scale of the first currency reaches the second's price: JPY has no minor unit, USD two.
    expect(await run(oldOffers({ price: 1000, priceCurrency: "JPY" }, { price: "10.00", priceCurrency: "USD" }), htmlOf(selling(1000, "JPY")))).toMatchObject({ status: "inconclusive", fields: ["price:inconclusive"] });
  });

  describe("a field written in a shape the reader skips", () => {
    const bareOffer = (over: Record<string, unknown>) => offer({ priceSpecification: undefined, ...over });
    const OUT = "https://schema.org/OutOfStock";

    // Each of these read `pass` before: an old USD 999 as the shop's DKK 999, an old OutOfStock as no stock named, an old sku B as none.
    it.each<[string, Record<string, unknown>, string[]]>([
      ['priceCurrency ["USD"]', productNode({ offers: bareOffer({ priceCurrency: ["USD"] }) }), ["price:inconclusive", "priceCurrency:inconclusive"]],
      ['priceCurrency {"@id":"USD"}', productNode({ offers: bareOffer({ priceCurrency: { "@id": "USD" } }) }), ["price:inconclusive", "priceCurrency:inconclusive"]],
      ['availability {"@id":…/OutOfStock}', productNode({ offers: offer({ availability: { "@id": OUT } }) }), ["availability:inconclusive"]],
      ["availability [\"…/OutOfStock\"]", productNode({ offers: offer({ availability: [OUT] }) }), ["availability:inconclusive"]],
      ["availability …/OutOfStock/", productNode({ offers: offer({ availability: `${OUT}/` }) }), ["availability:inconclusive"]],
      ['sku ["B"]', productNode({ sku: ["B"] }), ["sku:inconclusive"]],
      ['sku {"@type":"PropertyValue","value":"B"}', productNode({ sku: { "@type": "PropertyValue", value: "B" } }), ["sku:inconclusive"]],
    ])("an old %s against a new page in DKK, in stock, with sku EX-100: inconclusive, never a pass", async (_shape, old, expected) => {
      const res = await run(htmlOf(yoast(old)), htmlOf(newProduct()));
      expect(res).toMatchObject({ status: "inconclusive", fields: expected });
    });

    it("a visible difference elsewhere stays a fail, the unread field named beside it", async () => {
      const inList = htmlOf(yoast(productNode({ offers: bareOffer({ priceCurrency: ["USD"] }) })));
      expect(await run(inList, htmlOf(newProduct({ sku: "X" })))).toMatchObject({ status: "fail", fields: ["sku:fail", "price:inconclusive", "priceCurrency:inconclusive"] });
      expect(await run(htmlOf(yoast(productNode({ sku: ["B"] }))), htmlOf(selling("1.00")))).toMatchObject({ status: "fail", fields: ["price:fail", "sku:inconclusive"] });
      expect(await run(htmlOf(yoast(productNode({ offers: offer({ availability: [OUT] }) }))), htmlOf(newProduct({ image: [] })))).toMatchObject({ status: "fail", fields: ["image:fail", "availability:inconclusive"] });
      // A warn beside it is no pass either, and no fail.
      expect(await run(htmlOf(yoast(productNode({ sku: ["B"], image: [IMAGE, `${IMAGE}?2`] }))), htmlOf(newProduct()))).toMatchObject({ status: "inconclusive", fields: ["image:warn", "sku:inconclusive"] });
    });

    it("the field itself invents no difference: what was not read is not compared, whatever else the page says", async () => {
      const inList = (code: string) => htmlOf(yoast(productNode({ offers: bareOffer({ priceCurrency: [code], price: 1000 }) })));
      // In truth the same currency as the new page's, though not the shop's, and another scale.
      expect(await run(inList("JPY"), htmlOf(selling("1000", "JPY")))).toMatchObject({ status: "inconclusive", fields: ["price:inconclusive", "priceCurrency:inconclusive"] });
      // A currency beside one that reads, whose price would otherwise be taken for the lowest.
      expect(await run(oldOffers({ price: 50, priceCurrency: ["USD"] }, { price: 999 }), htmlOf(newProduct()))).toMatchObject({ status: "inconclusive", fields: ["price:inconclusive", "priceCurrency:inconclusive"] });
      // A stand-in that differs from the sku it stands in for.
      expect(await run(htmlOf(yoast(productNode({ sku: ["EX-100"], productGroupID: "GROUP-1" }))), htmlOf(newProduct()))).toMatchObject({ status: "inconclusive", fields: ["sku:inconclusive"] });
      // A readable stock beside the unread one, which could be in stock as the new page is.
      expect(await run(oldOffers({ availability: ["https://schema.org/InStock"] }, { availability: OUT }), htmlOf(newProduct()))).toMatchObject({ status: "inconclusive", fields: ["availability:inconclusive"] });
    });

    it("a blank or null field is no value and no such shape: compared as before", async () => {
      expect(await run(oldOffers({ priceCurrency: "  " }), htmlOf(newProduct()))).toMatchObject({ status: "pass", findings: [] });
      expect(await run(oldOffers({ priceCurrency: null }), htmlOf(newProduct()))).toMatchObject({ status: "pass", findings: [] });
      expect(await run(oldOffers({ availability: "" }), htmlOf(newProduct()))).toMatchObject({ status: "pass", findings: [] });
      expect(await run(htmlOf(yoast(productNode({ sku: "" }))), htmlOf(newProduct()))).toMatchObject({ status: "pass", findings: [] });
    });

    it("on the new page, our own, it is a fail: the field reads as gone, and a currency as the difference", async () => {
      const inList = (over: Record<string, unknown>) => htmlOf(newProduct({ offers: { "@type": "Offer", priceCurrency: "DKK", price: "999.00", availability: "https://schema.org/InStock", ...over } }));
      const REASON = "a currency that cannot be read";
      // The same digits: the false pass this would be, with the currency read as the shop's own.
      expect(await run(htmlOf(yoast()), inList({ priceCurrency: ["USD"] }))).toMatchObject({ status: "fail", findings: [{ field: "priceCurrency", status: "fail", old: "DKK", new: REASON }, { field: "price", status: "fail", old: 99900, new: REASON }] });
      expect(await run(htmlOf(yoast()), inList({ priceCurrency: { "@id": "DKK" } }))).toMatchObject({ status: "fail", fields: ["priceCurrency:fail", "price:fail"] });
      expect(await run(htmlOf(yoast()), inList({ availability: { "@id": "https://schema.org/InStock" } }))).toMatchObject({ status: "fail", findings: [{ field: "availability", status: "fail", old: "InStock", new: null }] });
      expect(await run(htmlOf(yoast()), inList({ availability: "https://schema.org/InStock/" }))).toMatchObject({ status: "fail", fields: ["availability:fail"] });
      expect(await run(htmlOf(yoast()), htmlOf(newProduct({ sku: ["EX-100"] })))).toMatchObject({ status: "fail", findings: [{ field: "sku", status: "fail", old: "EX-100", new: null }] });
      // A stand-in that says the same does not hide it.
      expect(await run(htmlOf(yoast()), htmlOf(newProduct({ sku: ["B"], productGroupID: "EX-100" })))).toMatchObject({ status: "fail", fields: ["sku:fail"] });
      // A readable stock beside the unread one.
      const twoOffers = newProduct({ offers: [{ "@type": "Offer", priceCurrency: "DKK", price: "999.00", availability: ["x"] }, { "@type": "Offer", priceCurrency: "DKK", price: "999.00", availability: "https://schema.org/InStock" }] });
      expect(await run(htmlOf(yoast()), htmlOf(twoOffers))).toMatchObject({ status: "fail", fields: ["availability:fail"] });
    });
  });

  // The CHANGELOG's MIGD-4b and MIGD-4c entries name each of these. Red here means a limit closed: take it out of the entry.
  describe("known limits: a row that passes with a value not compared", () => {
    const bareOffer = (over: Record<string, unknown> = {}) => offer({ priceSpecification: undefined, ...over });
    const IN_STOCK = "https://schema.org/InStock";
    const highOnly = (highPrice: number) => ({ "@type": "AggregateOffer", highPrice, priceCurrency: "DKK", availability: IN_STOCK });
    const nested = (node: unknown, levels: number): unknown => (levels === 0 ? node : { inside: nested(node, levels - 1) });

    it.each<[string, string, string]>([
      ["a variable product's other variants: another dearer price, and one out of stock where the new one is in", oldOffers({ price: 5 }, { price: 10, availability: "https://schema.org/OutOfStock" }), htmlOf(newProduct({ offers: [{ "@type": "Offer", priceCurrency: "DKK", price: 5, availability: IN_STOCK }, { "@type": "Offer", priceCurrency: "DKK", price: 20, availability: IN_STOCK }] }))],
      ["both pages make an offer naming no price", oldOffers({ price: undefined }), htmlOf(selling(undefined))],
      ["both name a price only where it is not read, and they differ", htmlOf(yoast(productNode({ offers: highOnly(200) }))), htmlOf(newProduct({ offers: highOnly(900) }))],
      ["an old sku only on its offer counts as none", htmlOf(yoast(productNode({ sku: undefined, offers: bareOffer({ sku: "B" }) }))), htmlOf(newProduct({ sku: "X" }))],
      ["on a DKK shop an old offer naming no currency takes another's: 5 in the shop's own reads as 5 USD", oldOffers({ price: 10, priceCurrency: "USD" }, { price: 5, priceCurrency: undefined }), htmlOf(selling("5.00", "USD"))],
      ["the same on the new page", oldOffers({ price: 5, priceCurrency: "USD" }), htmlOf(newProduct({ offers: [{ "@type": "Offer", priceCurrency: "USD", price: 10, availability: IN_STOCK }, { "@type": "Offer", price: 5, availability: IN_STOCK }] }))],
      ["an old image that is a number reads as no image", htmlOf(yoast(productNode({ image: 5 }))), htmlOf(newProduct({ image: undefined }))],
      ["an old image in a nested list the same", htmlOf(yoast(productNode({ image: [[IMAGE]] }))), htmlOf(newProduct({ image: undefined }))],
      ["a new image node naming nothing counts as one image", htmlOf(yoast()), htmlOf(newProduct({ image: { "@type": "ImageObject", url: "" } }))],
      ["an old offers entry that is not a node is left out", htmlOf(yoast(productNode({ offers: ["a cheaper one", bareOffer()] }))), htmlOf(newProduct())],
      ["an old offers entry referring to nothing is left out", htmlOf(yoast(productNode({ offers: [{ "@id": "#nowhere" }, bareOffer()] }))), htmlOf(newProduct())],
      ["an old offer nested past 32 levels is not read", htmlOf({ "@graph": [productNode({ offers: [{ "@id": "#cheap" }, bareOffer()] }), nested(bareOffer({ "@id": "#cheap", price: 1 }), 40)] }), htmlOf(newProduct())],
      ["an old JSON-LD block never closed, on a page that was not cut, is not counted as unread", `${htmlOf(yoast())}<script type="application/ld+json">{"@type":"Offer","price":1`, htmlOf(newProduct())],
      ["an old node described twice under one @id is not merged: the first description, with the lower price, goes unread", htmlOf({ "@graph": [productNode({ offers: { "@id": "#offer" } }), bareOffer({ "@id": "#offer", price: 1 }), bareOffer({ "@id": "#offer" })] }), htmlOf(newProduct())],
      ["a new sku in a shape the reader skips, with no old sku to hold it to", htmlOf(yoast(productNode({ sku: undefined }))), htmlOf(newProduct({ sku: ["B"] }))],
      ["a new availability the same", oldOffers({ availability: undefined }), htmlOf(newProduct({ offers: { "@type": "Offer", priceCurrency: "DKK", price: "999.00", availability: ["x"] } }))],
    ])("%s", async (_name, oldPage, newPage) => {
      expect(await run(oldPage, newPage)).toMatchObject({ status: "pass", findings: [] });
    });
  });

  it("the same old image named twice, against one on the new page, is a pass; two different ones still a warn", async () => {
    const twice = htmlOf(yoast(productNode({ image: [IMAGE, { "@type": "ImageObject", url: IMAGE }] })));
    expect(await run(twice, htmlOf(newProduct()))).toMatchObject({ status: "pass", findings: [] });
    const two = htmlOf(yoast(productNode({ image: [IMAGE, { "@type": "ImageObject", url: `${IMAGE}?2` }] })));
    expect(await run(two, htmlOf(newProduct()))).toMatchObject({ status: "warn", findings: [{ field: "image", status: "warn", old: 2, new: 1 }] });
    // The new page counts the same way: one image named twice is not two.
    expect(await run(two, htmlOf(newProduct({ image: ["https://cdn.example.test/a.jpg", "https://cdn.example.test/a.jpg"] })))).toMatchObject({ status: "warn", findings: [{ field: "image", old: 2, new: 1 }] });
  });

  it("an accessory with a #fragment @id listed before the page's own Product: the page's own is compared", async () => {
    const accessory = { "@type": "Product", "@id": "#accessory-1", sku: "ACC-1", offers: offer({ price: 5 }) };
    const mine = { "@type": "Product", "@id": "#product", url: OLD_URL, sku: "EX-100", image: IMAGE, offers: offer() };
    expect(await run(htmlOf({ "@graph": [accessory, mine] }), htmlOf(newProduct()))).toMatchObject({ status: "pass", findings: [] });
    const inline = { "@type": "Product", sku: "EX-100", image: IMAGE, offers: offer(), mainEntityOfPage: { "@type": "WebPage", url: OLD_URL } };
    expect(await run(htmlOf({ "@graph": [{ ...accessory, "@id": undefined, url: "https://shop.example.test/fences/other/" }, inline] }), htmlOf(newProduct()))).toMatchObject({ status: "pass", findings: [] });
  });

  it.each([
    ["url.parity did not pass it", entry({ parityStatus: "fail" })],
    ["url.parity never ran", entry({ parityStatus: null, finalUrl: null })],
    ["url.parity measured another new site", entry({ finalUrl: "https://other.example.test/x" })],
    ["a variant URL, out of scope here", entry({ oldUrl: `${OLD_URL}?attribute_pa_color=black` })],
    ["a local attribute's variant URL", entry({ oldUrl: `${OLD_URL}?attribute_color=black` })],
  ])("skip when %s — nothing is fetched", async (_why, e) => {
    const res = await run(htmlOf(yoast()), htmlOf(newProduct()), e);
    expect(res.status).toBe("skip");
    expect(res.source).not.toHaveBeenCalled();
    expect(res.target).not.toHaveBeenCalled();
  });

  it("an ordinary query is not a variant URL", async () => {
    expect((await run(htmlOf(yoast()), htmlOf(newProduct()), entry({ oldUrl: `${OLD_URL}?utm_source=x` }))).status).toBe("pass");
  });

  it("a variant listed before its group in a flat graph: the group is compared, not the variant", async () => {
    const variant = { "@type": "Product", "@id": `${OLD_URL}#v1`, url: `${OLD_URL}?attribute_pa_color=black`, sku: "EX-V1", image: IMAGE, offers: offer({ price: 1200 }) };
    const group = { "@type": "ProductGroup", "@id": `${OLD_URL}#group`, url: OLD_URL, sku: "EX-100", image: IMAGE, hasVariant: [{ "@id": variant["@id"] }], offers: offer() };
    expect(await run(htmlOf({ "@graph": [variant, group] }), htmlOf(newProduct()))).toMatchObject({ status: "pass", findings: [] });
    expect(await run(htmlOf({ "@graph": [group, variant] }), htmlOf(newProduct()))).toMatchObject({ status: "pass", findings: [] });
  });

  it("variants naming their group in isVariantOf: their prices and images are compared, never reported as no offer", async () => {
    const group = { "@type": "ProductGroup", "@id": "#parent", url: OLD_URL, productGroupID: "EX-100" };
    const variant = (price: number, image: string) => ({ "@type": "Product", isVariantOf: { "@id": "#parent" }, image, offers: offer({ price }) });
    const block = [group, variant(999, IMAGE), variant(1200, `${IMAGE}?2`)];
    expect(await run(htmlOf(block), htmlOf(newProduct({ image: ["https://cdn.example.test/1.jpg", "https://cdn.example.test/2.jpg"] })))).toMatchObject({ status: "pass", findings: [] });
    expect(await run(htmlOf(block), htmlOf(newProduct({ offers: { "@type": "Offer", priceCurrency: "DKK", price: "950.00", availability: "https://schema.org/InStock" } })))).toMatchObject({ status: "fail", fields: ["price:fail", "image:warn"] });
  });

  it("an old group's three different variant images against one on the new page is a warn, not a pass", async () => {
    const group = { "@type": "ProductGroup", url: OLD_URL, sku: "EX-100", hasVariant: [1, 2, 3].map((n) => ({ "@type": "Product", image: `${IMAGE}?${n}`, offers: offer() })) };
    expect(await run(htmlOf(group), htmlOf(newProduct()))).toMatchObject({ status: "warn", findings: [{ field: "image", status: "warn", old: 3, new: 1 }] });
  });

  it("an old price that is empty beside a real one, or written only in priceSpecification, is compared: no pass on a price it never read", async () => {
    const other = { "@type": "Offer", priceCurrency: "DKK", price: "1.00", availability: "https://schema.org/InStock" };
    const fails = { status: "fail", fields: ["price:fail"], findings: [{ field: "price", old: 99900, new: 100 }] };
    expect(await run(htmlOf(yoast(productNode({ offers: offer({ price: "" }) }))), htmlOf(newProduct({ offers: other })))).toMatchObject(fails);
    expect(await run(htmlOf(yoast(productNode({ offers: { "@type": "AggregateOffer", lowPrice: "", priceCurrency: "DKK", offers: [offer()] } }))), htmlOf(newProduct({ offers: other })))).toMatchObject(fails);
    expect(await run(htmlOf(yoast(productNode({ offers: offer({ price: undefined, priceSpecification: [{ price: null }, { price: 999 }] }) }))), htmlOf(newProduct({ offers: other })))).toMatchObject(fails);
  });

  it("an offer named by reference is compared whichever way the reference is spelled", async () => {
    const graph = (ref: Record<string, unknown>, id: string) => ({ "@graph": [productNode({ offers: ref }), offer({ "@id": id })] });
    const other = { "@type": "Offer", priceCurrency: "DKK", price: "1.00", availability: "https://schema.org/InStock" };
    const spellings: [Record<string, unknown>, string][] = [[{ "@id": "#offer" }, `${OLD_URL}#offer`], [{ "@id": `${OLD_URL}#offer` }, "#offer"], [{ "@id": "#offer", "@type": "Offer" }, "#offer"]];
    for (const [ref, id] of spellings) {
      expect(await run(htmlOf(graph(ref, id)), htmlOf(newProduct({ offers: other })))).toMatchObject({ status: "fail", fields: ["price:fail"] });
      expect(await run(htmlOf(graph(ref, id)), htmlOf(newProduct()))).toMatchObject({ status: "pass", findings: [] });
    }
  });

  it("an old price nested too deep to print is inconclusive, and does not stop the run", async () => {
    const deep = `{"@type":"Product","sku":"EX-100","offers":{"@type":"Offer","priceCurrency":"DKK","availability":"https://schema.org/InStock","price":${"[".repeat(50_000)}${"]".repeat(50_000)}}}`;
    expect(await run(htmlOf(deep), htmlOf(newProduct()))).toMatchObject({ status: "inconclusive", fields: ["price:inconclusive"] });
  });

  it("an old page that does not answer 200 is inconclusive; a new page gone since url.parity is a fail", async () => {
    expect(await run({ outcome: "inconclusive", url: OLD_URL, status: 503, reason: "HTTP 503" }, htmlOf(newProduct()))).toMatchObject({ status: "inconclusive" });
    expect(await run(answer(OLD_URL, "", { status: 404 }), htmlOf(newProduct()))).toMatchObject({ status: "inconclusive" });
    expect(await run(htmlOf(yoast()), answer(NEW_URL, "", { status: 404 }))).toMatchObject({ status: "fail" });
    expect(await run(htmlOf(yoast()), { outcome: "inconclusive", url: NEW_URL, status: 0, reason: "timeout" })).toMatchObject({ status: "inconclusive" });
  });
});
