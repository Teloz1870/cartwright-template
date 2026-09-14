---
schema: cartwright-design-v1
slug: halo
name: Halo (minimal product luxury)
description: >-
  Premium ultra-minimal product-luxury storefront — a light-grey canvas,
  oversized tight-tracked headlines, and the signature alternating full-bleed
  light / near-black panels. A pure-CSS hero 'device' with a metallic conic
  sheen + soft ambient shadows, one restrained product-blue accent, a tidy spec
  grid, and a centered "Get yours" CTA. Locked light theme (no OS dark-mode
  flip). No 3D — pure CSS visuals.
mode: webshop
premium: true
tokens:
  prefix: halo
  palette:
    accent: "#0a84ff"
    accentDeep: "#0050a0"
    cream: "#f5f5f7"
    sand: "#d2d2d7"
    ink: "#1d1d1f"
    muted: "#6e6e73"
  fonts:
    sans: "Manrope, system-ui, sans-serif"
    mono: "ui-monospace, monospace"
---

# Halo — design spec

Premium **ultra-minimal product luxury** design, built as real code (not the
governed section-builder) for full design freedom. Reads like a flagship
single-product launch page — pure, generous whitespace, oversized type,
product-first, soft depth. The type and the whitespace carry the page; colour is
deliberately restrained. (Original name + copy — evokes the aesthetic without
naming any real brand.)

## Aesthetic
- **Direction:** "less, but better" — pure, calm, premium; product is the hero.
- **Palette (locked light, no OS dark-mode flip):**
  - canvas `#f5f5f7` (light grey), surface `#ffffff`, near-black panel `#101012`
  - text: near-black `#1d1d1f`, secondary grey `#6e6e73`, hairline `#d2d2d7`
  - one accent: product blue `#0a84ff`; deep `#0050a0` for pressed / depth
- **Type:** Manrope (tight, heavy display) · Inter (body), via `next/font`.

## Features
- **No 3D.** A pure-CSS "product" object in the hero — an abstract device with
  a metallic **conic-gradient sheen**, soft layered ambient shadows, an accent
  halo glow, and a dark edge-to-edge "screen".
- The signature **alternating full-bleed panels**: three near-full-viewport
  blocks alternating light / near-black, each with a huge centered headline, one
  short line, and a per-panel CSS visual (brushed ingot, dark glass, charged
  blob).
- A tidy **spec grid** (hairline-separated label/value cells) and a centered
  closing **CTA** ("Get yours" + financing line).
- **Fine detail:** oversized headings with tight `-0.05em` tracking, hairline
  dividers, pill buttons, "Learn more ›" text links, perfect centering, soft
  ambient shadows, the occasional near-black panel for drama.
- Glassmorphism sticky nav (`backdrop-filter`), fluid `clamp()` typography /
  spacing, staggered load-reveal, scroll-driven reveals
  (`@supports (animation-timeline: view())` — content visible by default).
- Full a11y: `:focus-visible` rings, `prefers-reduced-motion` respect, semantic
  landmarks, `color-scheme: light` so form controls match.

## Implementation
- `homepage.tsx` — server-rendered homepage (LCP-friendly), full-bleed fixed overlay.
- `halo.css` — all styles, scoped under `.halo`, `@layer`-organised, locked light theme.

## Mode
`webshop` (single-product / flagship storefront). Chrome: `light`.
