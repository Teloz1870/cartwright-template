/**
 * "Apex" — flagship super-pro DesignPack registration.
 *
 * A palette-adaptive webshop design (cw-* prefix + applyPaletteAsTheme) whose
 * homepage composes EVERYTHING Cartwright can do — a 3D Live-Canvas hero, a 3D
 * product showroom, value props, the "build your own" configurator, the live
 * featured-product grid, a scroll-cinema brand story, and a closing CTA. Every
 * section adopts the shop's own palette, so the whole page (and all the Pro
 * elements) re-skins to the brand. The proof of the super-pro vision: $100k feel,
 * complete out of the box.
 */
import type { DesignPack } from "../types";
import ApexHomepage from "./homepage";

export const apexDesign: DesignPack = {
  slug: "apex",
  name: "Apex (flagship · super-pro)",
  description:
    "The flagship super-pro webshop design — a single page that composes a 3D Live-Canvas hero, a 3D product showroom, value props, the 'build your own' configurator, the live product grid, a scroll-cinema story and a CTA. Palette-adaptive: every section (and every Pro element) adopts your brand palette. Complete and breathtaking out of the box.",
  mode: "webshop",
  chrome: "light",
  premium: true,
  source: "design.md",
  // Palette-adaptive: maps the active palette onto sol-* (chrome) AND cw-* (atoms
  // + Pro elements), so the whole page re-skins to the shop. Override via themeJson.
  applyPaletteAsTheme: true,
  tokens: {
    prefix: "cw",
    palette: {
      accent: "#7c5cff",
      accentDeep: "#5a3fd6",
      cream: "#faf8ff",
      sand: "#ece8f9",
      ink: "#16101f",
      muted: "#6e6680",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
  homepage: ApexHomepage,
};
