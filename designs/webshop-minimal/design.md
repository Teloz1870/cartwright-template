---
schema: cartwright-design-v1
slug: webshop-minimal
name: Webshop Minimal (Apple-like)
description: Full-bleed hero image + oversized typography + 2-col featured grid. Premium DTC-look — fewer, bigger products, generous whitespace. No category grid.
mode: webshop
premium: false

tokens:
  prefix: sol
  palette:
    accent: "#1e3f5a"
    accentDeep: "#0f2438"
    cream: "#ffffff"
    sand: "#f5f5f4"
    ink: "#0a0a0b"
    muted: "#737373"
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"

sections:
  - type: opaque
    component: WebshopMinimalHomepage
    # Hele homepage er én custom komponent fordi layoutet bryder fra
    # generiske sections (full-bleed hero med Image fill, oversized
    # clamp-typography, 2-col aspect-[4/5] grid). Cleaner som én komponent
    # end at compose'e fra section-atoms.
---

# Webshop Minimal

Apple-inspired layout for premium DTC shops. Full-bleed hero image fills
the viewport, oversized headline typography (`clamp(3.5rem, 10vw, 9rem)`),
2-column featured grid for the top products, no category grid (single
"Shop all" CTA at the bottom).

## When to pick this design

- You sell premium / luxury / design-led products
- You have strong product photography (full-bleed images carry the design)
- You want minimal friction — fewer choices, bigger products, single CTA
- Your catalog is curated (10-50 products), not warehouse-scale

## Image requirements

- `settings.heroImage` should be a portrait/landscape image at minimum
  1920x1080. Will be cropped to fit viewport — center-focus subjects.
- Product images should be aspect-4:5 portrait for the featured grid to
  look right.

## License

MIT.
