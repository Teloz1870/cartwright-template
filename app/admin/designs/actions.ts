"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { invalidateThemeCache } from "@/lib/theme";
import { DESIGN_OPTIONS } from "@/designs/options";

/**
 * Server actions for /admin/designs page.
 *
 * setActiveDesignAction:
 *   Skriver designSlug til BrandingSettings (id=1, singleton).
 *   Invaliderer theme-cache så design-pakkens nye tokens kommer i play
 *   ved næste request.
 *
 * Import-flowet (uploadDesignAction → /api/admin/designs/import) er
 * implementeret som en separat API-route fordi filer skal håndteres
 * via FormData multipart der ikke maps cleanly til server-actions.
 */

export async function setActiveDesignAction(
  designSlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  // Tomstreng = "Auto" (= behold null så inferensen kører i runtime).
  const slug = designSlug.trim() || null;

  // Hvis slug er sat, validér det findes i registry — så vi ikke saver
  // en design der ikke kan render.
  if (slug && !DESIGN_OPTIONS.some((d) => d.slug === slug)) {
    return {
      ok: false,
      error: `Design "${slug}" findes ikke i registry. Importer den først via "npx cartwright design import" eller drag-drop nedenfor.`,
    };
  }

  await prisma.brandingSettings.upsert({
    where: { id: 1 },
    update: { designSlug: slug },
    create: {
      id: 1,
      storeName: "Cartwright",
      heroImage: "",
      announcement: "",
      designSlug: slug,
    },
  });

  invalidateThemeCache();
  revalidatePath("/");
  revalidatePath("/admin/designs");

  return { ok: true };
}
