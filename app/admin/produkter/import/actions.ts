"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { importProductsFromCsv, type ImportResult } from "@/lib/products-csv";
import { csvImportBodyBytes, csvImportSizeError } from "@/lib/products-csv-limit";

export async function importProductsAction(
  csvText: string,
): Promise<ImportResult | { error: string }> {
  const session = await requireAdmin();
  // Next's own limit refuses a larger body before this runs; this keeps the import's
  // bound — and a clear answer — for any caller that gets past it (lib/products-csv-limit.ts).
  const tooLarge = csvImportSizeError(csvImportBodyBytes(csvText));
  if (tooLarge) return { error: tooLarge };
  const result = await importProductsFromCsv(csvText, `user:${session.user.id}`);
  if (result.created || result.updated) {
    revalidatePath("/admin/produkter");
  }
  return result;
}
