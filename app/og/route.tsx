import { brand } from "@/brand.config";
import { renderBrandOgCard } from "@/lib/og-card";

export const runtime = "nodejs";

/**
 * Per-page Open Graph card: /og?title=…&description=…
 *
 * Renders the brand-themed card (lib/og-card.tsx) with the page's own title +
 * description, so every page can ship a distinct share-preview instead of the
 * site-wide fallback (app/opengraph-image.tsx). Wired via lib/og.ts:pageOg.
 */
export function GET(req: Request): Response {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") || brand.storeName).slice(0, 100);
  const subtitle = (searchParams.get("description") || "").slice(0, 200);
  return renderBrandOgCard({ title, subtitle });
}
