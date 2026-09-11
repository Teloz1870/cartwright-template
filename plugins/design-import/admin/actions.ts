"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { extractDesignTokens, type ExtractResult } from "@/plugins/design-import/lib/extract";
import { applyDesignPalette } from "@/plugins/design-import/lib/apply";
import type { ThemePalette } from "@/lib/theme";

export async function extractAction(url: string): Promise<ExtractResult> {
  await requireAdmin();
  return extractDesignTokens(url);
}

export async function applyAction(
  palette: ThemePalette,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin();
  const r = await applyDesignPalette(palette, `user:${session.user.id}`);
  if (r.ok) {
    revalidatePath("/admin/design-import");
    revalidatePath("/", "layout");
  }
  return r;
}
