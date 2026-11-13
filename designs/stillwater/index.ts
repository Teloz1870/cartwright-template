/**
 * "Stillwater" — calm-enterprise premium DesignPack registration.
 *
 * A serene, fully generative website design (zero photos): layered SVG
 * mountain ridgelines with atmospheric perspective, mist bands and calm water
 * — the signature StillwaterScape — rendered at four times of day behind huge
 * Fraunces type, the calm `waves` Live-Canvas scene in the hero, oversized
 * proof metrics, a star-lit "while you rest" incident timeline and quiet
 * testimonials. Palette-adaptive (cw-* prefix + applyPaletteAsTheme): every
 * ridge, mist band, star and avatar re-tones to the shop's palette.
 */
import type { DesignPack } from "../types";
import StillwaterHomepage from "./homepage";
import { StillwaterHeader, StillwaterFooter } from "./chrome";

export const stillwaterDesign: DesignPack = {
  slug: "stillwater",
  name: "Stillwater (calm enterprise)",
  description:
    "A calm-enterprise website design — from constant noise to quiet confidence. Fully generative landscapes (zero photos): layered SVG ridgelines with atmospheric perspective, mist and still water walk dawn → day → dusk → night behind huge Fraunces type, with the calm waves scene in the hero, oversized proof metrics, a star-lit night timeline and quiet testimonials. Palette-adaptive: the whole landscape re-tones to your brand.",
  mode: "website",
  chrome: "light",
  premium: true,
  source: "design.md",
  // Palette-adaptive: maps the active palette onto sol-* (chrome) AND cw-*
  // (atoms + every Scape ridge/mist/star/avatar), so the landscape re-skins.
  applyPaletteAsTheme: true,
  tokens: {
    prefix: "cw",
    palette: {
      accent: "#3d6b6b",
      accentDeep: "#27494c",
      cream: "#f7f7f4",
      sand: "#e8e6df",
      ink: "#1c2321",
      muted: "#7c8482",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: StillwaterHomepage,
  // Stillwater owns its frame: a hairline header (three-ridge mark + storeName
  // in Fraunces) + a ridge-divider footer — instead of the shared store chrome.
  siteChrome: { Header: StillwaterHeader, Footer: StillwaterFooter },
};
