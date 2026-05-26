import "server-only";

import { prisma } from "@/lib/db";
import { getDesign, inferDesignFromIndustry, type DesignPack } from "@/designs";
import { brand } from "@/brand.config";

/**
 * ULTRAPLAN-lite UL6: theme-palette der gemmes i DB og injiceres
 * runtime via app/layout.tsx som inline CSS-vars.
 *
 * v0.7.0 design-registry tilføjer designToInlineCss() der monterer hele
 * DesignPack.tokens (palette + extraTokens + fonts) på en gang. Den nye
 * pipeline er:
 *
 *   1. getActiveDesign()        → DesignPack (designSlug i DB, ellers infer)
 *   2. designToInlineCss(pack)  → CSS variables for prefix + extraTokens
 *   3. getActiveTheme()         → ThemePalette override (themeJson i DB)
 *   4. themeToInlineCss(theme)  → 6 sol-* core tokens (last-write-wins)
 *
 * app/layout.tsx kalder begge i rækkefølge så themeJson kan override
 * design-pakkens default palette uden at skifte design.
 *
 * Vi gemmer KUN de 6 mest-skiftede tokens i ThemePalette — resten af
 * paletten (glass-tokens, shadow-skala) forbliver i themes/<slug>.css
 * fordi de sjældent ændrer sig pr brand.
 */

export type ThemePalette = {
  accent: string;       // primær brand color (CTA, pris, badges)
  accentDeep: string;   // mørkere variant (footer, sidebar, hover)
  cream: string;        // page background (lys, varm)
  sand: string;         // panel/card background (lidt mørkere end cream)
  ink: string;          // brødtekst (næsten-sort)
  muted: string;        // sekundær tekst (varm grå)
};

/** Hex-color validation — #rgb eller #rrggbb */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}

export function parseThemeJson(raw: string | null | undefined): ThemePalette | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<ThemePalette>;
    const required: (keyof ThemePalette)[] = [
      "accent", "accentDeep", "cream", "sand", "ink", "muted",
    ];
    for (const k of required) {
      const v = obj[k];
      if (typeof v !== "string" || !isValidHex(v)) return null;
    }
    return obj as ThemePalette;
  } catch {
    return null;
  }
}

export function themeToInlineCss(theme: ThemePalette): string {
  return `:root {
  --color-sol-accent: ${theme.accent};
  --color-sol-accent-deep: ${theme.accentDeep};
  --color-sol-cream: ${theme.cream};
  --color-sol-sand: ${theme.sand};
  --color-sol-ink: ${theme.ink};
  --color-sol-muted: ${theme.muted};
}`;
}

let cache: { value: ThemePalette | null; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

/**
 * Henter active theme fra DB, eller returnerer null (= brug compile-time
 * CSS-fil). Caches 30s for at undgå at hver page-load rammer DB.
 */
export async function getActiveTheme(): Promise<ThemePalette | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  try {
    const row = await prisma.brandingSettings.findUnique({
      where: { id: 1 },
      select: { themeJson: true },
    });
    const theme = parseThemeJson(row?.themeJson);
    cache = { value: theme, expiresAt: now + CACHE_TTL_MS };
    return theme;
  } catch {
    cache = { value: null, expiresAt: now + CACHE_TTL_MS };
    return null;
  }
}

export function invalidateThemeCache(): void {
  cache = null;
  designCache = null;
}

// ───────────────────────────────────────────────────────────────────────────
// v0.7.0: Design Registry integration
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resolve current DesignPack: eksplicit designSlug i DB beats inferens fra
 * industryTemplate. Returnerer null kun hvis slug peger på en design der
 * ikke findes i registry (typisk efter uninstall — admin skal fixe valg).
 */
export async function getActiveDesign(): Promise<DesignPack | null> {
  const now = Date.now();
  if (designCache && designCache.expiresAt > now) return designCache.value;
  try {
    const row = await prisma.brandingSettings.findUnique({
      where: { id: 1 },
      select: { designSlug: true, industryTemplate: true, ecommerceEnabled: true },
    });
    const slug =
      row?.designSlug ??
      inferDesignFromIndustry(
        row?.industryTemplate ?? brand.industryTemplate,
        row?.ecommerceEnabled ?? brand.ecommerceEnabled,
      );
    const design = getDesign(slug);
    designCache = { value: design, expiresAt: now + CACHE_TTL_MS };
    return design;
  } catch {
    designCache = { value: null, expiresAt: now + CACHE_TTL_MS };
    return null;
  }
}

let designCache: { value: DesignPack | null; expiresAt: number } | null = null;

/**
 * Konverterer en DesignPack til inline CSS — palette mapper til
 * --color-{prefix}-{kebab(field)} så hvert design kan have egen prefix
 * uden at kollidere. extraTokens emittes uændret (caller leverer fuld
 * variable-navn uden ledende `--`).
 *
 * fonts.sans/mono mapper til --font-sans/--font-mono som Tailwind v4
 * @theme-tokens læser. Override Geist's defaults hvis design vil have
 * Inter/Manrope/etc.
 */
export function designToInlineCss(design: DesignPack): string {
  const { prefix, palette, extraTokens = {}, fonts } = design.tokens;
  const vars: string[] = [];

  for (const [k, v] of Object.entries(palette)) {
    vars.push(`--color-${prefix}-${kebabCase(k)}: ${v};`);
  }
  for (const [k, v] of Object.entries(extraTokens)) {
    vars.push(`--${k}: ${v};`);
  }
  if (fonts?.sans) vars.push(`--font-sans: ${fonts.sans};`);
  if (fonts?.mono) vars.push(`--font-mono: ${fonts.mono};`);

  return `:root { ${vars.join(" ")} }`;
}

function kebabCase(s: string): string {
  // "accentDeep" → "accent-deep"
  return s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
