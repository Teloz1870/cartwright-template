import type { IndustryTemplate } from "../types";

/**
 * ULTRAPLAN-lite UL4: generic Demo Shop fallback-template.
 *
 * Bruges når brand.industryTemplate ikke matcher en kendt template, eller
 * når en frisk fork vil have minimal placeholder-content frem for solbrille-
 * eller hegn-data. Indeholder 2 kategorier + 6 produkter + 4 standard-pages.
 *
 * Forkers første skridt: kør seed → få Demo Shop → erstat med rigtigt indhold
 * via /admin (eller skift industryTemplate til noget passende).
 */
export const genericTemplate: IndustryTemplate = {
  label: "Demo shop",
  description: "Minimal placeholder with 6 demo products for forked shops to replace.",
  categories: [
    {
      name: "Products",
      slug: "products",
      description: "The main category. Replace it with your own categories in admin.",
    },
    {
      name: "Accessories",
      slug: "accessories",
      description: "Accessories and add-ons.",
    },
  ],
  pages: [
    {
      slug: "about",
      showInNav: true,
      title: "About",
      body: `## Welcome

This is a demo page. Edit the content in /admin/sider to tell your own story.

## Our values

- Quality materials and thoughtful execution
- Fair pricing for the value delivered
- Helpful customer service

Replace this text with copy that fits your brand.`,
    },
    {
      slug: "contact",
      showInNav: true,
      title: "Contact",
      body: `## Get in touch

Contact us at the email address you have set in brand.config.ts.

## Find us

Add your business address here.

## Opening hours

Add your opening hours here.`,
    },
    {
      slug: "faq",
      showInNav: true,
      title: "FAQ",
      body: `## How long do I have to return an item?

The default return window is 30 days. Adjust it in brand.config.policies.returnDays.

## How much does shipping cost?

Adjust shipping in brand.config.policies.shippingDefaultDkk and shippingFreeThresholdDkk.

## Can you help me choose?

Yes. Contact us or use the AI assistant on the site.`,
    },
    {
      slug: "terms",
      title: "Terms",
      body: `## Company information

TODO: Add your company registration number, address, and contact information.

## Prices and payment

All prices are in DKK including VAT, or adjust this text to your currency.

## Delivery

Standard delivery is 1-3 business days.

## Right of withdrawal

You have the statutory 14-day right of withdrawal.

## Complaints

Products are covered by a 2-year complaints period under applicable law.`,
    },
    {
      slug: "om-os",
      showInNav: true,
      title: "Om Os",
      body: `## About us

Tell your store's story here. Edit this page in /admin/sider.

## What we stand for

- Replace this with your mission and values.`,
    },
    {
      slug: "shipping",
      title: "Fragt & levering",
      body: `## Shipping

Standard delivery is 1-3 business days. Adjust rates in
brand.config.policies (shippingDefaultDkk, shippingFreeThresholdDkk).

## Free shipping

Orders over the free-shipping threshold ship for free.`,
    },
    {
      slug: "returns",
      title: "Retur & bytte",
      body: `## Returns & exchanges

You have a 30-day return window by default — adjust it in
brand.config.policies.returnDays.

## How to return

Contact us and we'll guide you through the process.`,
    },
    {
      slug: "privacy",
      title: "Privatlivspolitik",
      body: `## Privacy policy

TODO: Describe how you collect, use, and protect customer data, in line
with GDPR. Replace this placeholder before going live.`,
    },
  ],
  products: [
    {
      name: "Product Alpha",
      slug: "product-alpha",
      description: "Example product number one. This description is placeholder copy. Replace it with your own content.",
      priceDkk: 29900,
      images: ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800"],
      stock: 10,
      categorySlug: "products",
      featured: true,
    },
    {
      name: "Product Beta",
      slug: "product-beta",
      description: "Example product number two. Adjust the image, price, and description in /admin/produkter.",
      priceDkk: 39900,
      images: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800"],
      stock: 15,
      categorySlug: "products",
      featured: true,
    },
    {
      name: "Product Gamma",
      slug: "product-gamma",
      description: "Third demo product. Featured on the homepage.",
      priceDkk: 49900,
      images: ["https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800"],
      stock: 8,
      categorySlug: "products",
      featured: true,
    },
    {
      name: "Product Delta",
      slug: "product-delta",
      description: "Fourth demo product with a feature-rich product page, variant picker, and AI assistant.",
      priceDkk: 59900,
      images: ["https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800"],
      stock: 12,
      categorySlug: "products",
      featured: true,
    },
    {
      name: "Accessory Lite",
      slug: "accessory-lite",
      description: "Accessory product for demonstrating a multi-category catalog flow.",
      priceDkk: 9900,
      images: ["https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800"],
      stock: 50,
      categorySlug: "accessories",
      featured: false,
    },
    {
      name: "Accessory Pro",
      slug: "accessory-pro",
      description: "A second accessory in the catalog.",
      priceDkk: 14900,
      images: ["https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800"],
      stock: 30,
      categorySlug: "accessories",
      featured: false,
    },
  ],
};
