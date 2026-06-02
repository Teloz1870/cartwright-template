"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

/**
 * Phase 10 Slice 3 — admin /media library server actions.
 *
 * Tre operationer: opdater manuelle felter (override AI), reset til pending
 * (re-kør generator), eller hard-delete (kun assets uden produkt-tilknytning).
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
 * Nulstil aiStatus så cron'en plukker rækken op igen næste tick. Bruges når
 * generator ramte rate-limit eller transient fejl, eller når admin har slettet
 * manuelt-overskrevne felter og vil have ny AI-output.
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
 * Slet en MediaAsset. Vi forbyder sletning hvis rækken er attached til et
 * Product (via ProductMedia) eller bruges som hero på Category/Page/Service/
 * BrandingSettings. Admin må først frigøre relationen.
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
      return { ok: false, error: "Asset blev ikke fundet" };
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
        error: `Asset er brugt ${totalUsage} steder. Frigør relationen først.`,
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
