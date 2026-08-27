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

## Where agents read prices

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
