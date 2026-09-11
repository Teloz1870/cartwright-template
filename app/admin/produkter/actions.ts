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
 * Returns the generated JSON (does NOT save to the DB yet) so the admin can see
 * a preview + edit it manually before Save. Mirrors generateCategorySEOAction.
 *
 * Requires admin auth + an Anthropic key (env or IntegrationSettings).
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
      return { ok: false, error: "Product not found" };
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
        : "Unknown error during AI generation. Check that the Anthropic key is set in /admin/integrations.";
    return { ok: false, error: message };
  }
}
