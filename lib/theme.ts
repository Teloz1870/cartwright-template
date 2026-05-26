import "server-only";

import { prisma } from "@/lib/db";

/**
 * ULTRAPLAN-lite UL6: theme-palette der gemmes i DB og injiceres
 * runtime via app/layout.tsx som inline CSS-vars.
 *
 * Vi gemmer KUN de 6 mest-skiftede tokens — resten af paletten
 * (glass-tokens, shadow-skala) forbliver i themes/<slug>.css fordi de
 * sjældent ændrer sig pr brand. Hvis admin vil have full control,
 * skal de redigere CSS-filen direkte.
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
}
