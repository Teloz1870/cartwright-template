import "server-only";

import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { resolveProductImageUrls } from "@/lib/media/shim";
import { flattenPrimitiveAttributes } from "@/lib/product-attributes";

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
 * Feedets attribut-fladning bor nu i lib/product-attributes.ts, så WebMCP's
 * PDP-deskriptor KAN komme til at bruge præcis samme regel. På denne branch er
 * dette feed stadig den eneste kaldere: deskriptor-halvdelen ligger i
 * PDP-render-sporet. Flytningen er forberedelse, ikke en opnået paritet.
 * Reglen er uændret: kun primitive værdier, nested objekter/arrays springes
 * over (tests/unit/catalog-feed-builder.test.ts holder den).
 */
const flatStringAttrs = flattenPrimitiveAttributes;

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
