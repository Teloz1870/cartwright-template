/**
 * ULTRAPLAN-lite UL4: type-definitioner for industry-templates.
 *
 * En industry-template indeholder seed-data der er domain-specifik
 * (solbriller, hegn, keramik, etc.). prisma/seed.ts vælger template
 * baseret på brand.industryTemplate og kører den ved `npm run seed`.
 *
 * Hver template eksporterer en `IndustryTemplate`-shaped default-export
 * eller named exports der matcher denne interface.
 */

export type SeedCategory = {
  name: string;
  slug: string;
  description: string;
};

export type SeedPage = {
  slug: string;
  title: string;
  body: string;
  /**
   * Show the page in the storefront nav out of the box. Human pages
   * (about/services/contact/faq) set true; legal pages (terms/returns/
   * privacy/shipping) stay hidden. Omitted ⇒ Prisma default (false).
   */
  showInNav?: boolean;
  /**
   * Secondary-locale copy for this page, shaped exactly like `Page.translations`
   * in the schema: `{ [locale]: { title?, body? } }`. `getDynamicTranslation`
   * returns the BASE field whenever the request locale is `brand.defaultLocale`
   * and only reaches in here for other locales — so the base `title`/`body`
   * must be the English source text, with e.g. Danish living under `da`.
   * Omitted ⇒ column stays NULL, exactly as before.
   */
  translations?: Record<string, Record<string, string>>;
};

export type SeedVariant = {
  /** Unique per product (schema: @@unique([productId, sku])). */
  sku: string;
  priceDkk: number;
  stock: number;
  /**
   * Attribute pairs that define the variant. The PDP renders one dropdown per
   * key, and every agent-facing surface derives the variant's natural-language
   * label by joining the VALUES ("Whole beans, 250 g") — so author values a
   * shopper would say out loud, never SKU plumbing.
   */
  attributes: Record<string, string>;
};

export type SeedProduct = {
  name: string;
  slug: string;
  description: string;
  priceDkk: number;
  images: string[]; // URLs
  stock: number;
  // P1.1: frameColor/lensColor/brand er eyewear-specifikke felter. Andre
  // industries (hegn, keramik, etc.) lader dem være undefined og bruger
  // i stedet `attributes`-felt på Product til structured-content.
  frameColor?: string;
  lensColor?: string;
  brand?: string;
  /**
   * Generic merchandising attributes → Product.attributes (Json). The modern
   * path for every non-eyewear vertical (coffee: origin/process/roast/notes/
   * weightG; fencing: dimensions/material; …). Design packs narrow this with
   * their own parser under the never-guess rule — a template whose products
   * carry attributes lights up the pack's data-driven badges from first seed.
   */
  attributes?: Record<string, unknown>;
  categorySlug: string; // matcher en categories[].slug
  featured?: boolean;
  /**
   * Purchasable variants (grind, size, …). Most products need none — the
   * cart falls back to the product itself. Seeding at least one variant-ful
   * product per template keeps the variant-aware surfaces (PDP picker,
   * `add_current_product_to_cart`'s `variant` enum) exercised from first seed.
   */
  variants?: SeedVariant[];
};

export type SeedCategorySeo = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  descriptionLong: string;
  faq: string; // JSON-string af {q,a}-array
};

export type IndustryTemplate = {
  /** Navn til logging + admin-UI ("Eyewear shop", "Demo shop") */
  label: string;
  /**
   * The language the base `title`/`body` of this template's copy is WRITTEN in.
   * Declaring it lets the seeder rotate a page into the shop's own base locale
   * (`orientSeedPages` in ./seed-locale.ts) when the two differ — without it,
   * `getDynamicTranslation` would serve the source language on the shop's
   * primary route and never reach the copy shipped for that locale.
   * Omitted ⇒ pages are seeded exactly as authored, no rotation.
   */
  sourceLocale?: string;
  /** Beskrivelse hvad denne template indeholder */
  description: string;
  /** Categories der oprettes ved seed */
  categories: SeedCategory[];
  /** Static-content pages (om-os, faq, etc.) */
  pages: SeedPage[];
  /** Sample-produkter — 6+ anbefalet for at fylde forsiden */
  products: SeedProduct[];
  /**
   * UL8.3: SEO-content pr kategori — merges i seed ved slug-match.
   * Optional: generic-template har 0 (admin tilføjer via /admin/kategorier
   * + AI-magic-knap). Eyewear-template har rich SEO for alle 5 kategorier.
   */
  categorySeo?: SeedCategorySeo[];
};
