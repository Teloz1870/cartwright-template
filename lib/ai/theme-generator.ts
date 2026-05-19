import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/ai/client";
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
  accent: z.string().regex(HEX_RE, "Skal være #rrggbb"),
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
  const model = await chatModel();

  const { object } = await generateObject({
    model,
    schema: ThemeSchema,
    prompt: `Du designer en harmonisk farvepalette til en webshop.

Brand-beskrivelse fra ejeren: "${brandDescription}"

Returnér 6 hex-farver der harmonerer og passer til brandet:

- **accent** (#rrggbb): primær brand-color. Bruges til CTA-knapper, pris-tags, badges. Skal være rich og e-commerce-passende — IKKE neon, IKKE pastel. Mod-eksempler: #1e3f5a (dyb navy for solbriller), #2c4a1e (skov-grøn for hegn), #a85a3c (varm clay for keramik).
- **accentDeep** (#rrggbb): 20-30% mørkere variant af accent. Bruges til footer, sidebar, hover-states.
- **cream** (#rrggbb): page-background. Varm off-white (#f4efe6, #faf6ee, #f8f1e4). Læselig som baggrund for brødtekst.
- **sand** (#rrggbb): card/panel-background. Lidt mørkere end cream (#e8e1d3, #ede5d5). Skal kunne lægges OVENPÅ cream uden at "forsvinde".
- **ink** (#rrggbb): brødtekst. Næsten-sort (#1a1a1a, #15171a). IKKE ren #000000.
- **muted** (#rrggbb): sekundær tekst. Varm grå (#726d62, #807a6d). Skal kontrastere mod cream + være læselig.

Plus en kort **rationale** (1-2 sætninger): hvorfor disse farver passer til brandet.

Vigtigt: kontrast accent/cream skal være ≥ 4.5:1 for CTA-tekst-læselighed.`,
  });

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
