import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";
import { withoutLockedIdentity } from "@/lib/identity";
import { brand } from "@/brand.config";

// ── Settings-modellen ────────────────────────────────────────────────────────
//
// Typed singletons med fast id=1. lib/pricing.ts (Step 6 i planen) udvides til
// at læse ShippingSettings via getShippingSettings() med 30-sekunders memory-
// cache, så denne tool kan opdatere i realtid uden race-conditions på Server
// Action-niveau.

const shippingInput = z.object({
  shippingFeeOere: z.number().int().min(0).max(50000),
  freeShippingThresholdOere: z.number().int().min(0).max(1_000_000),
});

const brandingInput = z.object({
  storeName: z.string().min(1).max(100),
  heroImage: z.string().url(),
  announcement: z.string().max(200),
});

// ── In-place copy edit (Annotations) ─────────────────────────────────────────
//
// Single-field copy edit for the hero headline + tagline. These are individual
// nullable BrandingSettings columns, so a targeted single-column update touches
// nothing else (unlike update_branding, whose input requires all three branding
// fields at once). Used by the /api/admin/annotate endpoint (click-to-edit on
// the live storefront) and reachable from admin chat. Requires confirm: true.
const copyInput = z.object({
  field: z.enum(["websiteHeadline", "tagline"]),
  value: z.string().min(1).max(200),
  confirm: z.literal(true, { error: "Requires confirm: true" }),
});

const getInput = z.object({
  type: z.enum(["shipping", "branding"]),
});

const shippingSettingsOutput = z
  .object({
    id: z.number().int(),
    shippingFeeOere: z.number().int(),
    freeShippingThresholdOere: z.number().int(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

/** Serialized scalar shape returned by Prisma for BrandingSettings. Relations
 * are not included by these handlers; nullable columns remain explicit. */
const brandingSettingsOutput = z
  .object({
    id: z.number().int(),
    storeName: z.string(),
    heroImage: z.string(),
    heroImageAssetId: z.string().nullable(),
    announcement: z.string(),
    agenticPolicyJson: z.string().nullable(),
    setupComplete: z.boolean(),
    tagline: z.string().nullable(),
    domain: z.string().nullable(),
    emailFrom: z.string().nullable(),
    emailFromName: z.string().nullable(),
    emailSupport: z.string().nullable(),
    emailAdmin: z.string().nullable(),
    industryTemplate: z.string().nullable(),
    designSlug: z.string().nullable(),
    themeJson: z.string().nullable(),
    layoutJson: z.string().nullable(),
    ecommerceEnabled: z.boolean(),
    websiteHeadline: z.string().nullable(),
    heroCta: z.string().nullable(),
    logoImageUrl: z.string().nullable(),
    logoMarkPaths: z.string().nullable(),
    logoMarkViewBox: z.string().nullable(),
    logoMarkStrokeWidth: z.number().int().nullable(),
    logoMarkClass: z.string().nullable(),
    logoTransform: z.string().nullable(),
    faviconBg: z.string().nullable(),
    faviconFg: z.string().nullable(),
    defaultLocale: z.string().nullable(),
    featureOverridesJson: z.string().nullable(),
    threeDConfigJson: z.string().nullable(),
    chromeJson: z.string().nullable(),
    genomeJson: z.string().nullable(),
    seoIndexing: z.string().nullable(),
    aiCrawlers: z.string().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

const getSettingsOutput = z.discriminatedUnion("type", [
  shippingSettingsOutput.extend({ type: z.literal("shipping") }),
  brandingSettingsOutput.extend({ type: z.literal("branding") }),
]);

const updatedBrandingOutput = brandingSettingsOutput.extend({
  /** Present only when sovereign identity policy discarded storeName. */
  ignored: z.array(z.string()).optional(),
});

export const getSettings = defineTool({
  name: "settings.get",
  description: "Get a settings singleton (shipping or branding).",
  scope: "settings:read",
  input: getInput,
  output: getSettingsOutput,
  skipAudit: true,
  handler: async (args) => {
    if (args.type === "shipping") {
      const s = await prisma.shippingSettings.findUnique({ where: { id: 1 } });
      if (!s) throw new Error("ShippingSettings not seeded (id=1 missing)");
      return { type: "shipping" as const, ...s };
    }
    const b = await prisma.brandingSettings.findUnique({ where: { id: 1 } });
    if (!b) throw new Error("BrandingSettings not seeded (id=1 missing)");
    return { type: "branding" as const, ...b };
  },
});

export const updateShippingSettings = defineTool({
  name: "settings.update_shipping",
  description:
    "Update shipping price (in ore) and free-shipping threshold (in ore). Affects checkout instantly (30s cache).",
  scope: "settings:write",
  input: shippingInput,
  output: shippingSettingsOutput,
  examples: [
    {
      name: "Update shipping pricing",
      body: {
        shippingFeeOere: 4900,
        freeShippingThresholdOere: 49900
      }
    }
  ],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "settings.update_shipping",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => prisma.shippingSettings.findUnique({ where: { id: 1 } }),
      },
      async () => {
        const updated = await prisma.shippingSettings.upsert({
          where: { id: 1 },
          update: args,
          create: { id: 1, ...args },
        });
        return updated;
      },
    );
  },
});

export const updateBrandingSettings = defineTool({
  name: "settings.update_branding",
  description:
    "Update branding: shop name, hero image URL, and announcement bar text. Affects the front page instantly.",
  scope: "settings:write",
  input: brandingInput,
  output: updatedBrandingOutput,
  examples: [
    {
      name: "Update store branding",
      body: {
        storeName: "Cartwright Coffee",
        heroImage: "https://example.com/hero.jpg",
        announcement: "Free shipping on orders over 499 DKK!"
      }
    }
  ],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "settings.update_branding",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => prisma.brandingSettings.findUnique({ where: { id: 1 } }),
      },
      async () => {
        // Same rule as the admin form: a locked policy owns the store name, so
        // it is dropped from the write instead of stored inert. The tool surface
        // is where an AI agent configures a shop — if the admin is told a field
        // is locked and the tool writes it anyway, the lock is decoration.
        // `ignored` is returned so the agent learns the field did not change,
        // rather than reading back its own input as confirmation.
        //
        // `storeName` is destructured OUT of `args` first. Spreading `...args`
        // and then the filtered object would put it straight back — the filter
        // has to remove the field from what gets spread, not sit next to it.
        const { storeName, ...rest } = args;
        const { data: identity, ignored } = withoutLockedIdentity({ storeName });
        const updated = await prisma.brandingSettings.upsert({
          where: { id: 1 },
          update: { ...rest, ...identity },
          create: { id: 1, ...rest, storeName: brand.storeName, ...identity },
        });
        return ignored.length ? { ...updated, ignored } : updated;
      },
    );
  },
});

export const updateCopySettings = defineTool({
  name: "settings.update_copy",
  description:
    "Set a single piece of front-page copy: field 'websiteHeadline' (the hero heading) or 'tagline' (the hero sub-line). Touches only that column. Affects the front page instantly. Requires confirm: true.",
  scope: "settings:write",
  input: copyInput,
  output: brandingSettingsOutput,
  examples: [
    {
      name: "Update hero headline",
      body: { field: "websiteHeadline", value: "Coffee worth slowing down for.", confirm: true },
    },
  ],
  handler: async (args, ctx) => {
    return withAudit(
      {
        actor: ctx.actor,
        tool: "settings.update_copy",
        args,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: () => prisma.brandingSettings.findUnique({ where: { id: 1 } }),
      },
      async () => {
        const existing = await prisma.brandingSettings.findUnique({
          where: { id: 1 },
          select: { id: true },
        });
        if (!existing) throw new Error("BrandingSettings not seeded (id=1 missing)");
        // Single-column update — siblings are never touched.
        const updated = await prisma.brandingSettings.update({
          where: { id: 1 },
          data: { [args.field]: args.value },
        });
        return updated;
      },
    );
  },
});

export const settingsTools = [
  getSettings,
  updateShippingSettings,
  updateBrandingSettings,
  updateCopySettings,
];
