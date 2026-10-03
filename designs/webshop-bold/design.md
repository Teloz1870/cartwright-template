---
schema: cartwright-design-v1
slug: webshop-bold
name: Webshop Bold (neo-brutalism)
description: High-contrast color-blocks + thick black borders + zero shadows + chunky CTA buttons. Inspired by DTC-modern (early Glossier, Allbirds) and the brutalism web trend.
mode: webshop
premium: true

tokens:
  prefix: bold
  palette:
    accent: "#d97757"          # terracotta — hero bg
    accentDeep: "#c4623e"
    cream: "#fef3c7"           # electric-yellow paper (page bg)
    sand: "#ffffff"
    ink: "#0a0a0b"
    muted: "#525252"
  extraTokens:
    color-bold-accent: "#d97757"
    color-bold-oker: "#e8b339"
    color-bold-paper: "#fef3c7"
    color-bold-ink: "#0a0a0b"
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"

sections:
  - type: opaque
    component: WebshopBoldHomepage
---

# Webshop Bold

Neo-brutalism for DTC-shops der vil stand out. Designet bryder
"safe SaaS-look" aggressivt:

- **Thick borders** (`border-[4px]` til `border-[6px]`) over alt
- **Zero rounded corners** — kun harde rektangler
- **High-contrast color-blocks** (terracotta hero, electric-yellow paper)
- **Subtle product rotation** (-1deg / 0 / +1deg pattern på 3-col grid)
- **Hard-shadow hover-state** (`hover:shadow-[6px_6px_0_0_*]` 3D-effekt)
- **UPPERCASE typography** for alle headlines og CTA-knapper

## When to pick this design

- Fashion / streetwear / lifestyle DTC-brands der vil have personality
- Shops der målretter Gen Z / millennial audience
- Du sælger få, statement-produkter (ikke long-tail-catalog)
- Du er komfortabel med "loud" æstetik

## Constraints

- Bruger custom palette-override (--color-bold-*) frem for default sol-*.
  Hvis du sætter BrandingSettings.themeJson rammer det ikke disse tokens
  — du skal eksplicit override bold-paletten via designs/webshop-bold/
  design.md re-import.
- Designet er IKKE dark-mode-tuned (electric-yellow paper er hele pointen).
  ThemeToggle har minimal effekt på dette layout.

## License

MIT. ⭐ Pro tier — honor-system (PR v0.6.0).
