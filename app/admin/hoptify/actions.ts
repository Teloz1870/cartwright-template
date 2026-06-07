"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { migrateFromShopify, type MigrateInput, type MigrateResult } from "@/lib/hoptify/migrate";

export async function migrateAction(input: MigrateInput): Promise<MigrateResult> {
  const session = await requireAdmin();
  const result = await migrateFromShopify(input, `user:${session.user.id}`);
  revalidatePath("/", "layout");
  revalidatePath("/admin/indstillinger");
  revalidatePath("/admin/produkter");
  return result;
}
