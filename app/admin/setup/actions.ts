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
import { setResendKeyAction } from "@/app/admin/integrations/actions";
import { brandingCreateDefaults } from "@/lib/branding-defaults";
import { withoutLockedIdentity } from "@/lib/identity";
import { brand } from "@/brand.config";

// P1.4: dynamic enum derive — new industries in industry-templates/index.ts
// are accepted automatically without us having to update the zod schema here.


const INDUSTRY_SLUGS = INDUSTRY_TEMPLATE_OPTIONS.map((o) => o.slug) as [
  string,
  ...string[],
];

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Task D: setup-wizard server-actions.
 *
 * 5-step flow: brand → theme guidance → AI/features → first category → done.
 * Every action is idempotent — an admin can move back and forth between steps
 * without producing duplicate rows. createCategoryStep upserts on slug.
 */

/**
 * ULTRAPLAN-lite UL5: the brand step now writes to the extended BrandingSettings
 * fields (tagline, domain, emails, industryTemplate). Fields are nullable so
 * empty values preserve the brand.config defaults.
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
   * v0.7.0: design pack choice. An empty string or undefined = keep null in the DB
   * (= inferDesignFromIndustry() resolver i render-laget). Valid values
   * matches DESIGN_OPTIONS in designs/index.ts; we do not validate strictly
   * here because imported designs are registered dynamically and can be added
   * after the setup wizard has run.
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }
  const data = parsed.data;

  // Under a locked policy the identity columns are dropped from the write —
  // storing a name that the seam replaces on the way out is how an admin field
  // ends up accepting input, reporting success and changing nothing. On a
  // first-time create the config value stands in instead (spread order: the
  // config defaults below, then `...identity`, which is empty when locked).
  const { data: identity } = withoutLockedIdentity({
    storeName: data.storeName,
    ecommerceEnabled: data.ecommerceEnabled,
  });

  await prisma.brandingSettings.upsert({
    where: { id: 1 },
    update: {
      ...identity,
      announcement: data.announcement,
      tagline: data.tagline || null,
      domain: data.domain || null,
      emailSupport: data.emailSupport || null,
      emailAdmin: data.emailAdmin || null,
      industryTemplate: data.industryTemplate || null,
      designSlug: data.designSlug || null,
    },
    create: {
      ...brandingCreateDefaults(),
      heroImage: "",
      announcement: data.announcement,
      tagline: data.tagline || null,
      domain: data.domain || null,
      emailSupport: data.emailSupport || null,
      emailAdmin: data.emailAdmin || null,
      industryTemplate: data.industryTemplate || null,
      designSlug: data.designSlug || null,
      ecommerceEnabled: brand.ecommerceEnabled,
      ...identity,
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

  // Invalidate the brand cache so the next request reflects the change
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
    return { ok: false, error: "Invalid setup: check the fields again." };
  }

  const { aiChoice, anthropicApiKey, googleGeminiApiKey, localAiEndpoint, localAiModel } = parsed.data;
  const gemini = googleGeminiApiKey?.trim() || null;

  // The Gemini key is set independently of the provider choice — it is used
  // for try-on/voice/vibe and is separate from the storefront chat provider.
  if (gemini) {
    await prisma.integrationSettings.upsert({
      where: { id: 1 },
      update: { googleGeminiApiKey: gemini },
      create: { id: 1, googleGeminiApiKey: gemini },
    });
  }

  // Cloud path: store any Anthropic key + set provider="anthropic".
  // An empty key = "skip" (an admin can always add one later via /admin/integrations).
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

  // Local path: set provider + endpoint + optional model. The model usually
  // stays empty until the admin pulls one via /admin/integrations' pull button.
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

  // Skip path: no provider-specific DB write (the admin configures it later).
  revalidatePath("/admin/setup");
  return { ok: true };
}

const domainSchema = z.object({
  domain: z.string().trim().optional(),
  // setupEmail = the shop's main email (sender + admin recipient). Read at runtime
  // by lib/brand.ts getBrand() → emailFrom/emailAdmin (with a brand.config fallback).
  setupEmail: z.string().trim().email().optional().or(z.literal("")),
  fromName: z.string().trim().max(80).optional(),
  emailProvider: z.enum(["google", "microsoft", "resend"]).optional(),
  // Optional Resend key — enables real email sending (otherwise .mail-previews/).
  resendKey: z.string().trim().optional(),
  phoneIncWorkspaceId: z.string().trim().optional(),
  phoneIncApiKey: z.string().trim().optional(),
});

export async function saveDomainStep(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = domainSchema.safeParse({
    domain: formData.get("domain") ?? "",
    setupEmail: formData.get("setupEmail") ?? "",
    fromName: formData.get("fromName") ?? "",
    emailProvider: formData.get("emailProvider") || undefined,
    resendKey: formData.get("resendKey") ?? "",
    phoneIncWorkspaceId: formData.get("phoneIncWorkspaceId") ?? "",
    phoneIncApiKey: formData.get("phoneIncApiKey") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid data — check the email format" };
  }

  const domain = parsed.data.domain?.trim();
  const setupEmail = parsed.data.setupEmail?.trim();
  const fromName = parsed.data.fromName?.trim();
  const resendKey = parsed.data.resendKey?.trim();
  const phoneWorkspace = parsed.data.phoneIncWorkspaceId?.trim();
  const phoneApi = parsed.data.phoneIncApiKey?.trim();

  // 1. Domain + email identity → BrandingSettings. emailFrom/emailAdmin/
  //    emailFromName are read at runtime by lib/brand.ts getBrand() (with a
  //    brand.config fallback), so this is NOT dead data — it overrides the
  //    sender/contact across the whole shop.
  const brandingUpdate: Record<string, string> = {};
  if (domain) brandingUpdate.domain = domain;
  if (setupEmail) {
    brandingUpdate.emailAdmin = setupEmail;
    brandingUpdate.emailFrom = setupEmail;
  }
  if (fromName) brandingUpdate.emailFromName = fromName;
  if (Object.keys(brandingUpdate).length > 0) {
    await prisma.brandingSettings.upsert({
      where: { id: 1 },
      update: brandingUpdate,
      create: {
        ...brandingCreateDefaults(),
        ...brandingUpdate,
      },
    });
  }

  // 2. Optional Resend key → reuse the fully wired integrations action
  //    (validates the 're_' prefix, encrypts, invalidates the cache). Done here so
  //    an invalid key is caught and reported rather than advancing the wizard.
  if (resendKey) {
    const fd = new FormData();
    fd.set("apiKey", resendKey);
    const res = await setResendKeyAction(fd);
    if (!res.ok) return { ok: false, error: res.error };
  }

  // 3. Phone.inc i IntegrationSettings
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
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
      body: "This service is under construction. Use the Vibe Sandbox to design it magically.",
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
      ...brandingCreateDefaults(),
      themeJson: JSON.stringify(parsed.data),
    },
  });
  const { invalidateThemeCache } = await import("@/lib/theme");
  invalidateThemeCache();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * An AI-generated palette based on the brand description. Returns hex values
 * + rationale (shown in the wizard as "Why these colours").
 */
export async function generateThemeAction(
  brandDescription: string,
): Promise<
  | { ok: true; theme: { accent: string; accentDeep: string; cream: string; sand: string; ink: string; muted: string; rationale: string } }
  | { ok: false; error: string }
> {
  await requireAdmin();
  if (!brandDescription.trim() || brandDescription.length < 5) {
    return { ok: false, error: "Describe your brand with at least 5 characters" };
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
          ? `AI generation failed: ${err.message}`
          : "AI generation failed",
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
  return { ok: false, error: res.error ?? "AI bootstrap failed" };
}
