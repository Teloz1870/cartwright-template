"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { getSeoSettings, applySeoSettings, type SeoSettings } from "@/lib/seo-settings";

export async function getSeoForUi(): Promise<SeoSettings> {
  await requireAdmin();
  return getSeoSettings();
}

export async function setSeo(
  patch: Partial<SeoSettings>,
): Promise<{ ok: true; settings: SeoSettings } | { ok: false; error: string }> {
  const session = await requireAdmin();
  const result = await applySeoSettings(patch, `user:${session.user.id}`);
  if (result.ok) {
    revalidatePath("/admin/seo");
    revalidatePath("/robots.txt");
    revalidatePath("/", "layout");
  }
  return result;
}
