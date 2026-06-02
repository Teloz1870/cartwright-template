# Cartwright project rules

This codebase is a **Cartwright-engine store** — a single Next.js 16 + React 19 +
TypeScript app that runs as a corporate website, a webshop, or an agent-marketplace
depending on `brand.config.ts`. The full project briefing is in `.claude/CLAUDE.md` — read
it for context, mode definitions, and the file map.

> Cartwright is an open-source, AI-first Next.js + Stripe commerce engine. Scaffold one
> with `npx create-cartwright`. Source: https://github.com/Teloz1870/cartwright-template

## This is NOT the Next.js you know

Next.js 16 has breaking changes vs. older training data — APIs, conventions, and file
structure may differ. Read the relevant guide in `node_modules/next/dist/docs/` before
writing routing/rendering code. Heed deprecation notices.

## Modern web platform first

When choosing between native browser APIs and JS libraries, default to native:

- **Modals/drawers** → `<dialog>` + Popover API (`popover="auto"` / `popover="manual"`).
- **SPA transitions** → `document.startViewTransition` (via `app/lib/view-transitions.ts` when present).
- **Cross-document transitions** → `@view-transition { navigation: auto }` in global CSS.
- **Responsive components** → container queries (`@container`), not per-component media queries.
- **State-based selectors** → `:has()`, `:user-valid`, `:user-invalid`, `:state(...)`.
- **Animation** → CSS-only where possible (`interpolate-size`, `@starting-style`); JS only when CSS can't express it.
- **Task scheduling** → `scheduler.yield()` for long synchronous work that risks INP regression.
- **Color** → `oklch()` / `lch()` for new palette decisions (existing `--color-sol-*` tokens stay — don't rename them).

## Structured data is mandatory

Every page that can be cited by AI search ships `<JsonLd>` markup (SSR only). Helper at
`components/JsonLd.tsx`. Currently shipped: Organization, Product, Offer, BreadcrumbList,
AggregateRating. Don't put JSON-LD in client components.

## Feature flags

Subsystems live behind `brand.features.*` in `brand.config.ts`. New features ship
default-off. Flip on staging, then promote. Don't introduce breaking UI behavior on a
default-on flag without a fallback path. The authoritative list is
`lib/feature-flags/manifest.ts`.

## File map

- `brand.config.ts` — single source of truth for brand, mode, flags, policies.
- `themes/<slug>.css` — color palette per shop.
- `components/JsonLd.tsx` — structured data.
- `lib/feature-flags/manifest.ts` — every feature flag (compile-enforced).
- `app/admin/` — admin UI.
- `lib/ai/prompts/<slug>.ts` — AI assistant prompt per shop.

## Don't

- Don't put credentials in tracked files (`.env.local`, `.mcp.json`, `i18nexus.json` are gitignored).
- Don't ship a new feature default-on without a feature flag.
- Don't rename `--color-*` CSS tokens once products reference them.
- Don't put JSON-LD inside `"use client"` components.
- Don't reach for an npm library when a Baseline-2024+ browser API does the same thing.

## When in doubt

Consult the `modern-web-guidance` skill (Chrome team's web-platform catalog) for any
HTML/CSS/clientside-JS question, and the `cartwright-guidance` skill for Cartwright patterns.
