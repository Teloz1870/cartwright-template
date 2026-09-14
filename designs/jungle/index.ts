/**
 * Jungle (website) — DesignPack registration.
 *
 * Aurora-derived (atom-composed, palette-adaptive, Voice-aware via the genome
 * prop) but trimmed to the human-friendly sections — no dev "how it works /
 * tech-stack" sections — so it fits non-dev verticals cleanly. Ships a lush green
 * default palette; `applyPaletteAsTheme` maps it onto sol-* + cw-* at runtime, so
 * the chrome, the atoms AND the palette-reactive 3D scene all go green (or adopt
 * whatever palette a Voice/theme sets). Mixable.
 */
import type { DesignPack } from "../types";
import JungleHomepage from "./homepage";
import { JungleHeader, JungleFooter } from "./chrome";

export const jungleDesign: DesignPack = {
  slug: "jungle",
  name: "Jungle (playful · nature)",
  description:
    "A friendly, organic website design — atom-composed and palette-adaptive, trimmed to the human sections (hero, value-props, features, CTA). A lush green palette + the waves scene make it read like a canopy. Great for kindergartens, cafés, wellness, and warm consumer brands.",
  mode: "website",
  premium: false,
  source: "index.ts",
  applyPaletteAsTheme: true,
  tokens: {
    prefix: "cw",
    palette: {
      accent: "#16a34a",
      accentDeep: "#15803d",
      cream: "#f6fef0",
      sand: "#dcfce7",
      ink: "#13251a",
      muted: "#6f8e7c",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: JungleHomepage,
  // Jungle owns its frame: a friendly organic header (vine-sprig mark +
  // storeName) + a footer laid over the full vine-divider motif — instead of
  // the shared store chrome.
  siteChrome: { Header: JungleHeader, Footer: JungleFooter },
};
