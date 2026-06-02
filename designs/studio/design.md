---
schema: cartwright-design-v1
slug: studio
name: Studio (tech / agency)
description: Premium warm-tech design — terracotta + oker palette, Geist typography, CSS-only animations. Mirrors cartwright.app's own marketing aesthetic.
mode: website
premium: true

tokens:
  prefix: cw
  palette:
    accent: "#d97757"            # cw-terracotta — primary CTA / highlight
    accentDeep: "#c4623e"        # cw-terracotta-strong — hover state
    cream: "#fafaf9"             # cw-paper — page background
    sand: "#f5f5f4"              # cw-stone-100 — surface / panel background
    ink: "#0a0a0b"               # cw-ink — body text
    muted: "#737373"             # cw-stone-500 — secondary text
  extraTokens:
    color-cw-terracotta: "#d97757"
    color-cw-terracotta-strong: "#c4623e"
    color-cw-oker: "#e8b339"
    color-cw-oker-strong: "#c8951e"
    color-cw-paper: "#fafaf9"
    color-cw-ink: "#0a0a0b"
    color-cw-stone-50: "#fafaf9"
    color-cw-stone-100: "#f5f5f4"
    color-cw-stone-200: "#e7e5e4"
    color-cw-stone-300: "#d6d3d1"
    color-cw-stone-400: "#a8a29e"
    color-cw-stone-500: "#737373"
    color-cw-stone-600: "#525252"
    color-cw-stone-700: "#404040"
    color-cw-stone-800: "#262626"
    color-cw-stone-900: "#171717"
    color-cw-code-bg: "#1a1a1b"
  fonts:
    sans: "Geist, ui-sans-serif, system-ui, sans-serif"
    mono: "Geist Mono, ui-monospace, SFMono-Regular, monospace"

sections:
  - type: hero
    eyebrow: "v0.6 launch"
    headline: "Ship software that ships itself"
    headlineAccent: ""
    tagline: "A studio template built on Cartwright — the AI-first commerce + site engine."
    cta: { label: "Get started", href: "/contact" }
    secondaryCta: { label: "See services", href: "/services" }
    microcopy: "Next.js 16 · Tailwind v4 · MIT"

  - type: value-props
    eyebrow: "Why us"
    title: "Three promises. No asterisks."
    description: "A studio that takes shipping seriously — and respects that you're the one running the product after."
    items:
      - title: "Yours, forever"
        body: "Not a SaaS. Not a fork. You scaffold your own repo, you ship it, you own the code. No platform lock-in, no monthly tax per order."
      - title: "AI-native"
        body: "MCP server, Anthropic + Gemini integrations, and an agent-driven admin shipped on day one. AI is in the spine, not bolted on as a feature."
      - title: "Production-shaped"
        body: "Stripe, NextAuth magic-link, Vercel Blob, Resend, Sentry — wired and verified. Not a tutorial. A real product you can ship to customers."

  - type: feature-grid
    eyebrow: "What's in the box"
    title: "A real product, not a starter kit."
    description: "Every cell below is shipping code — wired, typed, and verified."
    items:
      - { title: "Admin panel", body: "12 admin routes — products, orders, content, integrations, AI prompts, analytics." }
      - { title: "Storefront",   body: "Landing, PDP, cart, checkout, account, magic-link auth — all in the box." }
      - { title: "MCP server",   body: "Built-in /api/mcp with a tool registry — agents talk to your site natively." }
      - { title: "AI assistant", body: "Anthropic and Gemini wired in. Bring your keys, swap providers in one file." }
      - { title: "Stripe checkout", body: "DB-first secret keys. Test mode and live mode toggled from the admin." }
      - { title: "Magic-link auth", body: "NextAuth with Resend. No third-party identity vendor lock-in." }

  - type: how-it-works
    eyebrow: "From zero to selling"
    title: "Three steps. Five minutes."
    description: "The longest part is choosing a project name."
    items:
      - { n: "01", title: "Scaffold",     body: "Run npx create-cartwright. Pick database, AI features, and a name.", code: "npx create-cartwright@latest my-shop" }
      - { n: "02", title: "Setup wizard", body: "Visit /admin/setup. Add Stripe, Resend, Anthropic keys through a UI.", code: "pnpm dev → /admin/setup" }
      - { n: "03", title: "Deploy",       body: "Push to Vercel. Cron jobs, AI gateway, and migrations are all wired.", code: "vercel --prod" }

  - type: stack-grid
    eyebrow: "The stack"
    title: "All current versions. No legacy."
    description: "Modern dependencies on day one — from Next 16 and React 19 to Tailwind v4 and the latest AI SDKs."
    items:
      - "Next.js 16"
      - "React 19"
      - "TypeScript 6"
      - "Tailwind v4"
      - "Prisma"
      - "Turso"
      - "NextAuth"
      - "Stripe"
      - "Anthropic SDK"
      - "Gemini SDK"
      - "Vercel AI SDK"
      - "Resend"
      - "Sentry"
      - "Zod"
      - "MCP"

  - type: cta-footer
    title: "Ship something real this week."
    description: "Scaffold, configure, deploy. No platform contract, no per-order fee."
    cta: { label: "Get started", href: "/contact" }
    secondaryCta: { label: "Read the docs", href: "/info" }
---

# Studio design

Cartwright.app-inspired premium-warm-tech design. Originally shipped as
part of cartwright-template@v0.6.0 (PR #26).

## Inspiration

Cartwright.app's own marketing aesthetic — warm terracotta + oker on
cream/ink with generous whitespace and Geist typography. Built as a
self-showcase: customers building software firms, agencies, or
agentic-startups get cartwright.app's look out-of-the-box.

## When to pick this design

- You're building a tech/SaaS marketing site
- You want a warm, premium, "indie-tech" feel (not cold corporate-blue)
- You like CSS-only animations (no framer-motion JS overhead)
- You're comfortable with the cw-* token namespace

## License

MIT. Free to fork, modify, redistribute. Attribution appreciated but
not required.
