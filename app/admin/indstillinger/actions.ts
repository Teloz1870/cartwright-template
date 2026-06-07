"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function updateBrandingSettings(
  storeName: string,
  ecommerceEnabled: boolean,
  websiteHeadline?: string | null,
  heroCta?: string | null,
  defaultLocale?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();

    if (!storeName || storeName.trim().length < 2) {
      return { ok: false, error: "Butikkens navn skal være mindst 2 tegn." };
    }

    await prisma.brandingSettings.update({
      where: { id: 1 },
      data: {
        storeName: storeName.trim(),
        ecommerceEnabled,
        websiteHeadline: websiteHeadline?.trim() || null,
        heroCta: heroCta?.trim() || null,
        defaultLocale: defaultLocale?.trim() || "da",
      },
    });

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        const { Redis } = await import("@upstash/redis");
        const redis = Redis.fromEnv();
        await redis.set("cartwright_default_locale", defaultLocale?.trim() || "da");
      } catch (err) {
        console.error("Failed to sync default locale to Redis:", err);
      }
    }

    const { invalidateBrandCache } = await import("@/lib/brand");
    invalidateBrandCache();
    
    revalidatePath("/", "layout");
    
    return { ok: true };
  } catch (error) {
    console.error("Error updating branding settings:", error);
    return { ok: false, error: "Kunne ikke gemme indstillingerne." };
  }
}

export async function updateLogoSettings(
  markPaths: string[],
  markViewBox: string,
  markStrokeWidth: number,
  logoImageUrl: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();

    await prisma.brandingSettings.update({
      where: { id: 1 },
      data: {
        logoMarkPaths: JSON.stringify(markPaths),
        logoMarkViewBox: markViewBox,
        logoMarkStrokeWidth: markStrokeWidth,
        logoImageUrl,
      },
    });

    const { invalidateBrandCache } = await import("@/lib/brand");
    invalidateBrandCache();
    
    revalidatePath("/", "layout");
    
    return { ok: true };
  } catch (error) {
    console.error("Error updating logo settings:", error);
    return { ok: false, error: "Kunne ikke gemme logoet." };
  }
}

/**
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
      return { ok: false, error: "Logo-generatoren er slået fra (features.logoGenerator)." };
    }

    const { generateLogoImage } = await import("@/lib/ai/logo-gen");
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
      console.error("Logo upload (Blob) fejlede:", uploadError);
      return {
        ok: false,
        error: "Kunne ikke uploade logoet (mangler BLOB_READ_WRITE_TOKEN?).",
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
    return { ok: false, error: "Kunne ikke generere logoet." };
  }
}
