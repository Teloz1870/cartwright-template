---
schema: cartwright-design-v1
slug: webshop-classic
name: Webshop Classic (default e-commerce)
description: HeroVideo + 4-product featured grid + lifestyle-image pitch + 5-col category grid + trust badges. The default Cartwright webshop layout — pre-v0.7.0 the only webshop design.
mode: webshop
premium: false

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
    mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace"

sections:
  - type: hero-video
    headline: "Your shop starts here"
    tagline: "{{settings.tagline OR brand.uiLabels.heroSubtagline}}"
    announcement: "{{settings.announcement}}"     # optional eyebrow
    cta: { label: "{{brand.uiLabels.heroCta}}", href: "/produkter" }
    style:
      video: HeroVideo                            # saveData-gated, loops
      gradient: radial(70% 90% at 15% 50%, ink/55 → ink/25 → transparent)

  - type: featured-products
    title: "Most popular"
    viewAllLink: { label: "View all", href: "/produkter" }
    count: 4                                       # from prisma.product.findMany({where:{featured:true}})

  - type: pitch-split
    image: "{{lib/images.LIFESTYLE_IMAGE}}"
    heading: "{{brand.uiLabels.pitchSectionHeading}}"
    body: "{{brand.uiLabels.pitchSectionBody}}"
    cta: { label: "Browse the catalog", href: "/produkter" }
    style: { rhs-bg: var(--color-sol-accent), rhs-text: white }

  - type: category-grid
    title: "Shop by category"
    count: 3                                       # actual: prisma.category.findMany({take:3})
    cols: { mobile: 2, sm: 3, lg: 5 }              # 5-col responsive
    fallback: { source: "lib/images.CATEGORY_IMAGES", per-slug: true }

  - type: trust-badges
    variant: homepage
    bg: var(--color-sol-sand)
---

# Webshop Classic design

Pre-v0.7.0 var dette ren inline-render i `app/[locale]/page.tsx`
(lines 91-230). Extracted som første-class DesignPack i v0.7.0 så vi kan
adde flere webshop-varianter parallelt uden hardcoded if/else.

## When to pick this design

- You're running an e-commerce shop (any industry)
- You want the proven Cartwright default layout (battle-tested in
  Northbound coffee + solbrillen.dk eyewear)
- You like the HeroVideo aesthetic (loopende baggrundsvideo med
  saveData-gating så mobile-data ikke bliver hammered)
- You want 5-col category grid for visual category-discovery

## Data dependencies

Component modtager `featured` + `categories` som props fra
`app/[locale]/page.tsx`. Data fetches der via Prisma — Design styrer
KUN rendering.

## License

MIT.
