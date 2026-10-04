---
schema: cartwright-design-v1
slug: saas-dark
name: SaaS Dark (futurist / cyber)
description: Dark bg with indigo accents, animated grid + glow, terminal code-snippet hero. Built by Antigravity for Cartwright's marketing site — pure dark-mode SaaS aesthetic.
mode: website
premium: false

tokens:
  prefix: saas
  palette:
    accent: "#818cf8"            # indigo-400 — primary CTA / highlight glow
    accentDeep: "#4f46e5"        # indigo-600 — hover state
    cream: "#000000"             # page background (pure black)
    sand: "#0a0a0a"              # panel/card surface (offset from page bg)
    ink: "#ffffff"               # body text
    muted: "rgba(255,255,255,0.6)"  # secondary text
  extraTokens:
    color-saas-glow: "rgba(99, 102, 241, 0.2)"
    color-saas-grid-dot: "rgba(255, 255, 255, 0.15)"
    color-saas-terminal-bg: "#0A0A0A"
    color-saas-success: "#10b981"
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace"

sections:
  - type: hero
    eyebrow: "AI shop · Live"
    headline: "{{brand.metadata.title}}"
    headlineAccent: "{{auto-last-word}}"
    tagline: "{{brand.tagline}}"
    cta: { label: "{{i18n:SaaSHome.submitBtn}}", href: "/contact" }
    microcopy: "{{i18n:SaaSHome.wantSimilar}}"
    style: { variant: dark-glow }

  - type: code-snippet
    title: "{{i18n:SaaSHome.terminalTitle}}"
    body: "const agent = new CartwrightAgent({ mode: 'autonomous', brand: '{{storeName}}', plugins: ['i18nexus', 'vibe-engine', 'stripe'], capabilities: ['commerce', 'triage', 'in-house-designer'] }); await agent.deploy();"

  - type: bento-grid
    title: "{{i18n:SaaSHome.bentoTitle}}"
    description: "{{i18n:SaaSHome.bentoSubtitle}}"
    # Items: edge/autonomous/i18n/vibe/stack — 5 cards, mixed col-span via i18n

  - type: cta-block
    badge: "{{i18n:SaaSHome.cartwrightBadge}}"
    title: "{{i18n:SaaSHome.cartwrightTitle}}"
    body: "{{i18n:SaaSHome.cartwrightDesc1}}"
    cta: { label: "{{i18n:SaaSHome.cartwrightBtn}}", href: "/cartwright" }
    style: { variant: gradient-rim }

  - type: use-cases
    # Sourced from designs/saas-dark/UseCases.tsx — keeps render-side data
    # because it has framer-motion + interactive elements that can't be
    # serialised cleanly into design.md frontmatter.
---

# SaaS Dark design

Originally built by Antigravity for Teloz' marketing site (teloz.net /
teloz-showcase). High-contrast dark mode with indigo accents, animated
radial-grid background, glowing CTA, and a typed code-snippet in the hero.

## When to pick this design

- You're building an AI-agency or SaaS landing page
- You want a "cyber / futuristic" aesthetic (think Anthropic, Replicate,
  Modal — high-tech indie-startup vibe)
- Your brand language uses words like "autonomous", "agentic", "pipeline",
  "deploy"
- You're OK with framer-motion JS bundle cost (~50KB gzip)

## Architecture notes

- Uses framer-motion for fade-in-on-scroll animations
- Translates copy via next-intl namespace `SaaSHome`
- Render path: app/[locale]/page.tsx → designs/index.ts → SaaSDarkHomepage
- UseCases.tsx is a separate Client Component imported into homepage —
  retains interactivity (hover-state, demo-tabs).

## License

MIT.
