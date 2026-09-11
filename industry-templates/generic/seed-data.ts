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
      body: `## Our company

We are an independent business focused on useful products, clear information and dependable service. This starter copy is intentionally substantial enough to explain what visitors can expect, but the site owner should replace it with the company's real history, people and credentials before launch.

## How we work

We describe products plainly, publish the policies that shape each purchase and make it easy to reach a person when an answer needs context. Public information is available to both people and read-only AI agents; customer data and operational changes remain protected.

## What matters to us

- Product information that can be checked before purchase
- Fair pricing and transparent terms
- Helpful support before and after an order
- Responsible handling of personal information

For questions about the business, ownership or this website, use the contact details on our Contact page.`,
    },
    {
      slug: "contact",
      showInNav: true,
      title: "Contact",
      body: `## Get in touch

Use the email address and telephone number published in the site footer and on the dedicated contact route. We use those details for product questions, order support, accessibility feedback, privacy requests and business enquiries.

## What to include

Please include the subject of your enquiry and any order reference that is safe to share. Never send card details, passwords or API keys. We will only ask for the minimum information needed to resolve the request.

## Response and escalation

The configured opening hours show when the team normally responds. Privacy and data-rights requests are routed to the company responsible for this site. Urgent payment matters should also be raised with the payment provider shown during checkout.`,
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
      body: `## Who is responsible

The legal entity and privacy contact configured for this site are responsible for the personal information described here. Contact details are published on the Contact page.

## Information we process

We process information supplied through enquiries, accounts and orders, plus limited technical data needed to operate and secure the service. Payment details are handled by the configured payment provider and are not stored as raw card data by this site.

## Purposes and legal bases

Information is used to fulfil agreements, provide support, prevent abuse, meet accounting duties and—with consent where required—measure or improve the service. We do not sell personal information.

## Retention, processors and rights

Data is retained only as long as the purpose or applicable law requires. Necessary hosting, database, email and payment processors act under contractual safeguards. Depending on local law, individuals may request access, correction, deletion, restriction, objection or portability and may withdraw consent or complain to their data-protection authority.

This starter policy must be reviewed against the company's actual vendors, retention periods and jurisdictions before launch.`,
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
