---
schema: cartwright-design-v1
slug: meridian
name: Meridian (crisp modern SaaS)
description: >-
  Premium crisp-modern light SaaS design — cool near-white + slate neutrals with
  one confident electric-blue accent. CSS gradient-mesh hero, sharp bordered
  cards + soft shadows, precise grid, mono labels, keyboard-hint chips. Locked
  light theme (no OS dark-mode flip). No 3D — pure CSS motion.
mode: website
premium: true
tokens:
  prefix: mer
  palette:
    accent: "#2563ff"
    accentDeep: "#143a9c"
    cream: "#f7f9fc"
    sand: "#e6ebf3"
    ink: "#0c1322"
    muted: "#5b6577"
  fonts:
    sans: "Plus Jakarta Sans, system-ui, sans-serif"
    mono: "Space Mono, ui-monospace, monospace"
---

# Meridian — design spec

Premium **crisp modern light SaaS** design, built as real code (not the governed
section-builder) for full design freedom. Reads like a well-funded modern
dev-tool / SaaS marketing site — precise, confident, never generic.

## Aesthetic
- **Direction:** "engineered clarity" — cool, precise, premium-light.
- **Palette (locked light, no OS dark-mode flip):**
  - canvas `#f7f9fc` (cool near-white), surface `#ffffff`, inset `#f1f4f9`
  - text: deep slate `#0c1322`, headings `#1b2536`, secondary slate `#5b6577`
  - one accent: electric blue `#2563ff`; deep blue `#143a9c` + cyan-teal `#06b6d4` in the mesh
- **Type:** Sora (display) · Plus Jakarta Sans (body) · Space Mono (labels), via `next/font`.

## Features
- **No 3D.** Tasteful **CSS gradient-mesh** hero wash (animated, blurred radial
  gradients) over a **fine dot-grid** overlay masked to the fold.
- Glassmorphism sticky nav (`backdrop-filter`), bento features grid with `:has()`
  hover (non-hovered siblings dim), stat band, numbered process cards, an
  editorial pull-quote, a saturated gradient-mesh CTA, multi-column footer.
- **Fine detail:** keyboard-hint chips (`⌘ K`), a pulsing status dot, a
  macOS-style "deploy" terminal card in the hero, mono micro-labels and tags.
- Sharp bordered cards with subtle hairlines + layered soft shadows; precise
  6-column grid that collapses cleanly.
- Fluid `clamp()` typography/spacing, staggered load-reveal, scroll-driven
  reveals (`@supports (animation-timeline: view())` — content visible by default).
- Full a11y: `:focus-visible` rings, `prefers-reduced-motion` respect, semantic
  landmarks, `color-scheme: light` so form controls match.

## Implementation
- `homepage.tsx` — server-rendered homepage (LCP-friendly), full-bleed fixed overlay.
- `meridian.css` — all styles, scoped under `.mer`, `@layer`-organised, locked light theme.

## Mode
`website` (SaaS / product marketing). Chrome: `light`.
