/**
 * Magic Builder — cohesion re-skin, PURE text builders (no DB/LLM, unit-testable).
 *
 * Cohesion has two layers. COLOR cohesion is automatic for catalog atoms (they
 * render against the injected --color-cw-* / --color-sol-* CSS vars), so nothing
 * is needed there. VOICE cohesion is what these helpers add: brand-voice
 * guidance appended to catalog prompts, and a v0 system prompt seeded with the
 * brand palette + voice for the free-form HTML path. Mirrors the pure-function
 * pattern of lib/v0/transform/{extract,sanitize}.ts.
 */

export type BrandVoice = {
  storeName: string;
  tone: string;
  audience: string;
  formality: string;
  vibe: string;
};

/** The 6 brand palette hexes (subset of ThemePalette) used to seed v0 color guidance. */
export type ReskinPalette = {
  accent: string;
  accentDeep: string;
  cream: string;
  sand: string;
  ink: string;
  muted: string;
};

/** Append brand-voice guidance to a catalog generation prompt (copy in the brand voice). */
export function withBrandVoice(prompt: string, voice: BrandVoice): string {
  return `${prompt}

Brand-stemme (skriv al copy i denne stemme): butik "${voice.storeName}", tone=${voice.tone}, målgruppe=${voice.audience}, formalitet=${voice.formality}, vibe=${voice.vibe}. Skriv naturlig dansk i denne stemme — ikke generisk.`;
}

/**
 * Build the v0 system prompt for the free-form HTML path, seeded with brand
 * palette + voice. Color guidance is only included when a palette is available
 * (otherwise we don't invent colors). Extends the existing system prompt that
 * already pins raw-Tailwind-HTML output.
 */
export function buildV0SystemText(args: {
  storeName: string;
  voice: BrandVoice;
  palette: ReskinPalette | null;
}): string {
  const { storeName, voice, palette } = args;
  const colorLine = palette
    ? `Brug brandets farver via Tailwind arbitrary values: accent bg-[${palette.accent}]/text-[${palette.accent}], mørk accent ${palette.accentDeep}, baggrund ${palette.cream}, panel ${palette.sand}, tekst ${palette.ink}, dæmpet ${palette.muted}.`
    : "";
  return [
    `You are an expert frontend developer building ONE self-contained section for ${storeName}.`,
    `Output ONLY raw HTML with Tailwind CSS classes — no React, no <html>/<body>, no markdown fences.`,
    `Use class= (not className=). Ensure every tag is closed. Return only the section markup.`,
    `Brand voice: tone=${voice.tone}, audience=${voice.audience}, formality=${voice.formality}, vibe=${voice.vibe}.`,
    colorLine,
  ]
    .filter(Boolean)
    .join("\n");
}
