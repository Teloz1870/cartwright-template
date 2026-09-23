---
schema: cartwright-design-v1
slug: webshop-editorial
name: Webshop Editorial (magazine)
description: Split-screen story-driven hero, alternating editorial product cards, typographic billboard categories. For story-led shops — vintage, artisan, lifestyle brands.
mode: webshop
premium: true

tokens:
  prefix: sol
  palette:
    accent: "#1e3f5a"
    accentDeep: "#0f2438"
    cream: "#f4efe6"
    sand: "#e8e1d3"
    ink: "#1a1a1a"
    muted: "#726d62"
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, monospace"
    # NB: design uses serif typography for body — Cartwright doesn't ship a
    # serif Next/font by default. Either override --font-sans here med en
    # serif (Playfair, Cormorant) eller installer via app/layout.tsx for
    # at få fuld editorial look. Fall-back er system-serif.

sections:
  - type: opaque
    component: WebshopEditorialHomepage
---

# Webshop Editorial

Magazine-style layout. Split-screen hero (image + editorial copy), 4
alternating product story-cards (with story numbers and "read more"
microcopy frem for spec sheets), kategorier som typografiske billboards
uden billeder.

## When to pick this design

- You sell story-led products (artisan, vintage, lifestyle, brand m/
  fortælling)
- You have long product descriptions worth reading (200+ chars)
- You're comfortable curating featured-set (4 max på forsiden)
- Du vil have et premium look uden at investere i product-photography
  for category-tiles

## Typography note

Designet bruger `font-serif` Tailwind-class som default mapper til system
serif. For full editorial feel, override `--font-sans` til en serif (fx
Playfair Display) i themes/<shop>.css eller via
BrandingSettings.themeJson.

## License

MIT. ⭐ Pro tier — honor-system (PR v0.6.0).
