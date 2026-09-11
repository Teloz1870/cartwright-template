import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";

// /pricing.md — machine-readable pricing for agents making purchase
// recommendations. A storefront's pricing IS public information (every PDP
// shows it); this file gives agents the model in one fetch: currency, VAT
// treatment, live price range, and where the per-product truth lives.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const brand = await getBrand();
  if (!brand.ecommerceEnabled) {
    // A website-mode brand sells nothing — a pricing file would be a false
    // advertisement. Real 404, matching the profile-aware discovery rule.
    return new Response("Not Found", { status: 404 });
  }

  const base = brand.url.replace(/\/+$/, "");
  const currency = brand.policies?.currency || "DKK";
  const vat = brand.policies?.pricesIncludeVat
    ? "All displayed prices include VAT."
    : "Displayed prices exclude VAT.";
  const today = new Date().toISOString().slice(0, 10);

  // Live price range over visible products (fail-soft: a DB hiccup renders
  // the file without the range rather than 500ing a discovery surface).
  // Feltet hedder priceDkk men lagrer øre (minor units) — deliberate legacy.
  const range = await prisma.product
    .aggregate({
      where: { deletedAt: null },
      _min: { priceDkk: true },
      _max: { priceDkk: true },
      _count: { _all: true },
    })
    .catch(() => null);
  const fmt = (oere: number) => `${(oere / 100).toFixed(2)} ${currency}`;
  const rangeLine =
    range && range._count._all > 0 && range._min?.priceDkk != null && range._max?.priceDkk != null
      ? `The catalogue currently lists ${range._count._all} products from ${fmt(range._min.priceDkk)} to ${fmt(range._max.priceDkk)}.`
      : "The catalogue is being stocked; per-product prices appear on each product page.";

  // Concrete per-product price table (capped — this is a pricing summary, not
  // the catalogue; the API below is the full truth). Fail-soft like the range.
  const PRICE_TABLE_CAP = 50;
  const products = await prisma.product
    .findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      take: PRICE_TABLE_CAP,
      select: {
        name: true,
        slug: true,
        priceDkk: true,
        stock: true,
        variants: { select: { priceDkk: true, stock: true } },
      },
    })
    .catch(() => []);
  // Variant products: the buyable truth lives on the variants — price becomes
  // "from <cheapest variant>" and availability counts variant stock, so a
  // base row with stock 0 but purchasable variants is not published as sold
  // out (and vice versa).
  const rowFor = (p: (typeof products)[number]) => {
    const hasVariants = p.variants.length > 0;
    const price = hasVariants
      ? `from ${fmt(Math.min(...p.variants.map((v) => v.priceDkk)))}`
      : fmt(p.priceDkk);
    const inStock = hasVariants
      ? p.variants.some((v) => v.stock > 0)
      : p.stock > 0;
    return `| [${p.name.replace(/\|/g, "\\|")}](${base}/${brand.defaultLocale}/product/${p.slug}) | ${price} | ${inStock ? "In stock" : "Out of stock"} |`;
  };
  const priceTable =
    products.length > 0
      ? [
          "## Current prices",
          "",
          "| Product | Price | Availability |",
          "|---|---|---|",
          ...products.map(rowFor),
          ...(range && range._count._all > PRICE_TABLE_CAP
            ? ["", `_First ${PRICE_TABLE_CAP} of ${range._count._all} products — the API below returns the full catalogue._`]
            : []),
          "",
        ].join("\n")
      : "";

  const body = `---
title: "Pricing — ${brand.storeName}"
description: "Machine-readable pricing model for ${brand.storeName}: currency, VAT treatment, live price range and where per-product prices live."
canonical: "${base}/pricing.md"
last-updated: "${today}"
---

# Pricing

## Model

${brand.storeName} is a retail storefront: every product carries its own public
price in **${currency}**. ${vat} There are no subscriptions, seats or metered
tiers — the price on the product page is the price at checkout, plus shipping
where applicable.

${rangeLine}

${priceTable}## Where agents read prices

- **Product pages** — each PDP embeds a Schema.org \`Offer\` (price, currency,
  availability) in JSON-LD.
- **API** — \`POST ${base}/api/v1/tools/products.search\` returns prices in
  minor units (\`priceDkk\`, øre); anonymous, rate-limited. Contract:
  [OpenAPI 3.1](${base}/openapi.json).
- **Sitemap** — every product URL: [sitemap](${base}/sitemap.xml).

## Shipping and checkout

Shipping is priced at checkout by destination and method. Payment is card via
Stripe.${brand.policies?.pricesIncludeVat ? "" : " VAT is added at checkout where applicable."}

## More

- [\`llms.txt\`](${base}/llms.txt) — site overview for agents
- [\`auth.md\`](${base}/auth.md) — API authentication
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
