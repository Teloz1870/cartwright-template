"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { importProductsFromCsv, type ImportResult } from "@/lib/products-csv";

export async function importProductsAction(csvText: string): Promise<ImportResult> {
  const session = await requireAdmin();
  const result = await importProductsFromCsv(csvText, `user:${session.user.id}`);
  if (result.created || result.updated) {
    revalidatePath("/admin/produkter");
  }
  return result;
}
