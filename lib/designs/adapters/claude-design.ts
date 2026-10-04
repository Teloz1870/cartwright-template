/**
 * Claude Design / v0 / Loveable → cartwright-design-v1 adapter.
 *
 * Disse tools output'er raw React + Tailwind components, IKKE struktureret
 * design-data. Adapter-strategi:
 *
 *   1. Tag input som "design bundle" — kan være enten:
 *      - Et JSON-objekt med {tokens, components} fra v0's component-export
 *      - En raw .tsx fil hvor vi scrape hex-farver fra style/className-strings
 *      - En tailwind.config.js snippet hvor vi læser theme.extend.colors
 *
 *   2. Auto-detect format via heuristics og dispatch til relevant parser
 *   3. Output best-effort cartwright-design-v1 med:
 *      - Palette = unique hex-codes sorted by frequency (top 6 mapper til
 *        accent/accentDeep/cream/sand/ink/muted)
 *      - Sections = enkelt hero-section som placeholder (med imported copy
 *        hvis vi kan finde headline/tagline regex-match)
 *
 * Det er en BEST-EFFORT bridge — designeren forventes at åbne den
 * resulterende design.md og rette palette + sections før commit. Adapter'en
 * sparer ~30 min hånd-conversion, ikke 3 timer.
 */
import { serializeDesignMd } from "../serializer";
import type { DesignMdSpec } from "../spec";

export type ClaudeDesignInput = {
  /** Raw .tsx/.jsx kode der skal scrapes. */
  source: string;
  /** Optional tailwind config snippet for bedre token-extraction. */
  tailwindConfig?: string;
  /** Override slug — ellers udledt fra component-navn eller "imported". */
  slug?: string;
  /** Hvilken mode designet er for. Default: website. */
  mode?: "website" | "webshop" | "both";
};

export function fromClaudeDesign(input: ClaudeDesignInput): string {
  const hexes = extractHexColors(input.source + "\n" + (input.tailwindConfig ?? ""));
  const palette = mapHexesToPalette(hexes);
  const headline = extractFirstText(input.source, /<h1[^>]*>([^<]{4,80})<\/h1>/i)
    ?? extractFirstText(input.source, /\btitle:\s*["'`]([^"'`\n]{4,80})["'`]/i)
    ?? "Imported design";
  const tagline = extractFirstText(input.source, /<p[^>]*>([^<]{10,200})<\/p>/i)
    ?? "Imported via Claude Design / v0 adapter. Edit copy in design.md and re-import.";

  const slug =
    input.slug ??
    extractFirstText(input.source, /export\s+(?:default\s+)?function\s+([A-Z]\w+)/) ??
    "imported-design";

  const spec: DesignMdSpec = {
    schema: "cartwright-design-v1",
    slug: slugify(slug),
    name: humanize(slug),
    description:
      "Auto-imported from Claude Design / v0 / Loveable output. Best-effort token + copy extraction — refine in design.md before shipping.",
    // v0.9.4: default "both" så imported design altid er synlig i /admin/designs
    // uanset shop-mode (se note i stitch.ts). Override via design.md hvis ønsket.
    mode: input.mode ?? "both",
    premium: false,
    tokens: {
      prefix: tokenPrefixFromSlug(slug),
      palette,
      fonts: {
        sans: "Geist, ui-sans-serif, system-ui, sans-serif",
        mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
      },
    },
    sections: [
      {
        type: "hero",
        headline,
        tagline,
        cta: { label: "Get started", href: "/contact" },
      },
      {
        type: "cta-footer",
        title: "Get in touch",
        description:
          "This is a placeholder section auto-generated from a raw React import. Edit design.md to add your real content.",
        cta: { label: "Contact us", href: "/contact" },
      },
    ],
  };

  return serializeDesignMd(spec);
}

// ── Color extraction ───────────────────────────────────────────────────────

function extractHexColors(source: string): string[] {
  const matches = source.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
  // Tæl frekvens og sortér descending — mest-brugte farver er sandsynligvis
  // brand-tokens, ikke en-off accents.
  const freq = new Map<string, number>();
  for (const m of matches) {
    const k = m.toLowerCase();
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
}

function mapHexesToPalette(
  hexes: string[],
): DesignMdSpec["tokens"]["palette"] {
  // Sensible defaults hvis vi ikke har 6 unique hex-farver
  const fallback = [
    "#0a0a0a", // ink
    "#171717", // accent-deep
    "#525252", // accent
    "#a8a29e", // muted
    "#e7e5e4", // sand
    "#fafaf9", // cream
  ];
  const picked = [...hexes, ...fallback].slice(0, 6);
  return {
    // Heuristic: lyseste hex → cream (page bg), mørkeste → ink (tekst).
    accent: picked[2],
    accentDeep: picked[1],
    cream: pickLightest(picked),
    sand: pickSecondLightest(picked),
    ink: pickDarkest(picked),
    muted: picked[3],
  };
}

function luminance(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return 0;
  const num = parseInt(m[1], 16);
  const r = ((num >> 16) & 0xff) / 255;
  const g = ((num >> 8) & 0xff) / 255;
  const b = (num & 0xff) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function pickLightest(hexes: string[]): string {
  return [...hexes].sort((a, b) => luminance(b) - luminance(a))[0] ?? "#fafaf9";
}

function pickSecondLightest(hexes: string[]): string {
  const sorted = [...hexes].sort((a, b) => luminance(b) - luminance(a));
  return sorted[1] ?? "#f5f5f4";
}

function pickDarkest(hexes: string[]): string {
  return [...hexes].sort((a, b) => luminance(a) - luminance(b))[0] ?? "#0a0a0a";
}

// ── Text extraction ────────────────────────────────────────────────────────

function extractFirstText(source: string, re: RegExp): string | null {
  const m = source.match(re);
  return m?.[1]?.trim() ?? null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "imported";
}

function humanize(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function tokenPrefixFromSlug(slug: string): string {
  return slug.replace(/-/g, "").slice(0, 8) || "imp";
}
