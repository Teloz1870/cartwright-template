/**
 * "Fable" — website-mode flagship DesignPack registration.
 *
 * A palette-adaptive story-page design (cw-* prefix + applyPaletteAsTheme)
 * celebrating metamorphosis: an instanced flock of 3D butterflies behind a
 * serif display hero, a scroll-cinema caterpillar → chrysalis → imago
 * timeline, a stat band, a safeguards story, pricing and a CTA. The whole
 * flock and every SVG motif re-tone to the shop's palette. Apex is the
 * webshop flagship; Fable is its website-mode counterpart.
 */
import type { DesignPack } from "../types";
import FableHomepage from "./homepage";
import { FableHeader, FableFooter } from "./chrome";

export const fableDesign: DesignPack = {
  slug: "fable",
  name: "Fable (flagship · metamorphosis)",
  description:
    "The website-mode flagship — an airy ivory story page where an instanced flock of 3D butterflies flutters behind a serif display hero, a scroll-cinema metamorphosis timeline (caterpillar → chrysalis → imago), a stat band, a safeguards story and a CTA. Palette-adaptive: the whole flock and every section re-tone to your brand.",
  mode: "website",
  chrome: "light",
  premium: true,
  source: "design.md",
  // Palette-adaptive: maps the active palette onto sol-* (chrome) AND cw-*
  // (atoms + the butterfly flock/SVG motifs), so the page re-skins to the shop.
  applyPaletteAsTheme: true,
  tokens: {
    prefix: "cw",
    palette: {
      accent: "#4e4af2",
      accentDeep: "#2f2bb8",
      cream: "#faf7f0",
      sand: "#f0ebdf",
      ink: "#23201c",
      muted: "#7d776c",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: FableHomepage,
  // Fable owns its frame: minimal ivory header (butterfly mark + storeName in
  // Fraunces) + calm English-first footer — instead of the shared store chrome.
  siteChrome: { Header: FableHeader, Footer: FableFooter },
};
