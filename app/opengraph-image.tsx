import { brand } from "@/brand.config";
import { renderBrandOgCard } from "@/lib/og-card";

/**
 * Site-wide Open Graph / social-share image (1200×630).
 *
 * Next.js auto-applies this file as `og:image` (+ `twitter:image`) for every
 * route that doesn't set its own — so home, PLP, cart, account pages get a
 * branded card instead of no preview. Pages that DO set `openGraph.images`
 * (PDP/category/blog, and the generic pages via `lib/og.ts:pageOg`) override it.
 *
 * Rendering lives in `lib/og-card.tsx:renderBrandOgCard` (shared with the
 * per-page `/og` route). Branded purely from brand.config.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = brand.storeName;

export default function OpengraphImage() {
  return renderBrandOgCard({
    title: brand.storeName,
    subtitle: brand.metadata.description,
  });
}
