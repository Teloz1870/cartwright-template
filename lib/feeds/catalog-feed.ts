import "server-only";

import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { resolveProductImageUrls } from "@/lib/media/shim";

/**
 * Neutralt produkt-feed-item — én record pr. købbar enhed (produkt, eller
 * variant hvis produktet har varianter). Serializers bygger oven på dette:
 * ACP-feedet (JSONL) i dag — et Google Merchant-feed (XML) kan genbruge det.
 */
export type CatalogFeedItem = {
  /** Stabil id — produkt-slug, eller variant-sku hvis produktet har varianter. */
  id: string;
  title: string;
  description: string;
  /** Pris i mindste valuta-enhed (øre/cents). */
  priceMinor: number;
  /** ISO-4217 currency code. */
  currency: string;
  availability: "in_stock" | "out_of_stock";
  /** Absolut produkt-URL. */
  url: string;
  /** Absolut billed-URL, eller null hvis produktet ingen billeder har. */
  imageUrl: string | null;
  brand: string | null;
  category: string;
};

/**
 * Henter hele det offentlige katalog som et neutralt feed. Soft-deletede
 * produkter (`deletedAt`) udelades. Domæne + valuta kommer fra getBrand(),
 * så feedet følger operatørens runtime-domæne. Bruges af /api/acp/feed.
 */
export async function getCatalogFeed(): Promise<CatalogFeedItem[]> {
  const [merged, products] = await Promise.all([
    getBrand(),
    prisma.product.findMany({
      where: { deletedAt: null },
      include: { category: true, variants: { orderBy: { sku: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const base = merged.url.replace(/\/+$/, "");
  const currency = merged.policies.currency;
  const absolute = (img: string | undefined): string | null => {
    if (!img) return null;
    if (img.startsWith("http://") || img.startsWith("https://")) return img;
    return `${base}${img.startsWith("/") ? "" : "/"}${img}`;
  };

  const items: CatalogFeedItem[] = [];
  for (const p of products) {
    const imageUrl = absolute(resolveProductImageUrls(p)[0]);
    const url = `${base}/product/${p.slug}`;
    if (p.variants.length > 0) {
      for (const v of p.variants) {
        items.push({
          id: v.sku,
          title: p.name,
          description: p.description,
          priceMinor: v.priceDkk,
          currency,
          availability: v.stock > 0 ? "in_stock" : "out_of_stock",
          url,
          imageUrl,
          brand: p.brand,
          category: p.category.name,
        });
      }
    } else {
      items.push({
        id: p.slug,
        title: p.name,
        description: p.description,
        priceMinor: p.priceDkk,
        currency,
        availability: p.stock > 0 ? "in_stock" : "out_of_stock",
        url,
        imageUrl,
        brand: p.brand,
        category: p.category.name,
      });
    }
  }
  return items;
}
