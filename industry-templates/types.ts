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
  categorySlug: string; // matcher en categories[].slug
  featured?: boolean;
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
