---
schema: cartwright-design-v1
slug: fable
name: Fable (flagship · metamorphosis)
description: >-
  The website-mode flagship — an airy ivory story page where an instanced
  flock of 3D butterflies flutters behind a serif display hero, a
  scroll-cinema metamorphosis timeline (caterpillar → chrysalis → imago), a
  stat band, a safeguards story and a CTA. Palette-adaptive: the whole flock
  and every section re-tone to your brand.
mode: website
premium: true
tokens:
  prefix: cw
  palette:
    accent: "#4e4af2"
    accentDeep: "#2f2bb8"
    cream: "#faf7f0"
    sand: "#f0ebdf"
    ink: "#23201c"
    muted: "#7d776c"
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
---

# Fable — design spec

**Fable** is the website-mode flagship: a story page built around metamorphosis.
It was made to celebrate a launch (Claude Fable 5, June 9 2026) and shows what a
Cartwright site can do when the brief is "make them stop scrolling": a living
butterfly flock in 3D, a scroll-driven transformation narrative, and editorial
calm everywhere else.

## The page
1. **Butterfly hero** (`FableHero`) — a full-viewport ivory hero with the
   `butterflies` Live-Canvas scene (an instanced, palette-tinted flock that
   flaps, glides and scatters from the pointer) behind a Fraunces serif display
   headline. A layered SVG + gradient composition is always painted underneath,
   so no-WebGL / reduced-data visitors get a beautiful static hero.
2. **Metamorphosis scroll-cinema** (`FableMetamorphosis`) — a sticky SVG stage
   crossfades caterpillar → chrysalis → butterfly as three story frames scroll
   by (native `animation-timeline: view()`, no JS, reduced-motion safe).
3. **Stat band** (`StudioStatBand`) — four launch numbers.
4. **Safeguards story** (`FableSafeguards`) — capability held gently: the
   fallback-model story told as editorial copy + three calm cards, with a
   chrysalis motif.
5. **Pricing band** (`StudioPricingTable`) — three access tiers.
6. **CTA footer** (`StudioCtaFooter`) — the closing call to action.

## The butterflies scene
`lib/three/scenes/butterflies.ts` — one `InstancedMesh` (≈70–220 instances by
intensity), procedural wing geometry, all motion in the vertex shader
(analytic Lissajous drift + simplex wobble, alternating flap/glide), wings
drawn procedurally in the fragment shader (two-lobe SDF, accent→accentDeep
gradient, cream shimmer mid-flap, ink edges). Pointer parallax + soft scatter;
scroll drifts the flock upward. Reduced motion freezes a scattered mid-pose
composition. Registered as the `butterflies` scene — usable from ANY design or
the `heroAurora` builder Part.

## Why palette-adaptive
Fable uses the shared `cw-*` atoms + `applyPaletteAsTheme`, so the active
palette maps onto both the chrome (sol-*) and the atoms, the SVG motifs AND the
3D flock (scenes read the injected palette at runtime). Set a `themeJson`
palette and the butterflies fly in your brand colours.

## Voice
Ships with a matching `fable` Voice preset (verticals/fable) carrying the
launch-announcement copy — apply it for the full Skin × Voice composition, or
write your own story; every copy slot follows the
`settings ?? genome ?? default` chain.
