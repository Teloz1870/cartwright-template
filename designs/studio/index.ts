/**
 * Studio design — DesignPack registration.
 *
 * Source-of-truth tokens + sections lever i ./design.md (canonical, kan
 * exportes med `npx cartwright design export studio`). Render-laget bruger
 * StudioHomepage som monterer 6 sections fra ./sections/ atom-komponenter.
 */
import type { DesignPack } from "../types";
import StudioHomepage from "./homepage";
import { StudioHeader, StudioFooter } from "./chrome";

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
      // Purple brand (2026) — mirrors cartwright.app's rebrand (apps/web
      // global.css). Studio is applyPaletteAsTheme, so these tokens inject at
      // runtime ONLY when studio is the active design; the global
      // themes/studio.css @theme default stays terracotta so the live canaries
      // (apex/Solbrillen etc. share the cw-* tokens) are byte-unchanged.
      accent: "#7c5cff",
      accentDeep: "#5b3fd6",
      cream: "#fafaf9",
      sand: "#f5f5f4",
      ink: "#0a0a0b",
      muted: "#737373",
    },
    extraTokens: {
      "color-cw-terracotta": "#7c5cff",
      "color-cw-terracotta-strong": "#5b3fd6",
      "color-cw-oker": "#9d7bff",
      "color-cw-oker-strong": "#6b4ce6",
      "color-cw-paper": "#fafaf9",
      "color-cw-ink": "#0a0a0b",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: StudioHomepage,
  // Studio owns its frame: a warm-tech header (bloom mark + storeName) + a calm
  // bordered footer — instead of the shared store chrome.
  siteChrome: { Header: StudioHeader, Footer: StudioFooter },
};
