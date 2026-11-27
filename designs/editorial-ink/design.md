---
schema: cartwright-design-v1
slug: editorial-ink
name: Editorial Ink (magazine / publication)
description: >-
  Premium light editorial design — warm paper canvas, deep ink, a single
  restrained oxblood accent. Characterful Fraunces serif + Hanken Grotesk body +
  Space Mono eyebrow, hairline rules, drop-cap lede, big pull-quote. Locked
  light theme. No 3D.
mode: website
premium: true
tokens:
  prefix: edi
  palette:
    accent: "#7c2230"
    accentDeep: "#511620"
    cream: "#f6f1e7"
    sand: "#c9bca2"
    ink: "#1c1916"
    muted: "#6b6356"
  fonts:
    sans: Hanken Grotesk, system-ui, sans-serif
    mono: Space Mono, ui-monospace, monospace
---

# Editorial Ink — design spec

A premium **light editorial / magazine** design, built as real code (not the
governed section-builder) for full design freedom. Think a high-end print
quarterly or a serious essay site — words that earn the page.

## Aesthetic
- **Direction:** "editorial ink" — considered, literary, print-confident.
- **Palette (locked light, no OS dark-mode flip):**
  - paper `#f6f1e7` (warm off-white canvas), raised `#efe8d9`, lifted card `#faf6ee`
  - text: deep ink `#1c1916`
  - one accent: oxblood `#7c2230` (deepens to `#511620`); muted sand `#c9bca2` for rules
- **Type:** Fraunces (characterful serif display, optical sizing + italics) ·
  Hanken Grotesk (clean grotesque body) · Space Mono (eyebrow / byline / issue labels),
  via `next/font`.

## Features
- **No 3D.** All motion and texture is CSS-only and tasteful: a faint multiply
  paper grain, animated `\00A7`-delimited standfirst marquee (pauses on hover).
- Sticky glass masthead nav (`backdrop-filter`), broadsheet masthead rule,
  **drop-cap lede** (`::first-letter`), asymmetric two-column hero, a mono
  byline strip, numbered feature columns with hairline rules, a bordered stats
  **ledger**, an oversized **pull-quote** (`::before` quotation mark), and an
  inverted ink CTA block.
- Fluid `clamp()` typography/spacing, staggered load-reveal, scroll-driven
  reveals (`@supports (animation-timeline: view())` — content visible by default).
- Full a11y: `:focus-visible`, `prefers-reduced-motion` guard, semantic landmarks.

## Implementation
- `homepage.tsx` — server-rendered homepage (LCP-friendly), full-bleed fixed overlay.
- `editorial-ink.css` — all styles, scoped under `.edi`, `@layer`-organised, locked
  light theme (explicit tokens, `color-mix`, `clamp`).

## Mode
`website` (publication / marketing). Chrome: `light`.
