---
schema: cartwright-design-v1
slug: aerospace
name: Aerospace (cinematic deep-tech)
description: >-
  Premium cinematic aerospace / mission-control design — a near-black space
  canvas, one ice-blue accent, and a dry technical voice. CSS starfield hero with
  a perspective horizon grid + glow, condensed uppercase headlines, monospace
  telemetry chips, vehicle/system spec cards, a stat band, a countdown
  mission-sequence timeline, and a quiet horizon CTA. Locked dark theme (no OS
  light-mode flip). No 3D — pure CSS visuals + motion.
mode: website
premium: true
tokens:
  prefix: aero
  palette:
    accent: "#4d9fff"
    accentDeep: "#1b3a8f"
    cream: "#080b12"
    sand: "#141b28"
    ink: "#eef3fb"
    muted: "#8a97ad"
  fonts:
    sans: "Inter, system-ui, sans-serif"
    mono: "JetBrains Mono, ui-monospace, monospace"
---

# Aerospace — design spec

Premium **cinematic aerospace / mission-control deep-tech** design, built as real
code (not the governed section-builder) for full design freedom. Reads like the
landing page of a well-funded launch company — restrained, expensive, technical.
Names and copy EVOKE the aesthetic with an original fictional program
("ASTRADYNE") — no real brand, logo, trademark, or product name appears.

## Aesthetic
- **Direction:** "mission control" — near-black space canvas, cold precision, a
  single confident ice-blue accent, dry telemetry voice.
- **Palette (locked dark, no OS light-mode flip):**
  - canvas `#080b12` (near-black space), raised panel `#0e1420`, inset `#141b28`
  - text: cold white `#eef3fb`, headings `#f7faff`, secondary grey-blue `#8a97ad`,
    telemetry-dim `#5a6781`
  - one accent: ice blue `#4d9fff` (lifted `#7fb9ff`); deep navy `#1b3a8f` for
    depth + horizon glow; green `#5fe3a1` for "nominal" status only
- **Type:** Oswald (condensed uppercase display) · Inter (body) · JetBrains Mono
  (telemetry labels), via `next/font`.

## Features
- **No 3D.** Tasteful **CSS starfield** hero (layered radial-gradient dot fields
  with a twinkle keyframe), a **faint perspective horizon grid** fading up, an
  **ice-blue horizon glow**, and a subtle **scanline** overlay.
- Glassmorphism sticky nav (`backdrop-filter`) with a live "RANGE GREEN" status,
  a vehicle/systems fleet grid with `:has()` hover (non-hovered siblings dim) and
  monospace spec rows, a stat band over a horizon glow, a numbered countdown
  **mission-sequence timeline** (T‑3 → liftoff → MECO), an engineering pull-quote,
  and a quiet full-width **horizon-glow CTA**.
- **Signature detail:** monospace telemetry chips (`T‑00:09:58 · ALL SYSTEMS
  NOMINAL`, `PAYLOAD · READY`, lat/long coordinates), a **blinking status dot**, a
  hero telemetry readout strip (VEL / ALT / MAX‑Q bars), thin ice-blue hairlines.
- Sharp panels with gradient fills + ice top-hairlines + layered cool shadows;
  precise grids that collapse cleanly.
- Fluid `clamp()` typography/spacing, staggered load-reveal, scroll-driven
  reveals (`@supports (animation-timeline: view())` — content visible by default).
- Full a11y: `:focus-visible` rings, `prefers-reduced-motion` respect (starfield
  twinkle + blink + reveals disabled), semantic landmarks, `color-scheme: dark`
  so form controls match.

## Implementation
- `homepage.tsx` — server-rendered homepage (LCP-friendly), full-bleed fixed overlay.
- `aero.css` — all styles, scoped under `.aero`, `@layer`-organised, locked dark theme.

## Mode
`website` (deep-tech / aerospace marketing). Chrome: `dark`.
