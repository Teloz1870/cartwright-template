/**
 * "Ember" — warm-glow premium DesignPack registration.
 *
 * Soft tech, warm bloom: a palette-adaptive pack (cw-* prefix +
 * applyPaletteAsTheme) for both site and shop. A pure-CSS gradient-mesh hero
 * (with an optional "orb" Live-Canvas layer when the shop runs 3D) under a
 * Plus Jakarta Sans display headline, glow-shadowed value cards, an
 * edge-to-edge ink band with a field of pulsing EmberSparks, and the shared
 * Studio atoms for stats/pricing/CTA. The EmberSpark motif — a hand-authored
 * glowing ember bloom — re-tones to the shop's palette like everything else.
 */
import type { DesignPack } from "../types";
import EmberHomepage from "./homepage";
import { EmberHeader, EmberFooter } from "./chrome";

export const emberDesign: DesignPack = {
  slug: "ember",
  name: "Ember (warm glow · soft tech)",
  description:
    "A warm-glow premium pack for site AND shop — a drifting pure-CSS gradient-mesh hero under bold Plus Jakarta Sans display type, cream cards lifted by soft terracotta glow shadows, an ink night-band of pulsing hand-drawn sparks, and a live featured-product grid in webshop mode. Palette-adaptive: the mesh, the glow and every EmberSpark re-tone to your brand.",
  mode: "both",
  chrome: "light",
  premium: true,
  source: "design.md",
  // Palette-adaptive: maps the active palette onto sol-* (chrome) AND cw-*
  // (atoms + the mesh/EmberSpark motifs), so the page re-skins to the shop.
  applyPaletteAsTheme: true,
  // cw-coherent ⇒ Mixer Parts render correctly on Ember (also listed in
  // MIXABLE_DESIGN_SLUGS, designs/options.ts).
  mixable: true,
  tokens: {
    prefix: "cw",
    palette: {
      accent: "#e8553a",
      accentDeep: "#b83a24",
      cream: "#fdf6ef",
      sand: "#f7e8da",
      ink: "#2b1d16",
      muted: "#7d6557",
    },
    fonts: {
      sans: "Geist, ui-sans-serif, system-ui, sans-serif",
      mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace",
      display: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif",
    },
  },
  homepage: EmberHomepage,
  // Ember owns its frame: warm paper header (EmberSpark mark + storeName in
  // Plus Jakarta Sans, ink-pill CTA with the glow shadow; cart/account/Shop
  // appear in webshop mode) + a calm English-first footer.
  siteChrome: { Header: EmberHeader, Footer: EmberFooter },
};
