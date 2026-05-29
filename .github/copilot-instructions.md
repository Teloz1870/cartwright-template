# Copilot instructions for this Cartwright store

This is a Cartwright-engine store: Next.js 16 + React 19 + TypeScript + Tailwind v4 + Prisma. The full project briefing is in `.claude/CLAUDE.md`.

## Single source of truth

Everything brand-specific (identity, mode, feature flags, policies, copy) is in `brand.config.ts`. Don't hardcode brand strings in components — read from `brand`.

## Three operating modes

`brand.mode`:
- `"website"` — corporate/marketing site, no cart.
- `"webshop"` — full e-commerce.
- `"agent-marketplace"` — A2A/agentic checkout.

Cross-cutting features turn on via additive `brand.features.*` flags. New features ship default-false.

## Modern web platform first

Prefer native browser APIs over JS libraries:

- `<dialog>` + Popover API for modals/drawers.
- `document.startViewTransition` for SPA navigation (helper at `app/lib/view-transitions.ts` when present).
- Container queries (`@container`, `container-type: inline-size`) for component-responsive layouts.
- `:has()`, `:user-valid`, `:user-invalid` for state-based styling.
- `oklch()` for new color decisions.
- `scheduler.yield()` for INP-risky long synchronous work.

## Structured data is non-negotiable

Every citable page (PDP, article, FAQ, breadcrumb trail) ships SSR JSON-LD via `components/JsonLd.tsx`. Don't put structured data in client components.

## Performance budget

- LCP candidate (PDP hero image) gets `fetchPriority="high"`.
- Below-fold images get `loading="lazy"`.
- Web Vitals are reported via `components/WebVitalsReporter.tsx` when `brand.features.webVitals` is on.

## Accessibility baseline

- Async state changes (cart updates, review submissions, errors) announce via `components/a11y/LiveRegion.tsx`.
- Respect `prefers-reduced-motion` — globals.css already wires this, follow the pattern for new animations.
- Modals use native `<dialog>` so the browser handles focus trap + escape.

## Conventions

- Server components by default. `"use client"` only when interactivity demands it.
- Prisma queries live in `lib/db/` modules, not inline in pages.
- AI prompt modules at `lib/ai/prompts/<slug>.ts`. Don't inline prompts in components.
- Tests with Vitest at `*.test.ts` / `*.test.tsx`. Run via `pnpm test`.

## Don't

- Don't commit `.env.local`, `.env.*.local`, `.mcp.json`, `i18nexus.json` (gitignored — use `.env.example` stubs).
- Don't rename `--color-*` CSS tokens once products reference them.
- Don't add npm dependencies when a Baseline 2024+ browser API does the same thing.
- Don't ship breaking changes default-on; gate behind a `brand.features.*` flag.

## Useful commands

```
pnpm dev          # localhost:3000
pnpm build        # production build (catches type/route errors)
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest
pnpm db:push      # sync Prisma schema
```
