"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { markSetupComplete } from "@/lib/setup-wizard";
import { INDUSTRY_TEMPLATE_OPTIONS } from "@/industry-templates";
import { bootstrapStoreWithAI } from "@/lib/ai-bootstrap";
import { VIBE_TEMPLATES } from "@/lib/templates";
import { invalidateApiKeyCache } from "@/lib/ai/client";
import { invalidateAiSettingsCache } from "@/lib/ai/settings";

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
  emailAdmin: z.string().trim().email().optional().or(z.literal("")),
  industryTemplate: z.enum(INDUSTRY_SLUGS).optional(),
  /**
   * v0.7.0: design-pakke valg. Tom string eller undefined = behold null i DB
   * (= inferDesignFromIndustry() resolver i render-laget). Valid values
   * matches DESIGN_OPTIONS i designs/index.ts; vi validere ikke streng
   * her fordi importerede designs registreres dynamisk og kan tilføjes
   * efter setup-wizard er kørt.
   */
  designSlug: z.string().trim().max(80).optional(),
  vibeTemplate: z.enum(["ecommerce", "saas", "minimalist"]).default("ecommerce"),
  ecommerceEnabled: z.boolean().default(true),
});

export async function saveBrandStep(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = brandSchema.safeParse({
    storeName: formData.get("storeName"),
    announcement: formData.get("announcement") ?? "",
    tagline: formData.get("tagline") || undefined,
    domain: formData.get("domain") || undefined,
    emailSupport: formData.get("emailSupport") || undefined,
    emailAdmin: formData.get("emailAdmin") || undefined,
    industryTemplate: formData.get("industryTemplate") || undefined,
    designSlug: formData.get("designSlug") || undefined,
    vibeTemplate: formData.get("vibeTemplate") || "ecommerce",
    ecommerceEnabled: formData.get("ecommerceEnabled") === "true",
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
      emailAdmin: data.emailAdmin || null,
      industryTemplate: data.industryTemplate || null,
      designSlug: data.designSlug || null,
      ecommerceEnabled: data.ecommerceEnabled,
    },
    create: {
      id: 1,
      storeName: data.storeName,
      heroImage: "",
      announcement: data.announcement,
      tagline: data.tagline || null,
      domain: data.domain || null,
      emailSupport: data.emailSupport || null,
      emailAdmin: data.emailAdmin || null,
      industryTemplate: data.industryTemplate || null,
      designSlug: data.designSlug || null,
      ecommerceEnabled: data.ecommerceEnabled,
    },
  });

  // Software 3.0: Seed the chosen Vibe HTML into the 'home' page
  const selectedHtml = VIBE_TEMPLATES[data.vibeTemplate as keyof typeof VIBE_TEMPLATES];
  if (selectedHtml) {
    await prisma.page.upsert({
      where: { slug: "home" },
      update: { vibeHtml: selectedHtml, title: "Home", body: "" },
      create: { slug: "home", title: "Home", body: "", vibeHtml: selectedHtml }
    });
  }

  // Invalider brand-cache så next request reflekterer ændringen
  const { invalidateBrandCache } = await import("@/lib/brand");
  invalidateBrandCache();
  revalidatePath("/admin/setup");
  revalidatePath("/", "layout"); // brand reflekteres i header/footer
  return { ok: true };
}

const aiSchema = z.object({
  aiChoice: z.enum(["cloud", "local", "skip"]).default("cloud"),
  anthropicApiKey: z.string().trim().optional(),
  googleGeminiApiKey: z.string().trim().optional(),
  localAiEndpoint: z.string().trim().optional(),
  localAiModel: z.string().trim().optional(),
});

export async function saveAiStep(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = aiSchema.safeParse({
    aiChoice: formData.get("aiChoice") ?? "cloud",
    anthropicApiKey: formData.get("anthropicApiKey") ?? "",
    googleGeminiApiKey: formData.get("googleGeminiApiKey") ?? "",
    localAiEndpoint: formData.get("localAiEndpoint") ?? "",
    localAiModel: formData.get("localAiModel") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Ugyldig opsætning: Tjek felterne igen." };
  }

  const { aiChoice, anthropicApiKey, googleGeminiApiKey, localAiEndpoint, localAiModel } = parsed.data;
  const gemini = googleGeminiApiKey?.trim() || null;

  // Gemini-keyen sættes uafhængigt af provider-valget — bruges til
  // try-on/voice/vibe og er separat fra storefront-chat-providern.
  if (gemini) {
    await prisma.integrationSettings.upsert({
      where: { id: 1 },
      update: { googleGeminiApiKey: gemini },
      create: { id: 1, googleGeminiApiKey: gemini },
    });
  }

  // Cloud-path: gem evt. Anthropic-key + sæt provider="anthropic".
  // Tom key = "spring over" (admin kan altid tilføje senere via /admin/integrations).
  if (aiChoice === "cloud") {
    const key = anthropicApiKey?.trim() || null;
    await prisma.integrationSettings.upsert({
      where: { id: 1 },
      update: {
        ...(key ? { anthropicApiKey: key } : {}),
        aiProvider: "anthropic",
      },
      create: {
        id: 1,
        ...(key ? { anthropicApiKey: key } : {}),
        aiProvider: "anthropic",
      },
    });
    invalidateApiKeyCache();
    invalidateAiSettingsCache();
  }

  // Local-path: sæt provider + endpoint + optional model. Modellen forbliver
  // typisk tom indtil admin pull'er via /admin/integrations's pull-knap.
  if (aiChoice === "local") {
    const endpoint = localAiEndpoint?.trim() || "http://localhost:11434/v1";
    const model = localAiModel?.trim() || null;
    await prisma.integrationSettings.upsert({
      where: { id: 1 },
      update: {
        aiProvider: "local",
        localAiEndpoint: endpoint,
        ...(model ? { localAiModel: model } : {}),
      },
      create: {
        id: 1,
        aiProvider: "local",
        localAiEndpoint: endpoint,
        ...(model ? { localAiModel: model } : {}),
      },
    });
    invalidateApiKeyCache();
    invalidateAiSettingsCache();
  }

  // Skip-path: ingen provider-specifik DB-write (admin konfigurerer senere).
  revalidatePath("/admin/setup");
  return { ok: true };
}

const domainSchema = z.object({
  domain: z.string().trim().optional(),
  phoneIncWorkspaceId: z.string().trim().optional(),
  phoneIncApiKey: z.string().trim().optional(),
});

export async function saveDomainStep(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = domainSchema.safeParse({
    domain: formData.get("domain") ?? "",
    phoneIncWorkspaceId: formData.get("phoneIncWorkspaceId") ?? "",
    phoneIncApiKey: formData.get("phoneIncApiKey") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Ugyldig data" };
  }

  const domain = parsed.data.domain?.trim();
  const phoneWorkspace = parsed.data.phoneIncWorkspaceId?.trim();
  const phoneApi = parsed.data.phoneIncApiKey?.trim();
  
  // 1. Save Domain in BrandingSettings
  if (domain) {
    await prisma.brandingSettings.upsert({
      where: { id: 1 },
      update: { domain },
      create: { 
        id: 1, 
        storeName: "Min shop",
        heroImage: "",
        announcement: "",
        domain, 
      },
    });
  }

  // 2. Save Phone.inc in IntegrationSettings
  if (phoneWorkspace || phoneApi) {
    await prisma.integrationSettings.upsert({
      where: { id: 1 },
      update: { 
        ...(phoneWorkspace ? { phoneIncWorkspaceId: phoneWorkspace } : {}),
        ...(phoneApi ? { phoneIncApiKey: phoneApi } : {}),
      },
      create: { 
        id: 1, 
        phoneIncWorkspaceId: phoneWorkspace || null,
        phoneIncApiKey: phoneApi || null,
      },
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
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens"),
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

const serviceSchema = z.object({
  title: z.string().min(2).max(60),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens"),
  heroImage: z.string().url().optional().or(z.literal("")),
});

export async function createServiceStep(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = serviceSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    heroImage: formData.get("heroImage") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldige data" };
  }
  await prisma.service.upsert({
    where: { slug: parsed.data.slug },
    update: {
      title: parsed.data.title,
      heroImage: parsed.data.heroImage || null,
    },
    create: {
      title: parsed.data.title,
      slug: parsed.data.slug,
      body: "Denne ydelse er under opbygning. Brug Vibe Sandkassen til at designe den magisk.",
      heroImage: parsed.data.heroImage || null,
      showInNav: true,
    },
  });
  revalidatePath("/admin/setup");
  revalidatePath("/admin/services");
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
    return { ok: false, error: "Invalid color - hex format must be #rrggbb" };
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

export async function bootstrapStoreAction(prompt: string): Promise<ActionResult> {
  await requireAdmin();
  const res = await bootstrapStoreWithAI(prompt);
  if (res.ok) {
    revalidatePath("/", "layout");
    return { ok: true };
  }
  return { ok: false, error: res.error };
}
