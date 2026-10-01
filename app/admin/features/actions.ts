"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { applyFeatureOverride } from "@/lib/feature-flags/apply";
import { getFeatureView, type FeatureView } from "@/lib/feature-flags/status";

export async function getFeaturesForUi(): Promise<FeatureView> {
  await requireAdmin();
  return getFeatureView();
}

export type ToggleActionResult =
  | { ok: true; key: string; enabled: boolean; reset: boolean }
  | { ok: false; error: string };

/**
 * Set/reset a feature override from /admin/features. requireAdmin() is the
 * first line — server actions are publicly callable endpoints, so auth +
 * allowlist-validering (i applyFeatureOverride) SKAL ske server-side, uanset
 * hvad client-UI'et tilbyder.
 */
export async function setFeatureOverrideAction(
  key: string,
  enabled: boolean,
): Promise<ToggleActionResult> {
  const session = await requireAdmin();
  const result = await applyFeatureOverride(
    key,
    enabled,
    `user:${session.user.id}`,
  );
  if (!result.ok) return result;

  // The storefront layout re-resolves getBrand on the next render; the admin page
  // re-fetches immediately.
  revalidatePath("/admin/features");
  revalidatePath("/", "layout");
  return { ok: true, key: result.key, enabled: result.enabled, reset: result.reset };
}
