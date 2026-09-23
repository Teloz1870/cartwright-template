---
schema: cartwright-design-v1
slug: northern-coffee
name: Northern Coffee
description: Story-first webshop for coffee roasters, bakeries, and specialty food shops. Warm Scandinavian minimalism — generous whitespace, a single hero "today's roast", typographic categories. The first Cartwright Studio premium design.
mode: webshop
premium: true

tokens:
  prefix: nc
  palette:
    accent: "#c2410c"            # roasted-bean orange — CTA, prices
    accentDeep: "#9a3412"        # deep roast — hover state
    cream: "#fdfaf4"             # warm paper — page background
    sand: "#ede5d3"              # light clay — surface / panel
    ink: "#2c1810"               # dark coffee-brown — body text
    muted: "#8a7560"             # medium coffee — secondary text
  extraTokens:
    color-nc-forest: "#44624a"          # fresh-origin tag accent
    color-nc-cream-hi: "#fff8ec"        # paper highlight (above sand)
    color-nc-line: "rgba(44, 24, 16, 0.12)"  # hairline borders
    color-nc-roast-bg: "#1a0e08"        # very-dark espresso, for hero overlay
  fonts:
    # NB: For full editorial feel, load Cormorant Garamond eller Lora som
    # serif via app/layout.tsx + sæt --font-serif. Vi falder tilbage til
    # system-serif som default så designet shipper out-of-the-box uden
    # ekstra font-loading.
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, monospace"

sections:
  - type: opaque
    component: NorthernCoffeeHomepage
    # Layout er for kustomiseret til at compose'e fra generic atoms —
    # story-first hero med split-screen, "today's roast"-feature med
    # oversized treatment, og typographic-only categories er alle
    # Northern-Coffee-specifikke patterns.
---

# Northern Coffee

The first Cartwright Studio premium design. Built for independent coffee
roasters, specialty bakeries, and any food shop that sells *story* as
much as product.

## Visual language

- **Warm Scandinavian minimalism.** Generous whitespace, cream paper
  background, dark coffee-brown ink. No drop-shadows. No animations
  except subtle hover-states.
- **Story-first hero.** Split-screen layout — image left (the roaster
  at work, beans being weighed, a portrait of the maker), copy right
  (handwritten-style intro with date/season/issue-number eyebrow).
- **Single "today's roast" feature.** One oversized product card replaces
  the typical "featured grid". The featured product gets a 60vh hero
  treatment with origin-story copy below the price.
- **Typographic categories.** No thumbnail images. Big-serif text on
  cream background with a thin underline. Categories feel like chapter
  headings in a magazine.
- **Newsletter framed as a zine.** "Subscribe to the seasonal letter"
  rather than "Get 10% off". Targets coffee customers who want craft
  and connection, not discount-hunters.

## When to pick this design

- You're a coffee roaster, bakery, chocolate maker, or specialty food
  brand (40g products, not 4kg)
- Your products have *stories* — origin, season, maker, technique —
  worth reading before buying
- You shoot strong product + lifestyle photography (the design depends
  on it)
- You'd rather feel like a cafe owner than a marketplace

## Typography note

The design uses Tailwind's `font-serif` class for headlines. To get the
full editorial feel, load **Cormorant Garamond** or **Lora** via
`next/font/google` in `app/layout.tsx` and bind it to `--font-serif`:

```tsx
import { Cormorant_Garamond } from "next/font/google";
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
});
// add `${serif.variable}` to the <html> className
```

Without that, the design renders with system-serif (Georgia / Times)
which still works but lacks the warmth.

## Data dependencies

Expects `featured` array (Prisma's `product.findMany({where:{featured:true}})`)
with at minimum 3 products. First product becomes the "today's roast"
hero. Categories array (3-6 entries) renders as typographic chapter list.

If `featured` is empty: hero falls back to the lifestyle image from
`brand.config.images.hero`. Site still renders, just with less impact.

## What's included (full webshop coverage — Cartwright Studio promise)

| Surface | Status |
|---|---|
| Homepage | ✅ Custom (this file) |
| PDP | 🚧 Coming in PR M proper (uses default webshop PDP for now) |
| Category | 🚧 Coming in PR M proper |
| Cart | 🚧 Coming in PR M proper |
| Email templates | 🚧 Coming in PR N (newsletter + order confirm) |

This sketch (v0.7.0+) covers homepage only. Full coverage lands when
the cartwright-marketplace launches.

## License

Cartwright Studio designs are **part of Cartwright Plus** ($99/mo or
$990/yr). Honor-system today; real license validation lands in v0.8.0
when Plus pricing goes live. You can technically use it on the free
tier — please subscribe to Plus if you ship with it commercially.
