/**
 * Studio design — DesignPack registration.
 *
 * Source-of-truth tokens + sections lever i ./design.md (canonical, kan
 * exportes med `npx cartwright design export studio`). Render-laget bruger
 * StudioHomepage som monterer 6 sections fra ./sections/ atom-komponenter.
 */
import type { DesignPack } from "../types";
import StudioHomepage from "./homepage";

export const studioDesign: DesignPack = {
  slug: "studio",
  name: "Studio (tech / agency)",
  description:
    "Premium warm-tech design — terracotta + oker palette, Geist typography, CSS-only animations. Mirrors cartwright.app's own marketing aesthetic.",
  mode: "website",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "cw",
    palette: {
      accent: "#d97757",
      accentDeep: "#c4623e",
      cream: "#fafaf9",
      sand: "#f5f5f4",
      ink: "#0a0a0b",
      muted: "#737373",
    },
    extraTokens: {
      "color-cw-terracotta": "#d97757",
      "color-cw-terracotta-strong": "#c4623e",
      "color-cw-oker": "#e8b339",
      "color-cw-oker-strong": "#c8951e",
      "color-cw-paper": "#fafaf9",
      "color-cw-ink": "#0a0a0b",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: StudioHomepage,
};
