"use server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import {
  generateCategorySEO,
  type CategorySeoResult,
} from "@/lib/ai/category-seo-generator";

/**
 * Server-action: generér SEO-content for en kategori via AI-magic-button.
 *
 * Returns the generated JSON (does NOT save to the DB yet) so the admin can see
 * a preview + edit it manually before Save. Better UX than auto-overwriting.
 *
 * Requires admin auth + an Anthropic key.
 */
export async function generateCategorySEOAction(
  categoryId: string,
): Promise<
  | { ok: true; data: CategorySeoResult }
  | { ok: false; error: string }
> {
  await requireAdmin();

  try {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) {
      return { ok: false, error: "Category not found" };
    }

    // Find unique brands in the category — used as "topBrands" in the prompt
    const productsWithBrands = await prisma.product.findMany({
      where: { categoryId: category.id },
      select: { brand: true },
      distinct: ["brand"],
      take: 5,
    });
    // P1.2: brand is nullable; filter to string[] for the AI generator
    const topBrands = productsWithBrands
      .map((p) => p.brand)
      .filter((v): v is string => Boolean(v));

    const result = await generateCategorySEO({
      name: category.name,
      slug: category.slug,
      shortDescription: category.description,
      productCount: category._count.products,
      topBrands,
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
