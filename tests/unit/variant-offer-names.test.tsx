import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import VariantPicker, { type VariantOption } from "@/components/VariantPicker";
import { variantDisplayName } from "@/lib/product-attributes";
import {
  buildProductJsonLd,
  buildProductOffersJsonLd,
} from "@/lib/storefront-jsonld";
import da from "@/messages/da.json";
import en from "@/messages/en.json";

/**
 * CONTENT-READ-a — an agent reading a product page must be able to tell the
 * variants apart, and must not need JavaScript to do it.
 *
 * Two truths are locked here. (1) Every variant `Offer` in the Product JSON-LD
 * carries the variant's name next to its sku, price and availability — before,
 * the three Northbound offers for one coffee differed only by sku
 * (`filter-250`, `whole-1kg`, `whole-250`). (2) The server-rendered PDP markup
 * prints each variant's name and stock state as TEXT — the `<details>` list in
 * VariantPicker — so a crawler that never runs the picker's JavaScript (and a
 * shopper before touching a select) reads the same facts as the JSON-LD.
 *
 * The PDP route itself cannot be unit-rendered (Prisma, next-intl server
 * context), so the page's own seam is the builder input it passes; the picker
 * is rendered the way `tests/unit/add-to-cart-aria.test.tsx` renders its
 * sibling island.
 */

const VARIANTS: VariantOption[] = [
  {
    id: "v_filter",
    sku: "filter-250",
    priceDkk: 12900,
    stock: 4,
    attributes: { "Grind & size": "Ground for filter, 250 g" },
  },
  {
    id: "v_whole",
    sku: "whole-1kg",
    priceDkk: 39900,
    stock: 0,
    attributes: { "Grind & size": "Whole beans, 1 kg" },
  },
];

function render(locale: "en" | "da"): string {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : da}>
      <VariantPicker
        productId="p_1"
        productName="Colombia Supremo"
        basePriceDkk={12900}
        variants={VARIANTS}
      />
    </NextIntlClientProvider>,
  );
  // The "no-JS truth": what is left once every script block is gone. Static
  // markup has none, but the assertion should not depend on that staying so.
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

describe("variantDisplayName — the variant as the picker shows it", () => {
  it("joins the attribute values in authoring order, keys left out", () => {
    expect(variantDisplayName({ "Grind & size": "Whole beans, 250 g" })).toBe(
      "Whole beans, 250 g",
    );
    expect(variantDisplayName({ height: "2m", width: "3m", colour: "grey" })).toBe(
      "2m · 3m · grey",
    );
  });

  it("is null when there is nothing a reader could show", () => {
    expect(variantDisplayName(null)).toBeNull();
    expect(variantDisplayName({})).toBeNull();
    expect(variantDisplayName({ size: "  " })).toBeNull();
    expect(variantDisplayName("250 g")).toBeNull();
  });
});

describe("each variant Offer in the product JSON-LD is told apart by name", () => {
  const offers = buildProductOffersJsonLd({
    productUrl: "https://example.com/en/product/colombia-supremo",
    currency: "DKK",
    country: "DK",
    shippingDefaultDkk: 3900,
    returnDays: 30,
    priceValidUntil: "2027-10-03",
    priceDkk: 12900,
    inStock: true,
    variants: VARIANTS.map((v) => ({
      sku: v.sku,
      priceDkk: v.priceDkk,
      stock: v.stock,
      name: variantDisplayName(v.attributes),
    })),
  });
  const product = buildProductJsonLd({
    name: "Colombia Supremo",
    description: "A washed Colombian coffee.",
    images: [],
    sku: "p_1",
    offers,
  });
  const variantOffers = (product.offers as { offers: Array<Record<string, unknown>> })
    .offers;

  it("names every Offer, next to sku, price and availability", () => {
    expect(variantOffers).toHaveLength(2);
    expect(variantOffers[0]).toMatchObject({
      "@type": "Offer",
      name: "Ground for filter, 250 g",
      sku: "filter-250",
      price: "129.00",
      availability: "https://schema.org/InStock",
    });
    expect(variantOffers[1]).toMatchObject({
      "@type": "Offer",
      name: "Whole beans, 1 kg",
      sku: "whole-1kg",
      price: "399.00",
      availability: "https://schema.org/OutOfStock",
    });
    // Two offers, two different names — the point of the change.
    expect(new Set(variantOffers.map((o) => o.name)).size).toBe(2);
  });

  it("the PDP route passes the picker's name into the builder", () => {
    // The route cannot be rendered here (Prisma + next-intl server context),
    // so lock the seam in its source: inside the offers call, each variant is
    // mapped with `name: variantDisplayName(…)`.
    const src = readFileSync("app/[locale]/product/[slug]/page.tsx", "utf8");
    const start = src.indexOf("buildProductOffersJsonLd({");
    expect(start).toBeGreaterThan(-1);
    const call = src.slice(start, src.indexOf("});", start));
    expect(call).toMatch(/name:\s*variantDisplayName\(/);
  });

  it("emits no `name` key for a variant that has none (legacy shape intact)", () => {
    const legacy = buildProductOffersJsonLd({
      productUrl: "https://example.com/en/product/frame",
      currency: "DKK",
      country: "DK",
      shippingDefaultDkk: 0,
      returnDays: 14,
      priceValidUntil: "2027-10-03",
      priceDkk: 9900,
      inStock: true,
      variants: [
        { sku: "A", priceDkk: 9900, stock: 1 },
        { sku: "B", priceDkk: 9900, stock: 1, name: null },
      ],
    });
    for (const offer of (legacy as { offers: Array<Record<string, unknown>> }).offers) {
      expect(offer).not.toHaveProperty("name");
      expect(offer).toHaveProperty("sku");
    }
  });
});

describe("no-JS truth: the PDP markup prints variant names and stock as text", () => {
  it("English: both names and both stock states are element text, not script", () => {
    const html = render("en");
    // Name as text content (`>…<`), not merely an attribute value.
    expect(html).toContain(">Ground for filter, 250 g<");
    expect(html).toContain(">Whole beans, 1 kg<");
    expect(html).toContain(">In stock<");
    expect(html).toContain(">Sold out<");
    // The list is a native disclosure — readable with no JavaScript at all.
    expect(html).toMatch(/<details[\s>]/);
    expect(html).toContain(">Availability by variant<");
  });

  it("pairs each name with ITS stock state, in picker order", () => {
    const html = render("en");
    // The <option>s print the names too; the pairing lives in the list.
    const list = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
    expect(list.length).toBeGreaterThan(0);
    const filter = list.indexOf(">Ground for filter, 250 g<");
    const whole = list.indexOf(">Whole beans, 1 kg<");
    const inStock = list.indexOf(">In stock<");
    const soldOut = list.indexOf(">Sold out<");
    expect(filter).toBeGreaterThan(-1);
    expect(whole).toBeGreaterThan(filter);
    // "In stock" sits between the first name and the second; "Sold out" after the second.
    expect(inStock).toBeGreaterThan(filter);
    expect(inStock).toBeLessThan(whole);
    expect(soldOut).toBeGreaterThan(whole);
  });

  it("Danish: the stock words follow the page locale", () => {
    const html = render("da");
    expect(html).toContain(">På lager<");
    expect(html).toContain(">Udsolgt<");
    expect(html).toContain(">Lager pr. variant<");
    expect(html).not.toContain(">In stock<");
  });

  it("the picker's own <select> still offers the same values", () => {
    const html = render("en");
    expect(html).toContain('<option value="Ground for filter, 250 g">');
    expect(html).toContain('<option value="Whole beans, 1 kg">');
  });
});
