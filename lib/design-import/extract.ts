import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { chatModelResolved } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import { scrapeUrl } from "@/lib/firecrawl";
import { isValidHex, type ThemePalette } from "@/lib/theme";

/**
 * Design-import — træk design-*tokens* (palette, fonts, tone) fra en URL.
 * Firecrawl henter siden; modellen udleder en Cartwright-palette. MVP =
 * vibe-klon (farver/typografi/tone), IKKE pixel/layout-klon. Bygger på F's
 * Firecrawl-wrapper. Fail-soft.
 */

const HEX = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "hex color");

const DesignTokensSchema = z.object({
  palette: z.object({
    accent: HEX.describe("primary brand/CTA color"),
    accentDeep: HEX.describe("darker accent (footer/hover)"),
    cream: HEX.describe("page background (light, warm)"),
    sand: HEX.describe("panel/card background (slightly darker than cream)"),
    ink: HEX.describe("body text (near-black)"),
    muted: HEX.describe("secondary text (warm grey)"),
  }),
  fonts: z.object({
    heading: z.string().max(60),
    body: z.string().max(60),
  }),
  toneKeywords: z.array(z.string().max(30)).max(6),
});

export type DesignTokens = z.infer<typeof DesignTokensSchema>;

export type ExtractResult =
  | { ok: true; tokens: DesignTokens }
  | { ok: false; error: string };

export async function extractDesignTokens(url: string): Promise<ExtractResult> {
  if (!/^https?:\/\//i.test(url.trim())) {
    return { ok: false, error: "Angiv en gyldig URL (http/https)." };
  }
  const scraped = await scrapeUrl(url.trim());
  if (!scraped) {
    return { ok: false, error: "Firecrawl er ikke konfigureret eller scrape fejlede (sæt FIRECRAWL_API_KEY)." };
  }

  const resolved = await chatModelResolved("vibe");
  const prompt = `Infer a cohesive Cartwright color palette + typography + tone from this
website. Return 6 HEX colors (accent, accentDeep, cream, sand, ink, muted) that
capture the site's look, the heading + body font families, and up to 6 tone
keywords. Light, warm backgrounds; readable contrast.

SITE CONTENT:
${scraped.markdown.slice(0, 4000)}
METADATA: ${JSON.stringify(scraped.metadata).slice(0, 600)}`;

  try {
    const { object } = await withAuditContext(
      { provider: resolved.provider, model: resolved.model, modality: "text" },
      () => generateObject({ model: resolved.handle, schema: DesignTokensSchema, prompt }),
    );
    // Defensiv hex-validering (schema burde sikre det, men aldrig stol på output).
    for (const v of Object.values(object.palette)) {
      if (!isValidHex(v)) return { ok: false, error: "Modellen returnerede en ugyldig farve." };
    }
    return { ok: true, tokens: object };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kunne ikke udlede design." };
  }
}

/** Træk Cartwright-palette ud af tokens (det apply skriver til themeJson). */
export function tokensToPalette(tokens: DesignTokens): ThemePalette {
  return { ...tokens.palette };
}
