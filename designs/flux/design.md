---
schema: cartwright-design-v1
slug: flux
name: Flux (vibrant gradient SaaS)
description: >-
  Premium developer-first payments/infra SaaS design — white canvas, deep-navy
  text, one vivid indigo accent. Signature bold animated multi-hue gradient mesh
  (indigo → violet → cyan → teal) with an angled clip, crisp white hairline
  cards, and syntax-tinted mono code cards. Rounded pills, gradient stat band,
  saturated gradient CTA. Locked light theme (no OS dark-mode flip). No 3D —
  pure CSS visuals + motion.
mode: website
premium: true
tokens:
  prefix: flux
  palette:
    accent: "#635bff"
    accentDeep: "#4b45c6"
    cream: "#ffffff"
    sand: "#e3e8ee"
    ink: "#0a2540"
    muted: "#425466"
  fonts:
    sans: "Inter, system-ui, sans-serif"
    mono: "JetBrains Mono, ui-monospace, monospace"
---

# Flux — design spec

Premium **vibrant developer-first payments / infra SaaS** design, built as real
code (not the governed section-builder) for full design freedom. Reads like a
well-funded modern payments / developer-infrastructure marketing site — light,
crisp, confident, and unmistakably gradient-forward.

## Aesthetic
- **Direction:** "developer-first money movement" — white canvas, bold colour,
  precise code.
- **Palette (locked light, no OS dark-mode flip):**
  - canvas `#ffffff` (white), surface `#ffffff`, inset `#f6f9fc`
  - text: deep navy `#0a2540` (headings + body ink), secondary slate `#425466`
  - one accent: vivid indigo `#635bff`; deeper indigo `#4b45c6` for borders/depth
  - gradient hues: violet `#a35bff`, cyan `#00d4ff`, teal `#00d9b2`
- **Type:** Sora (display) · Inter (body) · JetBrains Mono (code), via `next/font`.

## Features
- **No 3D.** The signature is a **bold animated gradient-mesh band** layered from
  a `conic-gradient` (indigo → violet → cyan → teal) plus a blurred radial halo
  drifting out of phase — clipped with an **angled `clip-path` sweep** along the
  bottom edge, with a fine grain overlay so it reads premium, not flat. A slow
  `@keyframes` drift animates the background-position.
- Glassmorphism sticky nav (`backdrop-filter`), a crisp white **code card** in
  the hero with a tab bar and **syntax-tinted mono spans** (keywords, strings,
  numbers, props, comments), a 4-column **feature grid** of white hairline cards
  with small accent icons and a gradient top-border on hover, a dark-navy
  **stat band** with gradient numbers, a **"for developers" split** with a second
  code card + a checklist, an editorial gradient pull-quote, and a saturated
  **gradient CTA** footer.
- **Fine detail:** rounded pill buttons + a glass status pill, a pulsing status
  dot, mono micro-tags, macOS-style window dots on code cards.
- Sharp bordered cards with subtle hairlines + layered soft shadows.
- Fluid `clamp()` typography/spacing, staggered load-reveal, scroll-driven
  reveals (`@supports (animation-timeline: view())` — content visible by default).
- `:has()` hover focus (non-hovered feature cards dim).
- Full a11y: `:focus-visible` rings, `prefers-reduced-motion` respect, semantic
  landmarks, `color-scheme: light` so form controls match.

## Implementation
- `homepage.tsx` — server-rendered homepage (LCP-friendly), full-bleed fixed overlay.
- `flux.css` — all styles, scoped under `.flux`, `@layer`-organised, locked light theme.

## Mode
`website` (SaaS / developer-infra product marketing). Chrome: `light`.
