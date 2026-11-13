---
schema: cartwright-design-v1
slug: ember
name: Ember (warm glow · soft tech)
description: >-
  A warm-glow premium pack for site AND shop — a drifting pure-CSS
  gradient-mesh hero under bold Plus Jakarta Sans display type, cream cards
  lifted by soft terracotta glow shadows, an ink night-band of pulsing
  hand-drawn sparks, and a live featured-product grid in webshop mode.
  Palette-adaptive: the mesh, the glow and every EmberSpark re-tone to your
  brand.
mode: both
premium: true
tokens:
  prefix: cw
  palette:
    accent: "#e8553a"
    accentDeep: "#b83a24"
    cream: "#fdf6ef"
    sand: "#f7e8da"
    ink: "#2b1d16"
    muted: "#7d6557"
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    display: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
---

# Ember — design spec

**Ember** is the warm-glow pack: soft tech, warm bloom. Where most "AI builder"
aesthetics run cold and blue, Ember is lit like a desk lamp at dusk — cream
paper, terracotta light, ink-dark contrast — while staying every bit a modern
product page. It runs in BOTH modes: a corporate/marketing site out of the box,
a storefront the moment the shop flag flips.

## The page
1. **Mesh hero** (`EmberHero`) — full-bleed `min-h-[92vh]`. A pure-CSS gradient
   mesh: layered radial gradients + three drifting gradient blobs
   (transform-only keyframes, `prefers-reduced-motion`-gated). Every mesh color
   is a `color-mix(in oklab, var(--color-cw-terracotta) N%, …)` chain so the
   bloom re-tones with any palette; ONE warm amber constant (`#ffb45c`) is
   mixed at low alpha as the documented candle-warm undertone. When the shop
   runs 3D (`threeD` flag), the `orb` Live-Canvas scene renders at `-z-10` —
   the mesh at `-z-20` is ALWAYS painted (LCP/no-WebGL-safe). Display headline
   in Plus Jakarta Sans with one gradient-clipped accent word; ink-pill primary
   CTA with a warm glow shadow.
2. **From the shop** (webshop mode) — the live `ProductGrid` over `featured`,
   inside a Studio section. Real data; the owner curates it in the admin.
3. **Glow cards** (`EmberGlowCards`) — rounded cream value cards on a sand
   band, each lifted by `0 8px 40px` of terracotta-mixed glow, led by the
   EmberSpark "bloom" mark. Asymmetric header (copy left, bloom right).
4. **Embers band** (`EmberEmbersBand`) — the edge-to-edge ink contrast band:
   a hand-placed field of small pulsing sparks (CSS opacity/scale, reduced-
   motion-safe) behind a 7/5 asymmetric split of narrative + feature list.
5. **Stat band** (`StudioStatBand`) — four warm numbers.
6. **Pricing** (`StudioPricingTable`) — Kindling / Hearth / Bonfire.
7. **CTA footer** (`StudioCtaFooter`) — "Light yours."

## The EmberSpark motif
`sections/EmberSpark.tsx` — a hand-authored glowing ember in three variants:
`spark` (compact mark: concentric warm core + eight uneven radiating
filaments), `bloom` (six flame petals around the core, card icon) and `trail`
(a rising ember with a fading mote trail, hero ornament). All paint flows
through `var(--color-cw-accent, var(--color-cw-terracotta, currentColor))`
fallback chains; gradient ids are namespaced `ember-sp-*`. ORIGINAL artwork —
deliberately no heart mark, no copied assets, no trademark-adjacent shapes.
`EmberDivider` = hairline + three sparks.

## Why palette-adaptive
Ember uses the shared `cw-*` atoms + `applyPaletteAsTheme`, so the active
palette maps onto the chrome (sol-*), the atoms, the SVG motifs AND the hero
mesh (all mesh colors are token mixes). Set a `themeJson` palette and the
whole glow re-tones to your brand.

## Voice
Every copy slot follows the `settings ?? genome ?? default` chain — apply any
Voice preset (or the admin/genome editors) and Ember speaks your words; the
shipped defaults tell the warm-builder story in English.
