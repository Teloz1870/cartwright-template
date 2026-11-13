/**
 * Corporate Baseline design — DesignPack registration.
 *
 * Generic fallback for website-mode shops. Pre-v0.7.0 var det den
 * default-render i app/[locale]/page.tsx når industryTemplate ikke matchede
 * saas eller studio. Bevares som eksplicit DesignPack så
 * inferDesignFromIndustry() kan returnere "corporate-baseline" for de
 * shops.
 */
import type { DesignPack } from "../types";
import CorporateBaselineHomepage from "./homepage";

export const corporateBaselineDesign: DesignPack = {
  slug: "corporate-baseline",
  name: "Corporate Baseline (generic website)",
  description:
    "Neutral cinematic-hero + 3-card service-grid for marketing sites. Default fallback for website-mode shops.",
  mode: "website",
  premium: false,
  source: "design.md",
  tokens: {
    prefix: "sol",
    palette: {
      accent: "#1e3f5a",
      accentDeep: "#0f2438",
      cream: "#f4efe6",
      sand: "#e8e1d3",
      ink: "#1a1a1a",
      muted: "#726d62",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: CorporateBaselineHomepage,
};
