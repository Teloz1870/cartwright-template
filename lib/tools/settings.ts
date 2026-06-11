import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAudit } from "@/lib/audit";
import { defineTool } from "@/lib/tools/types";

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

export const getSettings = defineTool({
  name: "settings.get",
  description: "Get a settings singleton (shipping or branding).",
  scope: "settings:read",
  input: getInput,
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
        const updated = await prisma.brandingSettings.upsert({
          where: { id: 1 },
          update: args,
          create: { id: 1, ...args },
        });
        return updated;
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
