import "server-only";

import { prisma } from "@/lib/db";
import type { CategoryLink, LinkedCategoryIds } from "@/lib/category-tree";
import type { Prisma } from "@/app/generated/prisma/client";

/**
 * WP2-r2′ — the two `ProductCategory` reads the storefront and catalogue share.
 * `Product.categoryId` stays the PRIMARY category (its URL, breadcrumb and
 * canonical); a row here files the product under one more, and every list of
 * a category's products — its page, `/produkter?kategori=`, `products.search`,
 * the counts — takes it like a primary member.
 *
 * Both fail soft to "no links": the primary-only answer every reader gave
 * before, and the byte-identical query of a shop that has no rows.
 */

/** The categories holding at least one extra product: one indexed GROUP BY. */
export async function findLinkedCategoryIds(scope: string): Promise<LinkedCategoryIds> {
  try {
    const rows = await prisma.productCategory.groupBy({ by: ["categoryId"] });
    return new Set(rows.map((row) => row.categoryId));
  } catch (err) {
    console.error(`[${scope}] extra categories failed, falling back to none:`, err);
    return new Set();
  }
}

/**
 * Every link with its product's primary category, for the counts. `product`
 * is the filter the linked product must pass — the reader's own product
 * filter (`LIVE_PRODUCT_WHERE` / `productWhereFor` in lib/product-visibility,
 * so a public count leaves soft-deleted and draft products out, as the
 * storefront counts do); `null` reads every row, as the admin table has
 * always counted.
 */
export async function findCategoryLinks(
  scope: string,
  product: Prisma.ProductWhereInput | null,
): Promise<CategoryLink[]> {
  try {
    const rows = await prisma.productCategory.findMany({
      ...(product ? { where: { product } } : {}),
      select: { productId: true, categoryId: true, product: { select: { categoryId: true } } },
    });
    return rows.map((row) => ({
      productId: row.productId,
      categoryId: row.categoryId,
      primaryCategoryId: row.product.categoryId,
    }));
  } catch (err) {
    console.error(`[${scope}] extra categories failed, falling back to none:`, err);
    return [];
  }
}
