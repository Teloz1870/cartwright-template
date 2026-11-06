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

## Capturing leads

Don't build an inquiry table — one ships. `Lead` (`prisma/schema.prisma`) ←
`POST /api/inquiries` → `/admin/leads`. The no-DB site profile uses
`app/api/inquiries/route.static.ts`, which mails the owner instead.

Custom forms (calculators, quote wizards) send two extra fields: `source`
(which form, ≤64 chars) and `data` (a JSON object of whatever you collected,
≤50 keys / ≤4 KB). Keys OUTSIDE `data` are stripped by Zod, so put custom
fields inside it. Over a cap is a `400` with its own code, never a silent
truncation.

Adding columns to `Lead` requires `pnpm db:push` before the code runs — Prisma
`INSERT … RETURNING` names every column, so an unmigrated DB fails on write as
well as read.

## Don't

- Don't commit `.env.local`, `.env.*.local`, `.mcp.json`, `i18nexus.json` (gitignored — use `.env.example` stubs).
- Don't rename `--color-*` CSS tokens once products reference them.
- Don't add npm dependencies when a Baseline 2024+ browser API does the same thing.
- Don't ship breaking changes default-on; gate behind a `brand.features.*` flag.

## Useful commands

```
pnpm dev          # dev server (port 3000, or the next free one)
pnpm dev:agent    # the same, plus the URL it chose in .cartwright/dev-url
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
3. `pnpm dev` (an agent: `pnpm dev:agent`, see "Start the dev server (agents)") → open **`/account/login`** → **Password** tab. Email = `brand.emails.admin` (from `brand.config.ts`); password = the value in `.admin-credentials` (`cat .admin-credentials`). First login forces a change at `/admin/konto`, then `/admin/setup` opens.

Magic-link only appears once `RESEND_API_KEY` is set (dev link → `.mail-previews/`); until then password is the only method, by design. Pre-set with `ADMIN_PASSWORD` before `db:setup`.

To go from booted to **designed** (apply a Voice/Skin via the REST tool surface, terminal-only), follow `.claude/CLAUDE.md` → "Your first 10 minutes".

## Start the dev server (agents)

Never assume `localhost:3000`: when port 3000 is taken, `next dev` moves on to 3001, 3002, ….
`pnpm dev:agent` is `pnpm dev` plus the URL Next actually chose, written with your
`brand.defaultLocale` path to `.cartwright/dev-url` (e.g. `http://localhost:3001/en`), and the PID
of that `next dev`, written to `.cartwright/dev-pid`. Next allows one `next dev` per project, so
while that PID is alive the block reuses its server and never starts a second one — even when the
URL does not answer yet (a compile, a restart). Only when the PID is dead or missing (a hard kill
leaves both files behind, and another app may take the port) does it delete both files and start
`pnpm dev:agent` in the background. Either way it polls the URL for a 200 with a bound — a cold
first compile takes 10–30 s:

```bash
SERVER_PID=$(cat .cartwright/dev-pid 2>/dev/null)  # the next dev an earlier call started
if ! kill -0 "$SERVER_PID" 2>/dev/null; then         # dead or missing: start a fresh one
  rm -f .cartwright/dev-url .cartwright/dev-pid      # a hard kill leaves both behind
  pnpm dev:agent > /tmp/cartwright-dev.log 2>&1 &
  DEV_PID=$!                                         # started here: yours to kill when done
  SERVER_PID=$DEV_PID
fi                                                   # alive: reuse it, even before it answers
for i in $(seq 90); do                               # bounded: 90 tries, then read the log
  kill -0 "$SERVER_PID" 2>/dev/null || break         # it exited: see below
  URL=$(cat .cartwright/dev-url 2>/dev/null) &&
    [ "$(curl -sL -m 60 -o /dev/null -w '%{http_code}' "$URL")" = 200 ] && break
  sleep 2
done
BASE=$(sed -E 's#^(https?://[^/]+).*#\1#' .cartwright/dev-url 2>/dev/null)  # e.g. http://localhost:3001
```

Every curl example in these rules uses `$BASE`. No 200 when the loop ends? If the block started the
server, read `/tmp/cartwright-dev.log`: "Another next dev server is already running" means one is up
that the block did not find (a plain `pnpm dev` writes no `.cartwright/dev-url`) — reuse the URL it
prints, or `kill` the PID it names. If it reused one, run the block again: it keeps waiting while
that PID lives and starts a fresh server once it is gone. (After a reboot another process can hold
that PID: if `ps -o args= -p "$(cat .cartwright/dev-pid)"` shows no `next dev`, delete both
`.cartwright/` files first.) Done? If the block started the server, `kill "$DEV_PID"` stops
`next dev` too and deletes both `.cartwright/` files; a server it reused is left running. If your
shell does not keep variables between calls, run the block again in each call — while its server
lives it only reuses it — or start `pnpm dev:agent` once with your tool's own background mode and
re-read `.cartwright/dev-url` in each call.
