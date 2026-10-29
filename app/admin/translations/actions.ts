"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import {
  getTranslationStatus,
  getEntityForTranslation,
  saveEntityTranslation,
  type EntityType,
} from "@/lib/translations";

export async function getStatus() {
  await requireAdmin();
  return getTranslationStatus();
}

export async function getEntity(type: EntityType, id: string) {
  await requireAdmin();
  return getEntityForTranslation(type, id);
}

export async function saveTranslation(
  type: EntityType,
  id: string,
  en: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin();
  const r = await saveEntityTranslation(type, id, en, `user:${session.user.id}`);
  if (r.ok) {
    revalidatePath("/admin/translations");
    revalidatePath("/", "layout");
  }
  return r;
}
