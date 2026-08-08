---
schema: cartwright-design-v1
slug: brutalist
name: Brutalist (raw / mono)
description: >-
  Premium neo-brutalist design — paper-white canvas, hard black ink + thick
  black borders, one acid-lime accent. Monospace labels + bold grotesque
  headlines, hard drop-shadows, visible grid, offset slabs, marquee. Locked
  light theme. CSS-only, no 3D.
mode: website
premium: true
tokens:
  prefix: bru
  palette:
    accent: "#c8ff00"
    accentDeep: "#9bcb00"
    cream: "#f5f3ec"
    sand: "#fffdf6"
    ink: "#0a0a0a"
    muted: "#5a5a52"
  fonts:
    sans: "Space Grotesk, system-ui, sans-serif"
    mono: "Space Mono, ui-monospace, monospace"
---

# Brutalist — design spec

Premium **neo-brutalist agency** design, built as real code (not the governed
section-builder) for full design freedom. Brand voice: VOLTAGE — a studio for
brands that refuse to be wallpaper.

## Aesthetic
- **Direction:** "raw / mono" — stark, high-contrast, confident, legible.
- **Palette (locked light, no OS dark-mode flip):**
  - canvas `#f5f3ec` (warm paper), raised `#fffdf6` (near-white)
  - text + borders: hard black `#0a0a0a`
  - one accent: acid lime `#c8ff00` (deep `#9bcb00`); safety-orange `#ff3d00` spark used sparingly (focus rings).
- **Type:** Archivo (display, uppercase) · Space Grotesk (body) · Space Mono (labels), via `next/font`.
- **Signatures:** THICK 3px black borders, hard (no-blur) drop-shadows, zero rounded corners, oversized type, visible background grid, an offset acid slab behind the hero, an inverted black/lime marquee, outline + highlight headline treatment.

## Features
- CSS-only visuals + motion — **no three.js / no 3D**.
- Bento features grid with `:has()` sibling-dim hover and hard shadow-lift.
- Numbered process cards, big stats strip (alternating acid cells), block pull-quote, inverted black CTA with acid hard-shadow, multi-column mono footer.
- Fluid `clamp()` typography/spacing, staggered load-reveal, scroll-driven reveals
  (`@supports (animation-timeline: view())` — content visible by default).
- Full a11y: `:focus-visible` (safety-orange ring), reduced-motion respect, semantic landmarks.

## Implementation
- `homepage.tsx` — server-rendered homepage (LCP-friendly), full-bleed.
- `brutalist.css` — all styles, scoped under `.bru`, `@layer`-organised, locked theme.

## Mode
`website` (agency / marketing). Chrome: `light`.
