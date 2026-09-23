---
schema: cartwright-design-v1
slug: corporate-baseline
name: Corporate Baseline (generic website)
description: Neutral cinematic-hero + 3-card service-grid for marketing sites. Default fallback for website-mode shops that haven't picked SaaS Dark or Studio.
mode: website
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
  extraTokens: {}
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace"

sections:
  - type: hero
    headline: "{{settings.websiteHeadline OR i18n:WebsiteHome.titleFallback1+2}}"
    tagline: "{{settings.tagline OR brand.uiLabels.heroSubtagline}}"
    cta: { label: "{{i18n:WebsiteHome.servicesBtn}}", href: "/services" }
    secondaryCta: { label: "{{i18n:WebsiteHome.startBtn}}", href: "/start" }
    style:
      variant: cinematic-parallax
      bg: "#050A19"           # liquid dark gradient
      eyebrowColor: "#d4af37" # accent-gold uppercase

  - type: service-grid
    title: "{{i18n:WebsiteHome.servicesTitle}}"
    description: "{{i18n:WebsiteHome.servicesDesc}}"
    items: 3                  # 3-card grid (web/ai/hosting) from i18n strings
    bg: "var(--color-sol-cream)"
---

# Corporate Baseline design

Generic-but-polished website-mode fallback. Cinematic parallax hero with
gold eyebrow accent, blends into a 3-card service section on cream
background.

## When to pick this design

- You're building a website (not webshop) but the SaaS Dark or Studio
  aesthetic feels too opinionated
- You want a "safe" professional look that fits any industry
- You're comfortable with framer-motion JS bundle
- You'll override copy via /admin/sider or i18n strings

## License

MIT.
