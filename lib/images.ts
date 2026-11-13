/**
 * Decorative banner/lifestyle images — thin re-export af brand.config.images.
 *
 * Historisk var disse hardcoded i denne fil. Shop-Starter-refactor flyttede
 * dem til brand.config.ts så fork-shops kan override pr brand. Eksisterende
 * imports (`import { HERO_IMAGE } from "@/lib/images"`) virker stadig pga.
 * disse re-exports.
 *
 * Per-kategori DB-override (Category.heroImage) trumfer altid fallback-mapping
 * — se app/page.tsx kategori-grid (3-niveau fallback: DB → brand → LIFESTYLE).
 *
 * Product images live in the DB (Product.images JSON array).
 */
import { brand } from "@/brand.config";

export const HERO_IMAGE = brand.images.hero;
export const LIFESTYLE_IMAGE = brand.images.lifestyle;
export const SCENIC_IMAGE = brand.images.scenic;

/** Category-tile background images, keyed by category slug. */
export const CATEGORY_IMAGES: Record<string, string> =
  brand.images.categoryFallbacks;
