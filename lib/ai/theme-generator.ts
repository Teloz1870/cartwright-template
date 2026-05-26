import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { chatModelResolved } from "@/lib/ai/client";
import { withAuditContext } from "@/lib/audit-context";
import type { ThemePalette } from "@/lib/theme";

/**
 * ULTRAPLAN-lite UL6: AI-genereret theme-palette.
 *
 * Admin beskriver sit brand i 1 sætning ("galvaniserede hegn", "håndlavet
 * keramik", "minimalistiske sko"), Anthropic returnerer en harmonisk
 * 6-hex palette der kan applies direkte til shoppen.
 *
 * Style-guidelines i prompt:
 * - Accent skal være rich, ikke neon (e-commerce-passende)
 * - Cream + sand skal være varme off-whites (læselighed på UI)
 * - Ink næsten-sort, muted varm grå (typografisk hierarki)
 */

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

const ThemeSchema = z.object({
  accent: z.string().regex(HEX_RE, "Must be #rrggbb"),
  accentDeep: z.string().regex(HEX_RE),
  cream: z.string().regex(HEX_RE),
  sand: z.string().regex(HEX_RE),
  ink: z.string().regex(HEX_RE),
  muted: z.string().regex(HEX_RE),
  rationale: z.string().min(20).max(400),
});

export type GeneratedTheme = ThemePalette & { rationale: string };

export async function generateThemePalette(
  brandDescription: string,
): Promise<GeneratedTheme> {
  // vibe-intent tvinger Anthropic — generateObject + Zod kræver pålidelig
  // structured output. Local-providers fejler ofte med invalid JSON.
  const resolved = await chatModelResolved("vibe");

  const { object } = await withAuditContext(
    {
      provider: resolved.provider,
      model: resolved.model,
      modality: "text",
    },
    () =>
      generateObject({
        model: resolved.handle,
        schema: ThemeSchema,
        prompt: `You are designing a harmonious color palette for a webshop.

Brand description from the owner: "${brandDescription}"

Return 6 hex colors that harmonize and fit the brand:

- **accent** (#rrggbb): primary brand color. Used for CTA buttons, price tags, badges. Must be rich and suitable for ecommerce - NOT neon, NOT pastel. Counterexamples: #1e3f5a (deep navy for sunglasses), #2c4a1e (forest green for fencing), #a85a3c (warm clay for ceramics).
- **accentDeep** (#rrggbb): 20-30% darker variant of accent. Used for footer, sidebar, hover states.
- **cream** (#rrggbb): page-background. Warm off-white (#f4efe6, #faf6ee, #f8f1e4). Readable as background for body text.
- **sand** (#rrggbb): card/panel background. Slightly darker than cream (#e8e1d3, #ede5d5). Must be able to sit ON TOP of cream without "disappearing".
- **ink** (#rrggbb): body text. Near-black (#1a1a1a, #15171a). NOT pure #000000.
- **muted** (#rrggbb): secondary text. Warm gray (#726d62, #807a6d). Must contrast with cream + be readable.

Plus a short **rationale** (1-2 sentences): why these colors fit the brand.

Important: accent/cream contrast must be >= 4.5:1 for CTA text readability.`,
      }),
  );

  return {
    accent: object.accent,
    accentDeep: object.accentDeep,
    cream: object.cream,
    sand: object.sand,
    ink: object.ink,
    muted: object.muted,
    rationale: object.rationale,
  };
}
