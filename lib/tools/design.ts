import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { extractDesignTokens } from "@/lib/design-import/extract";
import { applyDesignPalette } from "@/lib/design-import/apply";
import { withAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  getActiveLayout,
  invalidateLayoutCache,
  layoutConfigSchema,
} from "@/lib/layout";

/**
 * AI tool: importér et design fra en URL → palette → themeJson. Design-vibe only
 * (farver/typografi/tone), ikke layout. Admin-gated. Revertible via audit.revert.
 */
export const importDesignTool = defineTool({
  name: "design.import_from_url",
  description:
    "Extract a color palette from a URL (Firecrawl + AI) and apply it as the shop theme (themeJson). Design-vibe only, not layout. Requires confirm: true and FIRECRAWL_API_KEY.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    url: z.string().url(),
    confirm: z.literal(true, { error: "Requires confirm: true" }),
  }),
  handler: async (args, ctx) => {
    const ex = await extractDesignTokens(args.url);
    if (!ex.ok) throw new Error(ex.error);
    const r = await applyDesignPalette(ex.tokens.palette, ctx.actor);
    if (!r.ok) throw new Error(r.error);
    return { applied: true, palette: ex.tokens.palette };
  },
});

export const getLayoutTool = defineTool({
  name: "design.get_layout",
  description: "Get the current section layout override (null = use design defaults).",
  scope: "settings:read",
  skipAudit: true,
  revertible: false,
  input: z.object({}).strict(),
  handler: async () => ({
    layout: await getActiveLayout(),
  }),
});

export const setLayoutTool = defineTool({
  name: "design.set_layout",
  description:
    "Reorder or hide sections of the studio homepage via layoutJson. Requires confirm: true. Revertible via audit.revert.",
  scope: "settings:write",
  revertible: true,
  input: z.object({
    confirm: z.literal(true, { error: "Requires confirm: true" }),
    layout: layoutConfigSchema,
  }),
  handler: async (args, ctx) => {
    const json = JSON.stringify(args.layout);
    await withAudit(
      {
        actor: ctx.actor,
        tool: "design.set_layout",
        args,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        before: async () => {
          const r = await prisma.brandingSettings.findUnique({
            where: { id: 1 },
            select: { layoutJson: true },
          });
          return r?.layoutJson ?? null;
        },
      },
      async () => {
        await prisma.brandingSettings.upsert({
          where: { id: 1 },
          update: { layoutJson: json },
          create: {
            id: 1,
            storeName: "Cartwright",
            heroImage: "",
            announcement: "",
            layoutJson: json,
          },
        });
      },
    );
    invalidateLayoutCache();
    return { layout: args.layout };
  },
  examples: [
    {
      name: "reorder",
      body: {
        confirm: true,
        layout: {
          sections: [
            { key: "hero", enabled: true },
            { key: "featureGrid", enabled: true },
            { key: "valueProps", enabled: true },
            { key: "howItWorks", enabled: true },
            { key: "stackGrid", enabled: true },
            { key: "ctaFooter", enabled: true },
          ],
        },
      },
    },
    {
      name: "hide-non-required-section",
      body: {
        confirm: true,
        layout: {
          sections: [
            { key: "hero", enabled: true },
            { key: "valueProps", enabled: false },
            { key: "featureGrid", enabled: true },
            { key: "howItWorks", enabled: true },
            { key: "stackGrid", enabled: true },
            { key: "ctaFooter", enabled: true },
          ],
        },
      },
    },
  ],
});

export const designTools = [importDesignTool, getLayoutTool, setLayoutTool];
