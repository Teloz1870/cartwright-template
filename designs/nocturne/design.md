---
schema: cartwright-design-v1
slug: nocturne
name: Nocturne (dark organic, 3D)
description: >-
  Premium dark-organic luxe design — midnight aubergine canvas + warm champagne
  gold + soft cream. Palette-driven 3D aurora hero, italic Fraunces display,
  organic rounded shapes, soft glows, bento layout. Locked dark theme.
mode: website
premium: true
tokens:
  prefix: noc
  palette:
    accent: "#e9c789"
    accentDeep: "#c79a52"
    cream: "#f3ebe1"
    sand: "#1e1525"
    ink: "#160f1c"
    muted: "#9a8aa0"
  fonts:
    sans: "Manrope, system-ui, sans-serif"
    mono: "Fraunces, Georgia, serif"
---

# Nocturne — design spec

Premium **dark ORGANIC luxe** design, built as real code (not the governed
section-builder) for full design freedom. The register is a high-end maison —
spirits, fragrance, an architecture studio — calm, sophisticated, patient.

## Aesthetic
- **Direction:** "nocturnal atelier" — flowing, rounded, organic; soft glows;
  nothing shouts.
- **Palette (locked dark, no OS dark-mode flip):**
  - canvas `#160f1c` (midnight aubergine), raised `#1e1525` (deep plum), card `#271a30`
  - text: soft warm cream `#f3ebe1`
  - one accent: champagne gold `#e9c789` (+ deeper gold `#c79a52`); muted plum
    `#4a2c52` + dusty rose `#b8657a` only in the mesh
- **Type:** Fraunces (italic editorial serif display) · Manrope (clean grotesque body), via `next/font`.

## Features
- The shared **palette-driven 3D aurora hero** (`DesignHero` → `ThreeHero scene="aurora"`),
  layered over a CSS-aurora fallback; inherits WebGL2 / `prefers-reduced-motion` /
  saveData gating and renders nothing when unsupported (CSS aurora remains visible).
- Glassmorphism nav (`backdrop-filter`), organic bento grid with `:has()` hover,
  a gradient-mesh stats band, numbered process cards, editorial pull-quote,
  blob-glow gradient CTA, multi-column footer. Organic radii (incl. a `border-radius`
  blob token) throughout.
- Fluid `clamp()` typography/spacing, staggered load-reveal, scroll-driven reveals
  (`@supports (animation-timeline: view())` — content visible by default).
- Full a11y: `:focus-visible`, reduced-motion respect, semantic landmarks.

## Implementation
- `homepage.tsx` — server-rendered homepage (LCP-friendly), full-bleed; `DesignHero` behind the hero.
- `nocturne.css` — all styles, scoped under `.noc`, `@layer`-organised, locked theme.

## Mode
`website` (maison / marketing). Chrome: `dark`.
