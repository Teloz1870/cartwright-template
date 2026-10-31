---
schema: cartwright-design-v1
slug: apex
name: Apex (flagship · super-pro)
description: >-
  The flagship super-pro webshop design — a single page that composes a 3D
  Live-Canvas hero, a 3D product showroom, value props, the "build your own"
  configurator, the live product grid, a scroll-cinema story and a CTA.
  Palette-adaptive: every section (and every Pro element) adopts your brand
  palette. Complete and breathtaking out of the box.
mode: webshop
premium: true
tokens:
  prefix: cw
  palette:
    accent: "#7c5cff"
    accentDeep: "#5a3fd6"
    cream: "#faf8ff"
    sand: "#ece8f9"
    ink: "#16101f"
    muted: "#6e6680"
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
---

# Apex — design spec

**Apex** is the flagship: the proof that a Cartwright shop can feel like a $100k
build the day it ships. It composes — on one homepage — every breakthrough the
engine has, all re-skinning to the shop's own brand palette.

## The page
1. **3D hero** (`heroAurora`) — a palette-reactive Live-Canvas scene behind the headline.
2. **3D showroom** (`showroom3d`) — a rotatable product centrepiece + spec rail.
3. **Value props** — three reasons, in the brand voice (genome-aware).
4. **Configurator** (`configurator`) — build-your-own with a live preview + live price.
5. **The collection** — the real featured-product grid (`ProductGrid`).
6. **Scroll-cinema** (`scrollStory`) — a scroll-driven brand story (native CSS, no JS).
7. **CTA footer** — the closing call to action.

## Why palette-adaptive
Apex uses the shared `cw-*` atoms + `applyPaletteAsTheme`, so the active palette
maps onto **both** the chrome (sol-*) and the atoms + Pro elements (cw-*). Set a
`themeJson` palette and the whole page — hero glow, configurator swatches, 3D
accents, cards — re-skins to the brand. Default palette: a luxe violet.

## Mode
`webshop` (a complete storefront). The default chrome + product cards adapt via
tokens; no bespoke `siteChrome`/`webshop` overrides needed — the palette does the
work. (Distinct-identity designs like Halo use those overrides instead.)
