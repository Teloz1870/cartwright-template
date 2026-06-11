/**
 * Northern Coffee — DesignPack registration.
 *
 * Cartwright Studio premium design #1 (sketch towards v0.8.0 marketplace).
 * Story-first webshop layout for coffee roasters, bakeries, specialty food
 * shops. Designet er pt registreret direkte i designs/ — når v0.8.0
 * marketplace lander, flytter den ud i cartwright-marketplace repo og
 * installeres via `npx cartwright design install @marketplace/northern-coffee`.
 *
 * Marked premium: true → ⭐ Pro badge i SetupWizard + /admin/designs når
 * brand.features.cartwrightPlus === false (honor-system fra v0.6.0).
 */
import type { DesignPack } from "../types";
import NorthernCoffeeHomepage from "./homepage";

export const northernCoffeeDesign: DesignPack = {
  slug: "northern-coffee",
  name: "Northern Coffee (Cartwright Studio)",
  description:
    "Story-first webshop for coffee roasters and specialty food shops. Warm Scandinavian minimalism with split-screen narrative hero, oversized today's-roast feature, and typographic chapter-list categories.",
  mode: "webshop",
  premium: true,
  source: "design.md",
  tokens: {
    prefix: "nc",
    palette: {
      accent: "#c2410c",
      accentDeep: "#9a3412",
      cream: "#fdfaf4",
      sand: "#ede5d3",
      ink: "#2c1810",
      muted: "#8a7560",
    },
    extraTokens: {
      "color-nc-forest": "#44624a",
      "color-nc-cream-hi": "#fff8ec",
      "color-nc-line": "rgba(44, 24, 16, 0.12)",
      "color-nc-roast-bg": "#1a0e08",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, monospace",
    },
  },
  homepage: NorthernCoffeeHomepage,
};
