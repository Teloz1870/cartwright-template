---
schema: cartwright-design-v1
slug: stillwater
name: Stillwater (calm enterprise)
description: >-
  A calm-enterprise website design — from constant noise to quiet confidence.
  Fully generative landscapes (zero photos): layered SVG ridgelines with
  atmospheric perspective, mist and still water walk dawn → day → dusk →
  night behind huge Fraunces type, with the calm waves scene in the hero,
  oversized proof metrics, a star-lit night timeline and quiet testimonials.
  Palette-adaptive: the whole landscape re-tones to your brand.
mode: website
premium: true
tokens:
  prefix: cw
  palette:
    accent: "#3d6b6b"
    accentDeep: "#27494c"
    cream: "#f7f7f4"
    sand: "#e8e6df"
    ink: "#1c2321"
    muted: "#7c8482"
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
---

# Stillwater — design spec

**Stillwater** is the calm-enterprise design: serene nature, huge whitespace,
quiet authority. Its promise — *from constant noise to quiet confidence* — is
told visually by one signature, fully **generative** landscape (zero photos):
hand-authored SVG mountain ridgelines that walk through a whole day while the
page scrolls, dawn to star-lit night.

## The signature backdrop — `StillwaterScape`

`sections/StillwaterScape.tsx` is the reusable scene: five layered ridgelines
(sharp far peaks → soft foothills) with **atmospheric perspective** via a
per-variant opacity ramp, horizontal **mist bands** across the ridge
boundaries, a **sun/moon disc** with a soft glow that sets behind the peaks,
and a **calm water band** with hairline ripples and the disc's reflection.
Four variants share one geometry: `dawn`, `day` (light — ink copy), `dusk`,
`night` (dark — cream copy). All paint reads the cw-* token fallback chains
(design token → engine token → currentColor), so the whole landscape re-tones
to any palette via `applyPaletteAsTheme`. Gradient ids are stable and
namespaced per variant — duplicate instances resolve to identical paint.

## The page

1. **Hero** (`StillwaterHero`) — full-viewport: Scape(dawn) always painted
   underneath (LCP-safe, no-WebGL view), the `waves` Live-Canvas scene at
   intensity 0.5 mask-faded across the lower third as calm water, and a huge
   Fraunces display headline (*"From constant noise to quiet confidence."*)
   with a mono eyebrow, tagline and dual CTA.
2. **Metrics** (`StillwaterMetrics`) — three oversized Fraunces stats under
   hairline rules, mono labels. Quiet authority through numbers.
3. **Panels** (`StillwaterPanels`) — four alternating full-bleed feature
   panels, each on a different Scape hour (dawn → day → dusk → night), with a
   mono kicker + title + body and a soft scrim behind the copy. Maps
   `genome?.featuresItems` like FABLE.
4. **Night** (`StillwaterNight`) — "While you rest": an ink panel with
   CSS-twinkle stars (opacity-only, reduced-motion-guarded) over a mono
   incident timeline (02:47:12-style rows) — the platform handling a night
   incident while everyone sleeps.
5. **Testimonials** (`StillwaterTestimonials`) — three quiet quotes with
   generative SVG initials-avatars.
6. **CTA footer** (`StudioCtaFooter`, reused) — pinned light via the
   `sw-locked-light` dark:-pin wrapper (the FABLE pattern).

## Chrome

Stillwater owns its frame (`chrome.tsx`, wired via `siteChrome`): a hairline
sticky header with the three-ridge **StillwaterMark** + `brand.storeName` in
Fraunces, nav (Platform → `#panels`, Proof → `#metrics`, Contact) and a pill
CTA; a footer with the **ridge-divider** rule and an English © line.

## Why palette-adaptive

Stillwater uses the shared `cw-*` tokens + `applyPaletteAsTheme`, so the
active palette maps onto the chrome (sol-*), the atoms AND every ridge, mist
band, star, ripple and avatar (token fallback chains in the raw SVG). Set a
`themeJson` palette and the mountains rise in your brand's colours. The
default palette is deep lake-teal on warm paper: #3d6b6b / #27494c on #f7f7f4.

## Voice

Calm, declarative, unhurried — short sentences, no exclamation marks. Every
copy slot follows the `settings ?? genome ?? default` chain, so a Voice preset
or admin override re-words the page without touching code.
