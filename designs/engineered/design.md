# Engineered — design spec

Premium **dark-luxe agency** design, built as real code (not the governed
section-builder) for full design freedom.

## Aesthetic
- **Direction:** "engineered editorial" — confident, technical, premium.
- **Palette (locked dark, no OS dark-mode flip):**
  - canvas `#090d11` (deep navy-black), raised `#0d141a`, card `#121b23`
  - text: warm cream `#f4efe6`
  - one accent: mint-teal `#5fe6c4`; navy `#1e3f5a` + amber `#e8a06a` in the mesh
- **Type:** Bricolage Grotesque (display) · Hanken Grotesk (body) · JetBrains Mono (labels), via `next/font`.

## Features
- Real **three.js GLSL hero** (Ashima simplex + fbm aurora ribbons, mouse-reactive),
  layered over a CSS-aurora fallback; graceful WebGL-less + `prefers-reduced-motion` degradation.
- Glassmorphism nav (`backdrop-filter`), bento services grid with `:has()` hover,
  numbered process, editorial pull-quote, gradient-mesh CTA, multi-column footer.
- Fluid `clamp()` typography/spacing, staggered load-reveal, scroll-driven reveals
  (`@supports (animation-timeline: view())` — content visible by default).
- Full a11y: `:focus-visible`, reduced-motion respect, semantic landmarks.

## Implementation
- `homepage.tsx` — server-rendered homepage (LCP-friendly), full-bleed.
- `HeroCanvas.tsx` — client three.js component (raw `three`).
- `engineered.css` — all styles, scoped under `.studio`, `@layer`-organised, locked theme.

## Mode
`website` (agency / marketing). Chrome: `dark`.
