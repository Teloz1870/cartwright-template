"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

/**
 * Phase 10 Slice 3 — admin /media library server actions.
 *
 * Three operations: update manual fields (override AI), reset to pending
 * (re-run the generator), or hard-delete (only assets with no product attachment).
 */

export type UpdateMediaInput = {
  altDa: string | null;
  altEn: string | null;
  title: string | null;
  caption: string | null;
  geoSnippet: string | null;
  suggestedSlug: string | null;
};

export async function updateMediaAction(
  assetId: string,
  input: UpdateMediaInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  try {
    await prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        altDa: emptyToNull(input.altDa),
        altEn: emptyToNull(input.altEn),
        title: emptyToNull(input.title),
        caption: emptyToNull(input.caption),
        geoSnippet: emptyToNull(input.geoSnippet),
        suggestedSlug: emptyToNull(input.suggestedSlug),
      },
    });
    revalidatePath("/admin/media");
    revalidatePath(`/admin/media/${assetId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Update fejlede" };
  }
}

/**
 * Reset aiStatus so the cron picks the row up again on the next tick. Used when
 * the generator hit a rate limit or a transient error, or when the admin has cleared
 * manually overridden fields and wants fresh AI output.
 */
export async function retryAltAction(
  assetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  try {
    await prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        aiStatus: "pending",
        aiAttempts: 0,
        aiLastError: null,
      },
    });
    revalidatePath("/admin/media");
    revalidatePath(`/admin/media/${assetId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Retry fejlede" };
  }
}

/**
 * Delete a MediaAsset. We forbid deletion if the row is attached to a
 * Product (via ProductMedia) or used as a hero on Category/Page/Service/
 * BrandingSettings. The admin must release the relation first.
 */
export async function deleteMediaAction(
  assetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  try {
    const usage = await prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: {
        _count: {
          select: {
            productMedia: true,
            categoryHero: true,
            categoryVideo: true,
            pageHero: true,
            serviceHero: true,
            brandingHero: true,
          },
        },
      },
    });

    if (!usage) {
      return { ok: false, error: "Asset not found" };
    }

    const totalUsage =
      usage._count.productMedia +
      usage._count.categoryHero +
      usage._count.categoryVideo +
      usage._count.pageHero +
      usage._count.serviceHero +
      usage._count.brandingHero;

    if (totalUsage > 0) {
      return {
        ok: false,
        error: `Asset is used in ${totalUsage} place(s). Release the relation first.`,
      };
    }

    await prisma.mediaAsset.delete({ where: { id: assetId } });
    revalidatePath("/admin/media");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sletning fejlede" };
  }
}

function emptyToNull(s: string | null): string | null {
  if (s == null) return null;
  const trimmed = s.trim();
  return trimmed.length === 0 ? null : trimmed;
}
