---
schema: cartwright-design-v1
slug: stack
name: Stack
description: Dark-mode-first developer-tools landing page. Terminal-inspired hero with typed command + animated output, code-block feature cards, monospace everywhere. Built for dev SaaS, infrastructure tools, AI APIs.
mode: website
premium: true

tokens:
  prefix: st
  palette:
    accent: "#00d97e"            # electric green — CTAs, success
    accentDeep: "#00b368"        # deep emerald — hover
    cream: "#050505"             # near-pure black page bg
    sand: "#0e0e10"              # card/panel surface
    ink: "#fafafa"               # warm white body
    muted: "#888888"             # muted gray meta
  extraTokens:
    color-st-prompt: "#00d97e"
    color-st-cyan: "#6ee7ff"
    color-st-magenta: "#ff6ec7"
    color-st-amber: "#ffb800"
    color-st-line: "rgba(250, 250, 250, 0.08)"
    color-st-glow: "rgba(0, 217, 126, 0.15)"
    color-st-code-bg: "#0a0a0c"
    color-st-code-border: "rgba(0, 217, 126, 0.25)"
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace"

sections:
  - type: opaque
    component: StackHomepage
---

# Stack

Cartwright Studio premium design #3. Built for developer-tools SaaS,
infrastructure / API products, and any company whose customers live in
a terminal.

## Visual language

- **Dark-mode-first.** Pure-black bg, warm-white type. Light mode is
  available via ThemeToggle but the canonical brand identity is dark.
- **Terminal hero.** Hero is a styled terminal window (traffic-light dots,
  prompt char, blinking caret) with a typed command and animated output.
  Sets expectation immediately: "we ship something you install in a shell."
- **Code-block feature cards.** Each feature card is built around a real
  code snippet showing the API call you'd make. Not screenshots —
  literal code.
- **Monospace everywhere meta.** Section eyebrows, micro-copy, labels,
  CTAs all use Geist Mono. Body copy stays sans for readability.
- **Stack pyramid section.** Tech-list rendered as monospace cells with
  version-numbers, hinting at npm-list output.
- **Electric green accent.** Single accent (#00d97e) — for success states,
  CTAs, prompt-chars. No second accent color — keeps the terminal feel
  pure.
- **Cyan + magenta + amber** as syntax-highlight-ish tertiary tones in
  the code snippets only.

## When to pick this design

- Developer-tools SaaS (Vercel-adjacent, Linear-adjacent, Modal, Replicate)
- Infrastructure / API products (databases, hosting, observability)
- AI APIs / dev-first AI platforms
- Open-source projects with a hosted SaaS layer
- Brand voice is technical, direct, opinionated

## NOT recommended if

- Your customers are non-technical (the terminal aesthetic alienates)
- You sell to enterprises that need "polish over personality"
- Light-mode is a hard requirement (works but feels off-brand)

## Pricing

Cartwright Studio designs are **part of Cartwright Plus** ($99/mo
or $990/yr). Suggested individual purchase: $19 (entry-tier — Stack
is the smallest-scope Cartwright Studio design, single-page marketing
site, no e-commerce surfaces).

## License

MIT-equivalent for code. Visual design © Cartwright.
