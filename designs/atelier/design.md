---
schema: cartwright-design-v1
slug: atelier
name: Atelier
description: Museum-minimal luxury layout for fashion, jewelry, and leather goods. Monochrome with gold accent, ALL-CAPS sparse typography, full-bleed product photography. Curated catalogs only — feels like a quiet boutique.
mode: webshop
premium: true

tokens:
  prefix: at
  palette:
    accent: "#9b7837"            # gold — meta + price ornament
    accentDeep: "#7a5a2d"        # bronze — hover state
    cream: "#f6f3ee"             # bone paper — page bg
    sand: "#ebe6dd"              # elevated surface
    ink: "#0a0a0a"               # near-black body text
    muted: "#6b6b6b"             # mid-gray meta
  extraTokens:
    color-at-stone: "#c4bdb0"
    color-at-line: "rgba(10, 10, 10, 0.1)"
    color-at-overlay: "rgba(10, 10, 10, 0.5)"
    color-at-noir: "#1c1815"
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, monospace"

sections:
  - type: opaque
    component: AtelierHomepage
    # Custom layout — full-bleed hero med tiny brand-mark + centered
    # product-line, all-caps sparse navigation, single-row featured
    # collection. Kan ikke compose'es fra generic atoms.
---

# Atelier

Cartwright Studio premium design #2. Built for high-end fashion,
jewelry, leather goods, and any brand whose product photography is
their primary marketing tool.

## Visual language

- **Museum-minimal.** Page is mostly white-space. Product images carry
  the design — typography is just a frame.
- **ALL-CAPS sparse typography.** Wide letter-spacing (0.2em+), small
  font-sizes, generous line-height. Navigation feels like an exhibition
  catalog table-of-contents.
- **Monochrome with gold accent.** Bone-paper bg, near-black ink, single
  gold accent (#9b7837) for prices and small ornaments. No second color.
- **Full-bleed hero.** One image fills the viewport with TINY brand mark
  top-left and centered product-line title near bottom. No CTA buttons
  in hero — discovery happens by scroll.
- **Single-row featured collection.** 4-5 products in a horizontal
  scroll-row. Each takes 60-80% of viewport-width. Designed for
  consideration, not impulse-buy.
- **Editorial about + journal sections** with long-form copy. Brand
  story is the marketing.

## When to pick this design

- Luxury fashion brand, jewelry maker, leather goods, premium watches
- Small curated catalog (10-30 SKUs)
- Strong product + lifestyle photography (it carries the whole design)
- Customers research and consider, not scroll-and-buy
- Brand voice is quiet, confident, opinionated

## NOT recommended if

- High SKU count (1000+ products) — the sparse navigation breaks down
- Discount-driven shop (visual language is incompatible with sales)
- Weak product photography — design has nothing to hide behind

## Pricing

Cartwright Studio designs are **part of Cartwright Plus** ($99/mo
or $990/yr). Suggested individual purchase: $29 (vs $19 for Northern
Coffee — Atelier requires more curation discipline + image-quality
investment from the buyer).

## License

MIT-equivalent for code. Visual design © Cartwright. Free to use
commercially when subscribed to Plus.
