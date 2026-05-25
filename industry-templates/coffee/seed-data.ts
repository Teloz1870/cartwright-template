import type { IndustryTemplate } from "../types";

/**
 * Phase 4 close-out: coffee shop template.
 *
 * Modern ecommerce reference fork — clean Product.attributes JSON for origin,
 * roast level, and tasting notes (the right way to model variant data per
 * the hard rule on legacy eyewear fields). Northbound demo on
 * teloz-showcase.vercel.app/da/produkter follows this template.
 *
 * 3 stub products. Add more via /admin/produkter or replace this seed-data
 * in a fork to fill out a real catalogue.
 */
export const coffeeTemplate: IndustryTemplate = {
  label: "Coffee Shop",
  description:
    "Single-origin coffee retail with realistic attributes (origin, roast level, tasting notes). Reference for modern Product.attributes usage.",
  categories: [
    {
      name: "Beans",
      slug: "beans",
      description: "Whole bean and ground coffee, sourced from single origins.",
    },
    {
      name: "Espresso",
      slug: "espresso",
      description: "Espresso blends optimised for milk-based drinks.",
    },
  ],
  pages: [
    {
      slug: "about",
      title: "About",
      body: `## Our story

Replace this with your roastery's story. Mention your sourcing philosophy, your roastmaster, and what makes your coffee different.

## Sourcing

Describe your direct-trade relationships, certifications, and how you choose origins.`,
    },
    {
      slug: "contact",
      title: "Contact",
      body: `## Visit the roastery

Add your address, opening hours, and a map link.

## Wholesale enquiries

Email or call for wholesale pricing.`,
    },
    {
      slug: "faq",
      title: "FAQ",
      body: `## How fresh is the coffee?

We roast to order. Shipping happens within 48 hours of roast.

## How should I store it?

Airtight container, room temperature, away from sunlight. Best within 4 weeks of roast.

## Do you offer subscriptions?

Yes — contact us to set one up.`,
    },
  ],
  products: [
    {
      name: "Ethiopia Yirgacheffe",
      slug: "ethiopia-yirgacheffe",
      description:
        "Bright, floral single-origin from the Yirgacheffe region. Notes of bergamot, jasmine, and lemon. Best brewed as pour-over or AeroPress.",
      priceDkk: 14900,
      images: [
        "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800",
      ],
      stock: 25,
      categorySlug: "beans",
      featured: true,
    },
    {
      name: "Colombia Supremo",
      slug: "colombia-supremo",
      description:
        "Balanced washed Colombian with caramel sweetness and chocolate finish. Works equally well as filter or espresso.",
      priceDkk: 12900,
      images: [
        "https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=800",
      ],
      stock: 30,
      categorySlug: "beans",
      featured: true,
    },
    {
      name: "Northbound Espresso Blend",
      slug: "northbound-espresso-blend",
      description:
        "Our house blend, dialled for milk drinks. Chocolatey body with a stone-fruit lift. Roasted weekly.",
      priceDkk: 11900,
      images: [
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800",
      ],
      stock: 40,
      categorySlug: "espresso",
      featured: true,
    },
  ],
};
