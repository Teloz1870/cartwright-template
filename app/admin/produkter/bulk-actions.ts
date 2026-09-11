"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";

export type BulkUpdate = {
  priceKr?: number;
  stock?: number;
  categoryId?: string;
  featured?: boolean;
};

export async function bulkUpdateProducts(
  productIds: string[],
  updates: BulkUpdate,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const session = await requireAdmin();
  if (productIds.length === 0) return { ok: false, count: 0, error: "No products selected." };

  const data: Record<string, unknown> = {};
  if (updates.priceKr !== undefined && Number.isFinite(updates.priceKr) && updates.priceKr > 0) {
    data.priceDkk = Math.round(updates.priceKr * 100);
  }
  if (updates.stock !== undefined && Number.isFinite(updates.stock) && updates.stock >= 0) {
    data.stock = Math.round(updates.stock);
  }
  if (updates.categoryId) data.categoryId = updates.categoryId;
  if (updates.featured !== undefined) data.featured = updates.featured;

  if (Object.keys(data).length === 0) {
    return { ok: false, count: 0, error: "Intet at opdatere." };
  }

  let count = 0;
  try {
    await withAudit(
      { actor: `user:${session.user.id}`, tool: "products.bulk_update", args: { productIds, data } },
      async () => {
        const r = await prisma.product.updateMany({ where: { id: { in: productIds } }, data });
        count = r.count;
      },
    );
  } catch (err) {
    return { ok: false, count: 0, error: err instanceof Error ? err.message : "Could not update." };
  }

  revalidatePath("/admin/produkter");
  return { ok: true, count };
}
