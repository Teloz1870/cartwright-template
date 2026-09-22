"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { applyFeatureOverride } from "@/lib/feature-flags/apply";
import { getPlusStatus } from "@/lib/cartwright-plus";

export type ActivateResult = { ok: true } | { ok: false; error: string };

/**
 * Flip the `cartwrightPlus` runtime feature flag ON after a verified
 * activation. Server-side re-verification is mandatory — server actions are
 * publicly callable endpoints, so we never trust that the client only shows
 * the button when the key is valid.
 *
 * Reuses the exact same override write path as /admin/features
 * (applyFeatureOverride → BrandingSettings.featureOverridesJson, allowlist-
 * validated + audited via withAudit). v1 never auto-disables: there is no
 * deactivation action here — turning the flag off stays a manual choice in
 * /admin/features.
 */
export async function activatePlusAction(): Promise<ActivateResult> {
  const session = await requireAdmin();

  const { status } = await getPlusStatus();
  // 'grace' is eligible too (codex fold-in): the page promises Plus stays
  // available while a payment retries — activation must honor that.
  if (status !== "active" && status !== "grace") {
    return {
      ok: false,
      error: `Plus key is not verified as active or in grace (status: ${status}).`,
    };
  }

  const result = await applyFeatureOverride(
    "cartwrightPlus",
    true,
    `user:${session.user.id}`,
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/plus");
  revalidatePath("/admin/features");
  revalidatePath("/", "layout");
  return { ok: true };
}
