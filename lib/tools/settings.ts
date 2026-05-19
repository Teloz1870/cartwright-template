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

const getInput = z.object({
  type: z.enum(["shipping", "branding"]),
});

export const getSettings = defineTool({
  name: "settings.get",
  description: "Hent en settings-singleton (shipping eller branding).",
  scope: "settings:read",
  input: getInput,
  skipAudit: true,
  handler: async (args) => {
    if (args.type === "shipping") {
      const s = await prisma.shippingSettings.findUnique({ where: { id: 1 } });
      if (!s) throw new Error("ShippingSettings ikke seedet (id=1 mangler)");
      return { type: "shipping" as const, ...s };
    }
    const b = await prisma.brandingSettings.findUnique({ where: { id: 1 } });
    if (!b) throw new Error("BrandingSettings ikke seedet (id=1 mangler)");
    return { type: "branding" as const, ...b };
  },
});

export const updateShippingSettings = defineTool({
  name: "settings.update_shipping",
  description:
    "Opdater fragt-pris (i øre) og fri-fragt-tærskel (i øre). Påvirker checkout instant (30s cache).",
  scope: "settings:write",
  input: shippingInput,
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
    "Opdater branding: butiksnavn, hero-billede-URL, announcement-bar-tekst. Påvirker forsiden instant.",
  scope: "settings:write",
  input: brandingInput,
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

export const settingsTools = [
  getSettings,
  updateShippingSettings,
  updateBrandingSettings,
];
