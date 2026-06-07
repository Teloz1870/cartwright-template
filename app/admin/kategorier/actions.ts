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
 * Returnerer det generated JSON (gemmer IKKE i DB endnu) så admin kan se
 * preview + manuelt redigere før Save. Det er bedre UX end at auto-overskrive.
 *
 * Kræver admin-auth + Anthropic-key.
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
      return { ok: false, error: "Kategorien blev ikke fundet" };
    }

    // Find unique brands i kategorien — bruges som "topBrands" i prompten
    const productsWithBrands = await prisma.product.findMany({
      where: { categoryId: category.id },
      select: { brand: true },
      distinct: ["brand"],
      take: 5,
    });
    // P1.2: brand er nullable; filtrér til string[] for AI-generator
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
        : "Ukendt fejl ved AI-generering. Tjek Anthropic-key er sat i /admin/integrations.";
    return { ok: false, error: message };
  }
}
