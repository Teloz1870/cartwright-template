"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getActiveDesign, invalidateThemeCache } from "@/lib/theme";
import { DESIGN_OPTIONS } from "@/designs/options";
import { getChromeMeta, explainChromeRejection } from "@/lib/builder/chrome-catalog";
import { brandingCreateDefaults } from "@/lib/branding-defaults";

/**
 * Server actions for /admin/designs page.
 *
 * setActiveDesignAction:
 *   Writes designSlug to BrandingSettings (id=1, singleton).
 *   Invalidates the theme cache so the design pack's new tokens come into play
 *   on the next request.
 *
 * Import-flowet (uploadDesignAction → /api/admin/designs/import) er
 * implemented as a separate API route because files must be handled
 * via FormData multipart, which does not map cleanly to server actions.
 */

export async function setActiveDesignAction(
  designSlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  // Empty string = "Auto" (= keep null so inference runs at runtime).
  const slug = designSlug.trim() || null;

  // If a slug is set, validate that it exists in the registry — so we do not save
  // a design that cannot render.
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
    const rejection = explainChromeRejection(meta, activeSlug, {
      targetMixable: activeDesign?.mixable,
    });
    if (rejection) return { ok: false, error: rejection.message };
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
