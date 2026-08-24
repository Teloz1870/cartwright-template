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
  /**
   * Flade produkt-specifikationer (attribut-navn → værdi) fra Product.attributes
   * (+ variant-attributes for variant-items). Serialiseres som Google
   * `g:product_detail` (conversational attributes til AI Mode / Gemini shopping).
   * Undefined når produktet ingen primitive attributter har.
   */
  attributes?: Record<string, string>;
};

/**
 * Coerce en (arbitrær) produkt/variant `attributes`-JSON til et fladt
 * string→string-map. Kun primitive værdier medtages — nested objekter/arrays
 * springes over, så feedet aldrig emitterer skrald. Tom → undefined så
 * serializeren kan udelade blokken.
 */
function flatStringAttrs(json: unknown): Record<string, string> | undefined {
  if (!json || typeof json !== "object" || Array.isArray(json)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

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
    const productAttrs = flatStringAttrs(p.attributes);
    if (p.variants.length > 0) {
      for (const v of p.variants) {
        // Variant-item: produkt-specs + variantens egne akser (variant vinder).
        const combined = { ...(productAttrs ?? {}), ...(flatStringAttrs(v.attributes) ?? {}) };
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
          attributes: Object.keys(combined).length ? combined : undefined,
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
        attributes: productAttrs,
      });
    }
  }
  return items;
}
