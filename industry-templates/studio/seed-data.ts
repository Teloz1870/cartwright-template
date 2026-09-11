import type { IndustryTemplate } from "../types";

/**
 * Studio template (v0.6.0) — cartwright.app-inspired premium-warm-tech design.
 *
 * Mode: website (ecommerceEnabled: false). No shop catalogue — pure marketing
 * site for software firmaer, web-bureauer, agentic-startups, og indie-devs.
 * Render-laget bruger StudioHomeClient + cw-* tokens fra themes/studio.css.
 *
 * Forskellen fra "website-corporate":
 *   - corporate = neutral baseline (sol-* tokens, generic copy)
 *   - studio    = cartwright.app's æstetik (terracotta/oker, Geist, grid-bg)
 *     → "premium / paid-tier marketing-signal" via ⭐ Pro badge i wizard
 *
 * Fork-shops customizer pages via /admin/sider og hero/value-props via
 * brand.config.ts → brand.website.{headline,tagline,cta,valueProps}.
 */
export const studioTemplate: IndustryTemplate = {
  label: "Studio (tech / agency)",
  description:
    "Premium warm-tech design for software firms, agencies, and indie devs — inspired by cartwright.app itself. Site-only (no shop).",
  categories: [],
  pages: [
    {
      slug: "about",
      showInNav: true,
      title: "About",
      body: `## We build software people actually use

Replace this with your studio's story — who you are, what you ship, and why
clients should pick you over the next agency.

## Our work

Edit in /admin/sider. Showcase 3-5 highlight projects with outcomes, stack,
and a short pitch.

## How we work

A short paragraph about your process, your team, and what a typical engagement
looks like end-to-end.`,
    },
    {
      slug: "services",
      showInNav: true,
      title: "Services",
      body: `## What we do

### Product engineering

End-to-end web + mobile apps. Next.js, React Native, Postgres. We ship the
whole thing — design, code, infra, ops.

### AI integration

Anthropic, Gemini, OpenAI, Ollama. We wire LLMs into your product without
the prompt-spaghetti.

### Advisory

Architecture reviews, hiring, code audits. When you need a senior voice in
the room before you commit.`,
    },
    {
      slug: "contact",
      showInNav: true,
      title: "Contact",
      body: `## Let's talk

Reach us at the email in brand.config.ts. Replace this with your real
contact info, response time, and availability.`,
    },
  ],
  products: [],
};
