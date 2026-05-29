"use server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import {
  generateProductSEO,
  type ProductSeoResult,
} from "@/lib/ai/product-seo-generator";

/**
 * Server-action: generér AI-content for produkt via magic-button.
 *
 * Returnerer genereret JSON (gemmer IKKE i DB endnu) så admin kan se
 * preview + manuelt redigere før Save. Mirror af generateCategorySEOAction.
 *
 * Kræver admin-auth + Anthropic-key (env eller IntegrationSettings).
 */
export async function generateProductSEOAction(
  productId: string,
): Promise<
  | { ok: true; data: ProductSeoResult }
  | { ok: false; error: string }
> {
  await requireAdmin();

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: { select: { name: true } } },
    });
    if (!product) {
      return { ok: false, error: "Produktet blev ikke fundet" };
    }

    const result = await generateProductSEO({
      name: product.name,
      slug: product.slug,
      brandName: product.brand,
      categoryName: product.category?.name ?? null,
      priceDkk: product.priceDkk,
      existingDescription: product.description,
    });

    return { ok: true, data: result };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Ukendt fejl ved AI-generering. Tjek Anthropic-key er sat i /admin/integrations.";
    return { ok: false, error: message };
  }
}
