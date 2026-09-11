"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import {
  ensureLegalPages,
  legalPageStatus,
  type EnsureLegalResult,
} from "@/lib/gdpr/legal-pages";

export async function getLegalStatus() {
  await requireAdmin();
  return legalPageStatus();
}

export async function createMissingLegalPages(): Promise<EnsureLegalResult> {
  await requireAdmin();
  const result = await ensureLegalPages();
  revalidatePath("/admin/processors");
  revalidatePath("/", "layout");
  return result;
}
