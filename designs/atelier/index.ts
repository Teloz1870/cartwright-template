/**
 * Atelier — DesignPack registration.
 *
 * Cartwright Studio premium design #2. Sketch towards v0.8.0 marketplace.
 * Museum-minimal luxury for fashion, jewelry, leather goods.
 */
import type { DesignPack } from "../types";
import AtelierHomepage from "./homepage";

export const atelierDesign: DesignPack = {
  slug: "atelier",
  name: "Atelier (Cartwright Studio)",
  description:
    "Museum-minimal luxury layout for fashion, jewelry, and leather goods. Monochrome with gold accent, ALL-CAPS sparse typography, full-bleed product photography. Curated catalogs only.",
  mode: "webshop",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "at",
    palette: {
      accent: "#9b7837",
      accentDeep: "#7a5a2d",
      cream: "#f6f3ee",
      sand: "#ebe6dd",
      ink: "#0a0a0a",
      muted: "#6b6b6b",
    },
    extraTokens: {
      "color-at-stone": "#c4bdb0",
      "color-at-line": "rgba(10, 10, 10, 0.1)",
      "color-at-overlay": "rgba(10, 10, 10, 0.5)",
      "color-at-noir": "#1c1815",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, monospace",
    },
  },
  homepage: AtelierHomepage,
};
