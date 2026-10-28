---
schema: cartwright-design-v1
slug: drive
name: Drive (full-bleed automotive)
description: >-
  Premium full-bleed automotive design — silent-luxury EV product showcase. A
  vertical stack of full-viewport panels, each a CSS-only atmospheric backdrop
  (dusk, open road, dark studio, solar sky) with a centered top headline and two
  bottom-anchored pill CTAs. Ultra-minimal, confident, almost no body copy.
  Montserrat throughout. Locked light theme (no OS dark-mode flip). No 3D, no
  photos — pure CSS gradients, vignettes, horizon, car silhouette.
mode: website
premium: true
tokens:
  prefix: drv
  palette:
    accent: "#171a20"
    accentDeep: "#000000"
    cream: "#ffffff"
    sand: "#e2e3e5"
    ink: "#171a20"
    muted: "#5c5e62"
  fonts:
    sans: "Montserrat, system-ui, sans-serif"
    mono: "ui-monospace, monospace"
---

# Drive — design spec

Premium **full-bleed automotive / silent-luxury product** design, built as real
code (not the governed section-builder) for full design freedom. Reads like a
modern electric-vehicle manufacturer's homepage — the confident, photographic,
near-wordless product showcase: stacked full-viewport panels, centered top
headlines, bottom-anchored CTAs, quiet luxury throughout. Original brand
("Voltéra") and copy — no real marque, model, or slogan is used.

## Aesthetic
- **Direction:** "silent luxury" — minimal, photographic, confident, calm.
- **Palette (locked, no OS dark-mode flip):**
  - white canvas `#ffffff`, near-black chrome `#171a20`, pure-black depth `#000000`
  - text: near-black `#171a20`, secondary grey `#5c5e62`, silver mist `#e2e3e5`
  - scenery accents are CSS-only "photography": dusk rose/amber, open-road sky-blue,
    dark-studio charcoal + a blue autonomy-sensor sweep, solar gold.
- **Type:** Montserrat (Gotham-like geometric sans) for display + body, via `next/font`.

## Structure
- A vertical **stack of 4 full-viewport panels** (`min-block-size: 100svh`):
  1. **Model One** — dusk gradient + CSS car silhouette on a dark ground.
  2. **Range Without Limits** — open-road sky, a perspective asphalt road with a
     dashed centre-line narrowing to a vanishing point.
  3. **Autonomy, Standard** — dark studio stage, spotlight cone, car silhouette,
     a slow blue sensor-sweep arc (the only ambient motion).
  4. **Energy for Everything** — solar sky with sun-rays + a perspective solar-tile roof.
- Each panel: tiny eyebrow + a big centered headline + a one-line subline near the
  **top**; two **bottom-anchored pill CTAs** ("Order Now" solid, second translucent)
  with a small footnote beneath. Almost no body copy.

## Features
- **No 3D, no photos.** Every backdrop is pure CSS: layered radial/linear/conic
  gradients, `clip-path` road + roof planes, a `perspective()` tile grid, a
  masked `conic-gradient` sensor arc, and a car silhouette built from stacked
  rounded gradients + pseudo-element wheels. A shared soft vignette anchors text.
- **Per-panel text colour is explicit** (`--panel-text` light or dark) — never
  driven by `prefers-color-scheme`. The translucent ghost CTA flips light/dark
  per panel tone. `color-scheme: light` so any form controls match.
- Slim sticky nav with a centered letter-spaced wordmark and sparse side links
  (collapses to a hamburger on mobile); a very small dark footer.
- Fluid `clamp()` typography/spacing, in-view copy reveal (`@supports
  (animation-timeline: view())` — content visible by default), `:focus-visible`
  rings, full `prefers-reduced-motion` respect (sensor sweep + reveals disabled).
- All selectors scoped under `.drv`, `@layer`-organised (base / scenery /
  components / utilities) so nothing leaks to global.

## Implementation
- `homepage.tsx` — server-rendered homepage (LCP-friendly), full-bleed fixed overlay.
- `drv.css` — all styles, scoped under `.drv`, `@layer`-organised, locked theme.

## Mode
`website` (automotive / product marketing). Chrome: `light`.
