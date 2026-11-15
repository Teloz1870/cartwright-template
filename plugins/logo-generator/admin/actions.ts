"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

/**
 * logo-generator plugin (cartwright-plugin-v1) — the flag-gated server action.
 * Moved from app/admin/indstillinger/actions.ts; the non-gated branding/logo
 * persistence actions (updateBrandingSettings, updateLogoSettings) stay core
 * there — logo persistence is core branding, only the generator is the plugin.
 *
 * HOP2 — Generér et logo med Gemini (raster), upload til Vercel Blob, og gem
 * URL'en som brandets logoImageUrl. Flag-gated (features.logoGenerator) +
 * fail-soft når Gemini-key/Blob-token mangler.
 */
export async function generateLogoWithGemini(
  prompt: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await requireAdmin();

    const { brand } = await import("@/brand.config");
    if (!(brand.features as { logoGenerator?: boolean }).logoGenerator) {
      return { ok: false, error: "The logo generator is turned off (features.logoGenerator)." };
    }

    const { generateLogoImage } = await import("@/plugins/logo-generator/lib/logo-gen");
    const gen = await generateLogoImage(prompt);
    if (!gen.ok) return { ok: false, error: gen.error };

    let url: string;
    try {
      const { put } = await import("@vercel/blob");
      const { randomUUID } = await import("node:crypto");
      const blob = await put(`logos/${randomUUID()}.png`, gen.buffer, {
        access: "public",
        contentType: gen.mime,
      });
      url = blob.url;
    } catch (uploadError) {
      console.error("Logo upload (Blob) failed:", uploadError);
      return {
        ok: false,
        error: "Could not upload the logo (is BLOB_READ_WRITE_TOKEN set?).",
      };
    }

    await prisma.brandingSettings.update({
      where: { id: 1 },
      data: { logoImageUrl: url },
    });

    const { invalidateBrandCache } = await import("@/lib/brand");
    invalidateBrandCache();
    revalidatePath("/", "layout");

    return { ok: true, url };
  } catch (error) {
    console.error("Error generating logo with Gemini:", error);
    return { ok: false, error: "Could not generate the logo." };
  }
}
