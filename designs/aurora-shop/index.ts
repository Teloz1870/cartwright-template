/**
 * Aurora (webshop) — DesignPack registration.
 *
 * The Cartwright flagship DEFAULT for webshop-mode (free). Same palette-adaptive
 * model as aurora-site: `applyPaletteAsTheme: true` maps the 6-colour palette onto
 * the sol-* chrome + cw-* atom tokens at runtime, so each shop renders this design
 * in its OWN brand palette (via BrandingSettings.themeJson) while a fresh shop gets
 * the Aurora default. Keeps the marker-safe HeroVideo/ProductGrid structure.
 */
import type { DesignPack } from "../types";
import AuroraShopHomepage from "./homepage";

export const auroraShopDesign: DesignPack = {
  slug: "aurora-shop",
  name: "Aurora — Webshop (Cartwright default)",
  description:
    "The flagship Cartwright webshop default. A clean, modern storefront — looping hero, featured products, trust row and category grid — built on the shared section atoms and adopting your brand palette automatically.",
  mode: "webshop",
  premium: false,
  source: "index.ts",
  applyPaletteAsTheme: true,
  tokens: {
    prefix: "cw",
    palette: {
      accent: "#5b54f0",
      accentDeep: "#4138c7",
      cream: "#fdfcfb",
      sand: "#f3f1ee",
      ink: "#18171f",
      muted: "#6c6a78",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: AuroraShopHomepage,
};
