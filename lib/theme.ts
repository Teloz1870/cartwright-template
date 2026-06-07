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

export type ExtendedTheme = ThemePalette & {
  fonts?: { sans?: string; mono?: string };
  radius?: { md?: string; lg?: string; xl?: string };
};

/** Hex-color validation — #rgb eller #rrggbb */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RADIUS_RE = /^\d+(\.\d+)?(px|rem|em|%)$/;
const FONT_FAMILY_RE = /^[^{};<]+$/;

export function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}

/**
 * Parser runtime themeJson. De 6 ThemePalette-farver er stadig required og
 * skal være valide hex-farver; fonts/radius er additive extensions.
 *
 * Injection guards beskytter inline style-output: ugyldige font/radius
 * sub-værdier droppes per field uden at afvise paletten. Radius tokens,
 * tidligere kun themes/generic.css, kan dermed runtime-overrides.
 */
export function parseThemeJson(raw: string | null | undefined): ExtendedTheme | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<ExtendedTheme>;
    const required: (keyof ThemePalette)[] = [
      "accent", "accentDeep", "cream", "sand", "ink", "muted",
    ];
    for (const k of required) {
      const v = obj[k];
      if (typeof v !== "string" || !isValidHex(v)) return null;
    }
    const theme: ExtendedTheme = {
      accent: obj.accent!,
      accentDeep: obj.accentDeep!,
      cream: obj.cream!,
      sand: obj.sand!,
      ink: obj.ink!,
      muted: obj.muted!,
    };
    const fonts: ExtendedTheme["fonts"] = {};
    if (typeof obj.fonts?.sans === "string" && FONT_FAMILY_RE.test(obj.fonts.sans)) {
      fonts.sans = obj.fonts.sans;
    }
    if (typeof obj.fonts?.mono === "string" && FONT_FAMILY_RE.test(obj.fonts.mono)) {
      fonts.mono = obj.fonts.mono;
    }
    if (Object.keys(fonts).length > 0) theme.fonts = fonts;

    const radius: ExtendedTheme["radius"] = {};
    if (typeof obj.radius?.md === "string" && RADIUS_RE.test(obj.radius.md)) {
      radius.md = obj.radius.md;
    }
    if (typeof obj.radius?.lg === "string" && RADIUS_RE.test(obj.radius.lg)) {
      radius.lg = obj.radius.lg;
    }
    if (typeof obj.radius?.xl === "string" && RADIUS_RE.test(obj.radius.xl)) {
      radius.xl = obj.radius.xl;
    }
    if (Object.keys(radius).length > 0) theme.radius = radius;

    return theme;
  } catch {
    return null;
  }
}

/**
 * Serialiserer runtime theme til inline CSS. De 6 sol-* color lines bevares
 * byte-identisk; fonts/radius tilføjes kun når de er tilstede.
 *
 * parseThemeJson filtrerer med injection guards før værdierne når inline
 * style-output. Radius tokens fra themes/generic.css kan nu runtime-overrides
 * som --radius-sol-md/lg/xl.
 */
export function themeToInlineCss(theme: ExtendedTheme): string {
  const vars = [
    `--color-sol-accent: ${theme.accent};`,
    `--color-sol-accent-deep: ${theme.accentDeep};`,
    `--color-sol-cream: ${theme.cream};`,
    `--color-sol-sand: ${theme.sand};`,
    `--color-sol-ink: ${theme.ink};`,
    `--color-sol-muted: ${theme.muted};`,
  ];
  if (theme.fonts?.sans) vars.push(`--font-sans: ${theme.fonts.sans};`);
  if (theme.fonts?.mono) vars.push(`--font-mono: ${theme.fonts.mono};`);
  if (theme.radius?.md) vars.push(`--radius-sol-md: ${theme.radius.md};`);
  if (theme.radius?.lg) vars.push(`--radius-sol-lg: ${theme.radius.lg};`);
  if (theme.radius?.xl) vars.push(`--radius-sol-xl: ${theme.radius.xl};`);

  return `:root {
  ${vars.join("\n  ")}
}`;
}

// ───────────────────────────────────────────────────────────────────────────
// v0.9.4: imported-design palette → full-shop theme (sol- chrome + cw- atoms)
// ───────────────────────────────────────────────────────────────────────────

/** Lineær interpolation mellem to #rrggbb-farver. t=0 → a, t=1 → b. */
function hexLerp(a: string, b: string, t: number): string {
  const pa = a.match(/^#?([0-9a-f]{6})$/i);
  const pb = b.match(/^#?([0-9a-f]{6})$/i);
  if (!pa || !pb) return a;
  const na = parseInt(pa[1], 16);
  const nb = parseInt(pb[1], 16);
  const lerp = (sa: number, sb: number) =>
    Math.round(sa + (sb - sa) * Math.max(0, Math.min(1, t)));
  const r = lerp((na >> 16) & 0xff, (nb >> 16) & 0xff);
  const g = lerp((na >> 8) & 0xff, (nb >> 8) & 0xff);
  const bl = lerp(na & 0xff, nb & 0xff);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

/**
 * Mapper en imported designs 6-color palette til ET inline `:root`-stylesheet
 * der dækker BÅDE chrome-tokens (sol-*) OG Studio-section-atom-tokens (cw-*),
 * inkl. den afledte cw-stone-50..900 neutral-ramp (cream → ink). Det betyder
 * en imported design (som genbruger Studio-section-atoms) renderes konsistent
 * i SIN egen palette i stedet for studio-default terracotta eller en inert
 * custom-prefix.
 *
 * Kaldes KUN fra app/layout.tsx når det aktive design har
 * applyPaletteAsTheme === true og der ikke er en eksplicit themeJson-override.
 * Render-time + DB-drevet → ingen filesystem-write, virker i prod, og rører
 * aldrig built-in designs (de sætter ikke flaget).
 */
export function paletteToFullThemeCss(palette: ThemePalette): string {
  const { accent, accentDeep, cream, sand, ink, muted } = palette;
  // Studio cw-stone ramp: lys overflade (50) → næsten-sort tekst (900).
  const stoneStops: Array<[number, number]> = [
    [50, 0.0], [100, 0.06], [200, 0.16], [300, 0.3], [400, 0.46],
    [500, 0.6], [600, 0.7], [700, 0.8], [800, 0.9], [900, 1.0],
  ];
  const stone = stoneStops
    .map(([n, t]) => `  --color-cw-stone-${n}: ${hexLerp(cream, ink, t)};`)
    .join("\n");
  return `:root {
  --color-sol-accent: ${accent};
  --color-sol-accent-deep: ${accentDeep};
  --color-sol-cream: ${cream};
  --color-sol-sand: ${sand};
  --color-sol-ink: ${ink};
  --color-sol-muted: ${muted};
  --color-cw-terracotta: ${accent};
  --color-cw-terracotta-strong: ${accentDeep};
  --color-cw-oker: ${accent};
  --color-cw-oker-strong: ${accentDeep};
  --color-cw-paper: ${cream};
  --color-cw-ink: ${ink};
  --color-cw-code-bg: ${hexLerp(sand, ink, 0.55)};
${stone}
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

  // Phase I post-polish (2026-05-28): SKIP palette tokens for "sol" prefix
  // designs. The sol-* tokens are provided by theme CSS files
  // (themes/generic.css + themes/<slug>.css imported via globals.css).
  // Emitting `:root { --color-sol-accent: ... }` here injects an inline
  // <style> in <head> AFTER all CSS file imports, which then WINS the
  // cascade and overrides each brand's theme palette (coffee.css's
  // terracotta, solbrillen's classic, etc.) with the design's hardcoded
  // navy. Non-sol prefixes (nc-*, at-*, st-*) are only ever defined here
  // — theme CSS files don't know about them — so we still emit those.
  if (prefix !== "sol") {
    for (const [k, v] of Object.entries(palette)) {
      vars.push(`--color-${prefix}-${kebabCase(k)}: ${v};`);
    }
  }
  for (const [k, v] of Object.entries(extraTokens)) {
    vars.push(`--${k}: ${v};`);
  }
  if (fonts?.sans) vars.push(`--font-sans: ${fonts.sans};`);
  if (fonts?.mono) vars.push(`--font-mono: ${fonts.mono};`);

  if (vars.length === 0) return "";
  return `:root { ${vars.join(" ")} }`;
}

function kebabCase(s: string): string {
  // "accentDeep" → "accent-deep"
  return s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
