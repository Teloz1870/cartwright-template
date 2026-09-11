# Copilot instructions for this Cartwright store

This is a Cartwright-engine store: Next.js 16 + React 19 + TypeScript + Tailwind v4 + Prisma. The full project briefing is in `.claude/CLAUDE.md`.

> **Designing this site? Read `DESIGN.md` first** — the design playbook: the three design paths (compose a look / mockup-first / Blank Canvas), built-ins inventory (three.js is already shipped — don't install it), taste rules, and screenshot self-verification.

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

Every citable page (PDP, article, FAQ, breadcrumb trail) ships SSR JSON-LD via `components/JsonLd.tsx`. Don't put structured data in client components. Currently shipped: Organization, Product, Offer, BreadcrumbList, AggregateRating, BlogPosting, FAQPage, and SoftwareApplication (on `/built-with-cartwright`, gated by `brand.features.cartwrightBadge`).

## Sibling agent-rules files

This file is one of several IDE-agent rule files that all describe the same project — keep them consistent: `.claude/CLAUDE.md` (Claude Code), `.cursor/rules/cartwright.mdc` (Cursor), `GEMINI.md` (Gemini CLI / Antigravity), `.windsurfrules` (Windsurf).

## Performance budget

- LCP candidate (PDP hero image) gets the next/image `priority` prop.
- Below-fold images get `loading="lazy"`.

## Accessibility baseline

- Async state changes (cart updates, review submissions, errors) announce via `components/a11y/LiveRegion.tsx`.
- Respect `prefers-reduced-motion` — globals.css already wires this, follow the pattern for new animations. Site-wide motion: the 3 blessed paths in `.claude/CLAUDE.md` → "Motion & animation" (`motionEffects` presets, the three-scenes plugin, or the SSR-safe GSAP recipe).
- Modals use native `<dialog>` so the browser handles focus trap + escape.

## Conventions

- Server components by default. `"use client"` only when interactivity demands it.
- Prisma queries live in `lib/*.ts` domain modules (client at `lib/db.ts`), not inline in pages.
- AI prompt modules at `lib/ai/prompts/<slug>.ts`. Don't inline prompts in components.
- Tests with Vitest at `*.test.ts` / `*.test.tsx`. Run via `pnpm test`.
- For a fully custom design (own header/footer/pages, backend untouched), rewrite the `designs/blank/` pack — guide in `AGENTS.md` → "Blank canvas — build a design from scratch".

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

## Run it & sign in (first time)

> **`--profile site` scaffold?** (`.cartwright/profile.json` says which profile you have.) There is no database, admin or login here — skip the first-run steps below: `pnpm dev` is the whole first run, `pnpm build` the whole production gate, and deploying needs no environment variables. Guide: `docs/simple-site.md`.

A fresh project is empty until the schema is created and the admin is seeded. `npx create-cartwright`
runs steps 1–2 for you and prints the admin login — if you scaffolded with it, skip to step 3. Manual clone:

1. `pnpm install`
2. `pnpm db:setup` — creates the schema **and** seeds the admin + demo data; prints the admin **email + password** and writes them to **`.admin-credentials`** (gitignored). Auto-falls-back via the libSQL client if `prisma db push` hits the flaky Prisma 7.8 `Schema engine error:`.
3. `pnpm dev` → open **`/account/login`** → **Password** tab. Email = `brand.emails.admin` (from `brand.config.ts`); password = the value in `.admin-credentials` (`cat .admin-credentials`). First login forces a change at `/admin/konto`, then `/admin/setup` opens.

Magic-link only appears once `RESEND_API_KEY` is set (dev link → `.mail-previews/`); until then password is the only method, by design. Pre-set with `ADMIN_PASSWORD` before `db:setup`.

To go from booted to **designed** (apply a Voice/Skin via the REST tool surface, terminal-only), follow `.claude/CLAUDE.md` → "Your first 10 minutes".
