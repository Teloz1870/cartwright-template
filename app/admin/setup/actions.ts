"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { markSetupComplete } from "@/lib/setup-wizard";
import { INDUSTRY_TEMPLATE_OPTIONS } from "@/industry-templates";

// P1.4: dynamic enum-derive — nye industries i industry-templates/index.ts
// accepteres automatisk uden at vi behøver opdatere zod-schema her.
const INDUSTRY_SLUGS = INDUSTRY_TEMPLATE_OPTIONS.map((o) => o.slug) as [
  string,
  ...string[],
];

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Task D: setup-wizard server-actions.
 *
 * 5-trins flow: brand → tema-guidance → AI/features → første kategori → done.
 * Hver action er idempotent — admin kan skifte trin frem og tilbage uden at
 * få duplicate-rows. createCategoryStep upsert'er på slug.
 */

/**
 * ULTRAPLAN-lite UL5: brand-step skriver nu til de udvidede BrandingSettings-
 * felter (tagline, domain, emails, industryTemplate). Felter er nullable så
 * tomme værdier bevarer brand.config defaults.
 */
const brandSchema = z.object({
  storeName: z.string().min(2).max(60),
  announcement: z.string().max(160).default(""),
  tagline: z.string().trim().max(120).optional(),
  domain: z.string().trim().max(120).optional(),
  emailSupport: z.string().trim().email().optional().or(z.literal("")),
  industryTemplate: z.enum(INDUSTRY_SLUGS).optional(),
});

export async function saveBrandStep(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = brandSchema.safeParse({
    storeName: formData.get("storeName"),
    announcement: formData.get("announcement") ?? "",
    tagline: formData.get("tagline") || undefined,
    domain: formData.get("domain") || undefined,
    emailSupport: formData.get("emailSupport") || undefined,
    industryTemplate: formData.get("industryTemplate") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige data" };
  }
  const data = parsed.data;
  await prisma.brandingSettings.upsert({
    where: { id: 1 },
    update: {
      storeName: data.storeName,
      announcement: data.announcement,
      tagline: data.tagline || null,
      domain: data.domain || null,
      emailSupport: data.emailSupport || null,
      industryTemplate: data.industryTemplate || null,
    },
    create: {
      id: 1,
      storeName: data.storeName,
      heroImage: "",
      announcement: data.announcement,
      tagline: data.tagline || null,
      domain: data.domain || null,
      emailSupport: data.emailSupport || null,
      industryTemplate: data.industryTemplate || null,
    },
  });
  // Invalider brand-cache så next request reflekterer ændringen
  const { invalidateBrandCache } = await import("@/lib/brand");
  invalidateBrandCache();
  revalidatePath("/admin/setup");
  revalidatePath("/", "layout"); // brand reflekteres i header/footer
  return { ok: true };
}

const aiSchema = z.object({
  anthropicApiKey: z.string().trim().optional(),
});

export async function saveAiStep(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = aiSchema.safeParse({
    anthropicApiKey: formData.get("anthropicApiKey") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Ugyldig key" };
  }
  // Tom key = "spring over" (admin kan altid tilføje senere via /admin/integrations).
  const key = parsed.data.anthropicApiKey?.trim();
  if (key) {
    await prisma.integrationSettings.upsert({
      where: { id: 1 },
      update: { anthropicApiKey: key },
      create: { id: 1, anthropicApiKey: key },
    });
  }
  revalidatePath("/admin/setup");
  return { ok: true };
}

const categorySchema = z.object({
  name: z.string().min(2).max(60),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug må kun indeholde små bogstaver, tal og bindestreger"),
  heroImage: z.string().url().optional().or(z.literal("")),
});

export async function createCategoryStep(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    heroImage: formData.get("heroImage") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige data" };
  }
  await prisma.category.upsert({
    where: { slug: parsed.data.slug },
    update: {
      name: parsed.data.name,
      heroImage: parsed.data.heroImage || null,
    },
    create: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      heroImage: parsed.data.heroImage || null,
    },
  });
  revalidatePath("/admin/setup");
  revalidatePath("/admin/kategorier");
  return { ok: true };
}

/**
 * ULTRAPLAN-lite UL6: theme-step server-actions.
 */

const themeSchema = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentDeep: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  cream: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sand: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ink: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  muted: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function saveThemeStep(
  theme: unknown,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = themeSchema.safeParse(theme);
  if (!parsed.success) {
    return { ok: false, error: "Ugyldig farve — hex-format skal være #rrggbb" };
  }
  await prisma.brandingSettings.upsert({
    where: { id: 1 },
    update: { themeJson: JSON.stringify(parsed.data) },
    create: {
      id: 1,
      storeName: "Min shop",
      heroImage: "",
      announcement: "",
      themeJson: JSON.stringify(parsed.data),
    },
  });
  const { invalidateThemeCache } = await import("@/lib/theme");
  invalidateThemeCache();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * AI-genereret palette baseret på brand-beskrivelse. Returnerer hex-værdier
 * + rationale (vist i wizard som "Hvorfor disse farver").
 */
export async function generateThemeAction(
  brandDescription: string,
): Promise<
  | { ok: true; theme: { accent: string; accentDeep: string; cream: string; sand: string; ink: string; muted: string; rationale: string } }
  | { ok: false; error: string }
> {
  await requireAdmin();
  if (!brandDescription.trim() || brandDescription.length < 5) {
    return { ok: false, error: "Beskriv dit brand med mindst 5 tegn" };
  }
  try {
    const { generateThemePalette } = await import("@/lib/ai/theme-generator");
    const theme = await generateThemePalette(brandDescription);
    return { ok: true, theme };
  } catch (err) {
    console.error("[generateThemeAction]", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? `AI-generering fejlede: ${err.message}`
          : "AI-generering fejlede",
    };
  }
}

export async function finishSetup(): Promise<ActionResult> {
  await requireAdmin();
  await markSetupComplete();
  revalidatePath("/admin");
  revalidatePath("/admin/setup");
  return { ok: true };
}
