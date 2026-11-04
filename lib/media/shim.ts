import { brand } from "@/brand.config";
import { parseProductImages } from "@/lib/products";

/**
 * Phase 10 Slice 1 — single read-path for media.
 *
 * Når brand.features.mediaLibrary er on, læses fra MediaAsset / ProductMedia
 * (med alt-tekst + dimensioner). Når off (current default), falder vi tilbage
 * til de legacy string-URL-felter så solbrillen-kanariet rendere uændret.
 *
 * Slice 4 swapper alle parseProductImages-call-sites over til resolve* her,
 * så cutover bliver en enkelt PR uden at røre denne fil.
 */

export type ResolvedMedia = {
  url: string;
  altDa: string | null;
  altEn: string | null;
};

type ProductWithMedia = {
  images: string;
  productMedia?: Array<{
    position: number;
    asset: { url: string; altDa: string | null; altEn: string | null };
  }>;
};

export function resolveProductImages(product: ProductWithMedia): ResolvedMedia[] {
  if (
    brand.features.mediaLibrary &&
    product.productMedia &&
    product.productMedia.length > 0
  ) {
    return [...product.productMedia]
      .sort((a, b) => a.position - b.position)
      .map((pm) => ({
        url: pm.asset.url,
        altDa: pm.asset.altDa,
        altEn: pm.asset.altEn,
      }));
  }
  return parseProductImages(product.images).map((url) => ({
    url,
    altDa: null,
    altEn: null,
  }));
}

/** Convenience: kun URLs, til steder der ikke har brug for alt-tekst endnu. */
export function resolveProductImageUrls(product: ProductWithMedia): string[] {
  return resolveProductImages(product).map((m) => m.url);
}

type HeroImageEntity = {
  heroImage?: string | null;
  heroImageAsset?: {
    url: string;
    altDa: string | null;
    altEn: string | null;
  } | null;
};

// Navn-kollision: nogle sider har deres egen lokale resolveHeroImage(slug, url)
// med fallback til CATEGORY_IMAGES. Brug resolveHeroMedia når MediaAsset-FK
// skal foretrækkes — den lokale string-baserede fallback kan stables ovenpå.
export function resolveHeroMedia(entity: HeroImageEntity): ResolvedMedia | null {
  if (brand.features.mediaLibrary && entity.heroImageAsset) {
    return {
      url: entity.heroImageAsset.url,
      altDa: entity.heroImageAsset.altDa,
      altEn: entity.heroImageAsset.altEn,
    };
  }
  if (entity.heroImage) {
    return { url: entity.heroImage, altDa: null, altEn: null };
  }
  return null;
}

type CategoryVideoEntity = {
  heroVideo?: string | null;
  heroVideoAsset?: { url: string } | null;
};

export function resolveCategoryVideo(entity: CategoryVideoEntity): string | null {
  if (brand.features.mediaLibrary && entity.heroVideoAsset) {
    return entity.heroVideoAsset.url;
  }
  return entity.heroVideo ?? null;
}
