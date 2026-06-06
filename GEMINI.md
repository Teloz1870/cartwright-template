# Cartwright project rules

This codebase is a **Cartwright-engine store** — a single Next.js 16 + React 19 +
TypeScript app that runs as a corporate website, a webshop, or an agent-marketplace
depending on `brand.config.ts`. The full project briefing is in `.claude/CLAUDE.md` — read
it for context, mode definitions, and the file map.

> **See also** (same rules, other agents): `.cursor/rules/cartwright.mdc` (Cursor),
> `.github/copilot-instructions.md` (Copilot), `.windsurfrules` (Windsurf), `.claude/CLAUDE.md`
> (Claude Code).

> Cartwright is an open-source, AI-first Next.js + Stripe commerce engine. Scaffold one
> with `npx create-cartwright`. Source: https://github.com/Teloz1870/cartwright-template

## Run it & sign in (first time)

A fresh project is empty until the schema is created and the admin is seeded.
`npx create-cartwright` runs steps 1–3 for you and prints the admin login — if you scaffolded with it,
skip to step 4. Manual clone:

1. `pnpm install`
2. `npx prisma db push` — create the local SQLite schema (`dev.db`)
3. `npx prisma db seed` — create the admin user + demo data; prints the admin **email + password** and
   writes them to **`.admin-credentials`** (gitignored) in the project root
4. `pnpm dev` → open **`/account/login`** → **Password** tab. Email = `brand.emails.admin` (from
   `brand.config.ts`); password = the value in `.admin-credentials` (`cat .admin-credentials`). First
   login forces a change at `/admin/konto`, then `/admin/setup` opens.

Magic-link only appears once `RESEND_API_KEY` is set (dev link → `.mail-previews/`); until then password
is the only method, by design. Pre-set with `ADMIN_PASSWORD` before `db seed`.

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
AggregateRating, BlogPosting, FAQPage, and SoftwareApplication (Cartwright product schema on
`/built-with-cartwright`, gated by `brand.features.cartwrightBadge`). Don't put JSON-LD in
client components.

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
