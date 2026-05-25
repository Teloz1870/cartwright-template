import type { IndustryTemplate } from "../types";

/**
 * Phase 4 close-out: sunglasses retail template (legacy).
 *
 * Reference fork for the original eyewear-shop archetype that Cartwright
 * grew out of (solbrillen.dk). Uses the legacy Product.frameColor /
 * lensColor / brand fields — the ONE place these are still preferred over
 * Product.attributes (JSON), because the storefront has hardcoded
 * frame/lens filter facets that read these specific columns.
 *
 * New retail forks (panel-hegn, pottery, coffee, etc.) MUST NOT use these
 * fields — they should use Product.attributes JSON instead. See
 * cartwright-private/CLAUDE.md "Hard rules" for the rationale.
 *
 * 3 stub products. Replace via /admin/produkter or extend the seed-data.
 */
export const sunglassesTemplate: IndustryTemplate = {
  label: "Sunglasses Shop (Legacy Eyewear)",
  description:
    "Eyewear retail using legacy frameColor/lensColor/brand fields. Reference fork for solbrillen.dk and existing eyewear customers. New non-eyewear forks should use Product.attributes JSON instead.",
  categories: [
    {
      name: "Men's",
      slug: "men",
      description: "Sunglasses for men — classic and contemporary frames.",
    },
    {
      name: "Women's",
      slug: "women",
      description: "Sunglasses for women — from oversized to minimalist.",
    },
  ],
  pages: [
    {
      slug: "about",
      title: "About",
      body: `## About the shop

Add your eyewear store's story here — heritage, founder, philosophy.

## Quality

Mention frame materials, lens technology, UV protection certifications.`,
    },
    {
      slug: "contact",
      title: "Contact",
      body: `## Visit us

Add your store address and opening hours.

## Customer service

Email or phone for orders, returns, or fitting advice.`,
    },
    {
      slug: "faq",
      title: "FAQ",
      body: `## Do you offer prescription lenses?

Yes — contact us with your prescription details for a quote.

## What's your return policy?

30 days unworn with original packaging. See /admin → brand.config.policies.returnDays.

## Are these polarized?

Check the individual product description. Most premium frames are; budget frames may not be.`,
    },
  ],
  products: [
    {
      name: "Aviator Classic",
      slug: "aviator-classic",
      description:
        "Timeless aviator with gold metal frame and gradient lenses. UV400 protection.",
      priceDkk: 89900,
      images: [
        "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800",
      ],
      stock: 12,
      frameColor: "Gold",
      lensColor: "Brown gradient",
      brand: "Cartwright Classics",
      categorySlug: "men",
      featured: true,
    },
    {
      name: "Wayfarer Black",
      slug: "wayfarer-black",
      description:
        "Iconic wayfarer silhouette in matte black acetate. Polarized grey lenses.",
      priceDkk: 79900,
      images: [
        "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800",
      ],
      stock: 18,
      frameColor: "Matte black",
      lensColor: "Polarized grey",
      brand: "Cartwright Classics",
      categorySlug: "men",
      featured: true,
    },
    {
      name: "Oversized Tortoise",
      slug: "oversized-tortoise",
      description:
        "Oversized round frame in tortoise acetate. Honey-tinted lenses, UV400.",
      priceDkk: 99900,
      images: [
        "https://images.unsplash.com/photo-1556015048-4d3aa10df74c?w=800",
      ],
      stock: 9,
      frameColor: "Tortoise",
      lensColor: "Honey",
      brand: "Cartwright Premium",
      categorySlug: "women",
      featured: true,
    },
  ],
};
