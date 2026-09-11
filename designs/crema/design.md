# Crema — cinematic dark-roast storefront (cartwright-design-v1)

Premium webshop DesignPack for specialty coffee roasters (and any photography-led
small-catalogue brand). Where `northern-coffee` is a quiet Scandinavian zine,
**crema** is the espresso bar after dark: a locked dark-roast theme, a full-bleed
video hero, copper accents, and a product rail that makes three bags feel like a
collection.

## Identity

- **Mode**: webshop · **Chrome**: dark (shared store chrome follows via the
  `chrome` hint + palette adaption — cart, search and locale switching keep
  working untouched)
- **Palette (locked, no OS dark-mode flip)**: espresso base `#16100b`, panel
  roast `#211711`, foam text `#f4ead9`, copper accent `#cf7a3c`, taupe muted
  `#a08b74`. Site-wide via two cooperating mechanisms: `applyPaletteAsTheme`
  remaps the sol-*/cw-* tokens at `:root` (every default body — PLP, cart,
  checkout, account, info pages — self-darkens), and the `CremaShell`
  (`siteChrome.Shell`) wraps every page in the `.crema-site` scope: pack fonts,
  scoped sol pins that beat any stray DB themeJson, `color-scheme: dark`, and
  compensation for hardcoded light utilities (`.bg-white` panels, light-canvas
  green/red).
- **Type**: Fraunces (display, soft serif with optical sizing — loaded via
  next/font inside the pack) over Instrument Sans (UI, via the token bridge).
- **Motion**: CSS-only. Staggered load reveal in the hero; scroll-driven section
  reveals behind `@supports (animation-timeline: view())`; everything visible by
  default and inert under `prefers-reduced-motion: reduce`.

## Sections

1. **Hero** — full-bleed looping `<video>` (`/hero/hero-v1.mp4`, poster from
   `settings.heroImage`) under a roast-gradient veil; kicker, display headline
   (`settings.websiteHeadline` override → localized default), tagline, two CTAs,
   and a meta-line computed from real brand policy (free-shipping threshold).
2. **The bar** — up to four featured products as large dark cards: image, serif
   name, clamped description, engine `<Price>`, decorative roast-level dots.
3. **The week** — three numbered process steps (roast → rest → ship) with
   oversized outlined numerals.
4. **Brew calculator** — client island, pure math: cups × ratio (1:15/16/17)
   → grams of coffee and water.
5. **Shelves** — categories as typographic tiles with copper indexes.
6. **Agent-ready strip** — gated on `agentApiEnabled`: live agent-readiness
   score (is-agentic.com, fail-soft) + llms.txt link.
7. **The letter** — cream-inverted newsletter band posting to the engine's
   `/api/newsletter/subscribe`.

## i18n

Every string flows through the `Crema` message namespace (da + en ship with the
engine). No hardcoded copy, no locale-less links — lessons from the
northern-coffee retrofit (#458/#459) are built in from birth.
