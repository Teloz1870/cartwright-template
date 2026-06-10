"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { applyVertical, type ApplyVerticalResult } from "@/lib/verticals/apply";

/**
 * Admin server action for /admin/verticals. Applies a Vertical / Voice preset
 * (identity + genome copy, optionally the suggested Skin) and revalidates the
 * storefront so the re-toned copy shows on next render.
 */
export async function applyVerticalAction(
  slug: string,
  applySkin: boolean,
): Promise<ApplyVerticalResult> {
  const session = await requireAdmin();
  const result = await applyVertical(slug, { applySkin }, `user:${session.user.id}`);
  if (result.ok) {
    revalidatePath("/admin/verticals");
    revalidatePath("/", "layout");
  }
  return result;
}
