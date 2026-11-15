/**
 * SaaS Dark design — DesignPack registration.
 *
 * Antigravity-built dark-mode SaaS aesthetic. Pre-v0.7.0 var det den implicit
 * "industryTemplate=saas"-rendering i app/[locale]/page.tsx. Bevares som
 * eksplicit DesignPack så Teloz (industryTemplate=saas) fortsat resolver
 * til denne design via inferDesignFromIndustry().
 */
import type { DesignPack } from "../types";
import SaaSDarkHomepage from "./homepage";

export const saasDarkDesign: DesignPack = {
  slug: "saas-dark",
  name: "SaaS Dark (futurist / cyber)",
  description:
    "Dark bg with indigo accents, animated grid + glow, terminal code-snippet hero. Built by Antigravity for SaaS / AI-agency marketing sites.",
  mode: "website",
  chrome: "dark",
  premium: false,
  source: "design.md",
  tokens: {
    prefix: "saas",
    palette: {
      accent: "#818cf8",
      accentDeep: "#4f46e5",
      cream: "#000000",
      sand: "#0a0a0a",
      ink: "#ffffff",
      muted: "rgba(255,255,255,0.6)",
    },
    extraTokens: {
      "color-saas-glow": "rgba(99, 102, 241, 0.2)",
      "color-saas-grid-dot": "rgba(255, 255, 255, 0.15)",
      "color-saas-terminal-bg": "#0A0A0A",
      "color-saas-success": "#10b981",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: SaaSDarkHomepage,
};
