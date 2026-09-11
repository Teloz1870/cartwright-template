import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { invalidateThemeCache } from "@/lib/theme-cache";
import { extractDesignTokens } from "@/lib/design-import/extract";
import { applyDesignPalette } from "@/lib/design-import/apply";
import { scrapeProduct } from "@/lib/scrape/product";
import { brandingCreateDefaults } from "@/lib/branding-defaults";

/**
 * "Hop off Shopify"-migration (HOP1). Hybrid: ALTID anvendes Hoptify-designet
 * (looket). Med FIRECRAWL_API_KEY + URL'er hentes ÆGTE palette (design-import I)
 * + produkter (scraper F); ellers "demo" (design anvendt, ingen import) og
 * klienten viser parodi-teateret. Genbruger de eksisterende libs fra F + I.
 */

export type MigrateInput = { storeUrl: string; productUrls?: string[] };
export type MigrateResult = {
  mode: "real" | "demo";
  paletteApplied: boolean;
  productsImported: number;
  designApplied: boolean;
  notes: string[];
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[æ]/g, "ae")
      .replace(/[ø]/g, "oe")
      .replace(/[å]/g, "aa")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "produkt"
  );
}

async function ensureImportCategory(): Promise<string> {
  const slug = "hoptify-import";
  const existing = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return existing.id;
  const c = await prisma.category.create({ data: { slug, name: "Hoptify import" } });
  return c.id;
}

export async function migrateFromShopify(
  input: MigrateInput,
  actor: AuditActor,
): Promise<MigrateResult> {
  const result: MigrateResult = {
    mode: "demo",
    paletteApplied: false,
    productsImported: 0,
    designApplied: false,
    notes: [],
  };
  const url = input.storeUrl.trim();

  await withAudit(
    { actor, tool: "hoptify.migrate", args: { storeUrl: url, productUrls: input.productUrls?.length ?? 0 } },
    async () => {
      // Ægte palette (design-import) — kun hvis URL + Firecrawl konfigureret.
      if (/^https?:\/\//i.test(url)) {
        const tokens = await extractDesignTokens(url);
        if (tokens.ok) {
          const ap = await applyDesignPalette(tokens.tokens.palette, actor);
          if (ap.ok) {
            result.paletteApplied = true;
            result.mode = "real";
          }
        } else {
          result.notes.push(tokens.error);
        }
      }

      // Ægte produkter (scraper) — kun for angivne produkt-URL'er.
      let categoryId: string | null = null;
      for (const pu of input.productUrls ?? []) {
        if (!/^https?:\/\//i.test(pu.trim())) continue;
        const s = await scrapeProduct(pu.trim());
        if (!s.ok) {
          result.notes.push(s.error);
          continue;
        }
        if (!categoryId) categoryId = await ensureImportCategory();
        const data: Prisma.ProductUncheckedCreateInput = {
          name: s.product.name,
          slug: `${slugify(s.product.name)}-${Date.now().toString(36).slice(-4)}`,
          description: s.product.description,
          priceDkk: s.product.priceKr && s.product.priceKr > 0 ? Math.round(s.product.priceKr * 100) : 0,
          stock: 0,
          categoryId,
          images: JSON.stringify(s.product.imageUrls.slice(0, 8)),
        };
        await prisma.product.create({ data });
        result.productsImported++;
        result.mode = "real";
      }

      // Anvend Hoptify-designet (looket) uanset.
      await prisma.brandingSettings.upsert({
        where: { id: 1 },
        update: { designSlug: "hoptify" },
        create: { ...brandingCreateDefaults(), designSlug: "hoptify" },
      });
      result.designApplied = true;
    },
  );

  invalidateThemeCache();
  if (!result.paletteApplied && result.productsImported === 0) result.mode = "demo";
  return result;
}
