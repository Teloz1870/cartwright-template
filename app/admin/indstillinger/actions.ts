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
      return { ok: false, error: "Store name must be at least 2 characters." };
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

// NOTE: generateLogoWithGemini moved to the logo-generator plugin
// (plugins/logo-generator/admin/actions.ts, cartwright-plugin-v1). No
// re-export here: "use server" modules must only export async functions,
// and the only consumer (LogoForm) moved into the plugin with it.
