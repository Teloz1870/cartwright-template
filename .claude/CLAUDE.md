# Your Cartwright Store — Project Briefing

This file is loaded automatically by Claude Code (and equivalent agent CLIs) every session. It tells your AI coding agent what this codebase is, where the important pieces live, and which patterns to follow.

> If you scaffolded this project with `npx create-cartwright`, you also have two skills available: **cartwright-guidance** (this project's specifics, at `.claude/skills/cartwright-guidance/SKILL.md`) and **modern-web-guidance** (Chrome team's web-platform best-practice catalog, installed globally if you accepted the prompt during scaffold). Your agent will use both automatically.

---

## What is this?

A Cartwright-engine store: a single Next.js 16 + React 19 + TypeScript app that can run as a corporate website, a webshop, or an agent-marketplace, depending on configuration. Single source of truth is `brand.config.ts`.

## Three operating modes

`brand.mode` in `brand.config.ts` selects the top-level behavior:

| Mode | What it is | What's mounted |
|---|---|---|
| `"website"` | Corporate/marketing site, no cart. | Landing, contact, info pages, AI assistant (optional). |
| `"webshop"` | Full e-commerce storefront. | PLP, PDP, cart, checkout, account, magic-link auth, Stripe. |
| `"agent-marketplace"` | A2A/agent-first shop. | Agent Card endpoint, negotiation, escrow verification, admin agentic dashboard. |

Hybrid configurations (e.g. webshop + ACP checkout endpoints) are turned on via additive `brand.features.*` flags.

## Feature flags (`brand.features.*`)

Every non-trivial subsystem is behind a flag in `brand.config.ts`. Default-off shops shouldn't surprise customers. Notable ones:

- `webshop` — turn on cart/checkout routes. Mirrors `brand.mode === "webshop"`.
- `webVitals` — self-hosted INP/LCP/CLS reporting via `/api/vitals` + admin dashboard `/admin/performance`. Consent-gated (requires `consentBanner` + accepted analytics).
- `passkeys` — WebAuthn login alongside magic-link. Experimental; verify on staging first.
- `reviews` — ProductReview system + AggregateRating JSON-LD.
- `consentBanner` — EU 3-category cookie consent.
- `mediaLibrary` — centralized MediaAsset table + ProductMedia join.
- `aiStylist`, `voiceShop`, `tryOn` — storefront AI features.
- `mcpPublic` — expose `/api/mcp` + `/api/v1/tools` publicly (AI-first shops).
- `cartwrightPlus` — honor-system Pro-tier signal (no enforcement yet).

When adding features: **don't ship default-on**. Add the flag default-false, flip it on staging, then promote.

## Where things live

- `brand.config.ts` — identity, mode, feature flags, policies, contact, footer, copy.
- `themes/<slug>.css` — color palette per shop (don't rename `--color-*` tokens once products reference them).
- `lib/ai/prompts/<slug>.ts` — AI assistant prompt module per shop.
- `industry-templates/<slug>/` — seed data per shop type (coffee, sunglasses, generic, studio, agent-marketplace).
- `components/JsonLd.tsx` — structured data helper. Used SSR-side on root layout (Organization), PDP (Product/Offer), PLP (BreadcrumbList).
- `components/WebVitalsReporter.tsx` — Phase 0 Web Vitals client. Gated by `brand.features.webVitals`.
- `components/a11y/LiveRegion.tsx` — `aria-live` announcement helper for cart/review/error events.
- `app/api/vitals/` — server endpoint receiving CWV beacons.
- `app/admin/` — admin UI: products, orders, content, integrations, AI prompts, analytics, performance.
- `prisma/schema.prisma` — DB schema (Turso/libSQL by default; Postgres + SQLite also supported).

## Conventions worth knowing

- **Modern web platform first.** When you have a choice between a native API (Popover, `<dialog>`, View Transitions, container queries, `:has()`) and a JS library, default to the native API. See the `cartwright-guidance` skill for Cartwright-specific patterns and `modern-web-guidance` for the wider catalog.
- **Structured data is non-negotiable.** Every page that can be cited (product, article, FAQ, breadcrumb) ships JSON-LD via `JsonLd.tsx`. Server-side only.
- **Feature-gate breaking changes.** Anything that may regress on older browsers or older shop forks goes behind `brand.features.*`.
- **Don't put credentials in tracked files.** `.env.local`, `.env.*.local`, `.mcp.json`, `i18nexus.json` are gitignored. Use `.env.example` stubs.
- **Test before push.** `pnpm dev` and click through the storefront — at minimum `/da` (or your default locale) and (if webshop) `/da/produkter` — before pushing to main.

## Useful commands

```bash
pnpm dev               # start dev server (localhost:3000)
pnpm build             # production build (catches type/route errors)
pnpm db:push           # sync Prisma schema to DB
pnpm typecheck         # tsc --noEmit
pnpm test              # Vitest unit suite
vercel --prod          # deploy to production (if linked)
```

## Getting help

- This project is generated from the open-source Cartwright engine. Source + issues: https://github.com/Teloz1870/cartwright-template
- For Cartwright-specific patterns: invoke the `cartwright-guidance` skill (your agent should do this automatically).
- For modern web platform questions: invoke the `modern-web-guidance` skill (likewise).
