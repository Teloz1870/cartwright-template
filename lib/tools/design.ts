import "server-only";

import { z } from "zod";
import { defineTool } from "@/lib/tools/types";
import { extractDesignTokens } from "@/lib/design-import/extract";
import { applyDesignPalette } from "@/lib/design-import/apply";

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

export const designTools = [importDesignTool];
