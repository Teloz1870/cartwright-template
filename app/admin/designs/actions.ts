"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getActiveDesign, invalidateThemeCache } from "@/lib/theme";
import { DESIGN_OPTIONS } from "@/designs/options";
import { getChromeMeta, isChromeSelectable } from "@/lib/builder/chrome-catalog";
import { brandingCreateDefaults } from "@/lib/branding-defaults";

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
      error: `Design "${slug}" was not found in the registry. Import it first via "npx cartwright design import" or drag-and-drop below.`,
    };
  }

  await prisma.brandingSettings.upsert({
    where: { id: 1 },
    update: { designSlug: slug },
    create: {
      ...brandingCreateDefaults(),
      designSlug: slug,
    },
  });

  invalidateThemeCache();
  revalidatePath("/");
  revalidatePath("/admin/designs");

  return { ok: true };
}

/**
 * Mixer 2.0 Phase 1 — select header/footer chrome parts. Writes
 * BrandingSettings.chromeJson with validated chrome-registry keys. Empty
 * string = reset that slot to the active design's default chrome; both empty
 * ⇒ chromeJson = null (byte-identical render path).
 */
export async function setChromeAction(
  headerKey: string,
  footerKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const header = headerKey.trim() || null;
  const footer = footerKey.trim() || null;

  const activeDesign = await getActiveDesign();
  const activeSlug = activeDesign?.slug ?? null;
  for (const [key, kind] of [
    [header, "header"],
    [footer, "footer"],
  ] as const) {
    if (!key) continue;
    const meta = getChromeMeta(key);
    if (!meta || meta.kind !== kind) {
      return { ok: false, error: `"${key}" is not a registered ${kind} chrome.` };
    }
    if (!isChromeSelectable(meta, activeSlug)) {
      return {
        ok: false,
        error: `"${key}" only renders on the "${meta.designSlug}" design (active: ${activeSlug ?? "none"}).`,
      };
    }
  }

  const chromeJson =
    header || footer
      ? JSON.stringify({
          ...(header ? { headerKey: header } : {}),
          ...(footer ? { footerKey: footer } : {}),
        })
      : null;

  await prisma.brandingSettings.upsert({
    where: { id: 1 },
    update: { chromeJson },
    create: {
      ...brandingCreateDefaults(),
      chromeJson,
    },
  });

  invalidateThemeCache();
  revalidatePath("/");
  revalidatePath("/admin/designs");

  return { ok: true };
}
