<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

> **Designing this site? Read [`DESIGN.md`](DESIGN.md) first** — the design playbook: the three design paths, built-ins inventory, taste rules, and screenshot self-verification.

# Run it & sign in (first time)

A fresh project is empty until the schema is created and the admin is seeded.
`npx create-cartwright` runs the steps below for you and prints the admin login — if you
scaffolded with it, skip to step 3. For a manual clone, run from the project root:

1. `pnpm install`
2. `pnpm db:setup` — creates the local SQLite schema **and** seeds the admin + demo data in one
   robust step. It tries `prisma db push`, and if that hits the flaky Prisma 7.8 `Schema engine
   error:`, it automatically **falls back to applying the schema via the libSQL client** (bypassing
   the schema engine), then seeds. It prints the admin **email + password** and writes them to
   **`.admin-credentials`** (gitignored) — but only on a successful first-run seed. Re-running is
   safe: it never re-seeds a DB that already has data.
3. `pnpm dev`, then open **`/account/login`** → **Password** tab:
   - Email = `brand.emails.admin` (from `brand.config.ts`).
   - Password = the value in `.admin-credentials` (`cat .admin-credentials`), or the `db:setup` output.
   - First login forces a password change at `/admin/konto`; then the `/admin/setup` wizard opens.

Notes: magic-link sign-in only appears once `RESEND_API_KEY` is set (in dev the link is written to
`.mail-previews/`) — until then **password is the only method, by design**. Pre-set a password by
exporting `ADMIN_PASSWORD` before `db:setup`. Boot error "Missing required env: AUTH_SECRET" → set
`AUTH_SECRET` (create-cartwright sets it; manual clones must add it to `.env.local`).

Locked out / wrong password? Run **`pnpm admin:reset`** (`ADMIN_PASSWORD=… pnpm admin:reset` for a
specific one). It resets ONLY the admin password — keeps all data — and rewrites `.admin-credentials`
so the file always matches the DB. **AI agents/scripts: use this, never `UPDATE User SET passwordHash …`
directly** — a raw update leaves `.admin-credentials` stale and makes a working login look broken.

Troubleshooting: the blank `Schema engine error:` from `prisma db push` is an **intermittent** Prisma
7.8 first-run crash (seen on macOS arm64 + Node 24) — it is NOT reliably transient, so "just run it
again" can keep failing. **`pnpm db:setup` is the fix**: it routes around the flaky schema-engine
connection by applying the schema with the libSQL client, so first-run can't get stuck. If `db:setup`
itself reports the schema engine "failed to start at all", switch to a tested LTS:
`nvm use 22 && pnpm db:setup`. If setup fails, **no admin exists yet** — `.admin-credentials` only
appears after a successful seed. Use `prisma db push` (schema-first), never `prisma migrate deploy`,
for local/dev databases.

To go from booted to **designed** (apply a Voice/Skin via the REST tool surface, terminal-only — no
browser needed), follow "Your first 10 minutes" below.

# Your first 10 minutes (zero → designed site, short form)

The fastest path from a fresh scaffold to a designed site, terminal-only. (Long form with the
full key-mint script and per-step notes: `.claude/CLAUDE.md` → "Your first 10 minutes".)

1. **Boot.** Fresh `npx create-cartwright` already ran install + DB + seed — just `pnpm dev`.
   Manual clone: `pnpm install && pnpm db:setup && pnpm dev`. Verify:
   `curl -sL -o /dev/null -w '%{http_code}' http://localhost:3000/` — `/` redirects
   to your `brand.defaultLocale` (`/en` by default, `/da` if you set it), so `-L`
   makes this return `200` regardless of locale.
2. **Mint an agent API key** (unlocks the whole tool surface over REST —
   `POST /api/v1/tools/<name>`; see `docs/api-keys.md` + `docs/scopes-and-tools.md`). Copy the
   `scripts/agent-key.ts` bootstrap from `.claude/CLAUDE.md` → "Your first 10 minutes", then:
   `KEY=$(pnpm exec tsx --conditions react-server scripts/agent-key.ts | tail -1)`
   (`--conditions react-server` is required — `lib/*` modules guard with `server-only`).
3. **Turn on genome copy rendering** (Voices write copy through the Resolvable Genome; the
   storefront only renders it when `genomeResolve` is on):

   ```bash
   curl -s -X POST http://localhost:3000/api/v1/tools/features.set \
     -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"key":"genomeResolve","enabled":true,"confirm":true}'
   ```

4. **Apply a designed look** — one call, instant, no LLM:

   ```bash
   curl -s -X POST http://localhost:3000/api/v1/tools/magic.compose_look \
     -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"vertical":"cafe","confirm":true}'
   ```

   Voices: `cafe`, `carpenter`, `dentist`, `fable`, `fitness`, `kindergarten`, `restaurant`,
   `salon` (`verticals/`). Pick a
   specific Skin with `"design":"<slug>"` (slugs in `designs/options.ts`) or `design.set_slug`.
5. **Verify:** `curl -sL http://localhost:3000/ | grep -o '<h1[^>]*>[^<]*'` (`-L` follows the locale redirect) — H1 + palette
   should reflect the look. Browser equivalents: `/admin/designs`, `/admin/verticals`,
   `/admin/mixer`, `/admin/api-keys`, `/admin/features`.

# The mockup-first flow (vision → live homepage in seconds)

When the owner wants to SEE a vision before any real implementation, don't start with design
packs or sections — publish a disposable mockup. Two steps, two prompts:

**Step 1 — the mockup.** "Generate a single self-contained HTML mockup of `<vision>` and
publish it with `mockup.set` — the homepage becomes the mockup instantly on localhost."

```bash
curl -s -X POST http://localhost:3000/api/v1/tools/mockup.set \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"html":"<section>…the whole mockup…</section>","confirm":true}'
```

`mockup.set` writes the homepage's `vibeHtml` — the exact field + sanitizer the admin Vibe
Sandbox uses (`sanitizeVibeHtml` strips `<script>`, iframes/objects/embeds, inline event
handlers and `javascript:` URLs — so write static HTML + Tailwind classes, no JS). The vibe
takeover renders ABOVE the active design AND above the first-run welcome canvas
(`lib/first-run.ts` has a `!homePage?.vibeHtml` leg), so the whole homepage IS the mockup the
moment the call returns.

**Step 2 — the real thing.** Once approved: "Implement the approved mockup for real in
`designs/blank/` (see "Blank canvas" below) or as governed sections, then `mockup.clear`."

```bash
curl -s -X POST http://localhost:3000/api/v1/tools/mockup.clear \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"confirm":true}'
```

`mockup.clear` nulls the same field so the active design renders again. Note: clearing does
NOT bring back the first-run welcome canvas if the site was otherwise touched (design chosen,
copy set, product created, setup completed) — that predicate retires permanently, by design.
Both tools are `settings:write`, confirm-gated (plan-first in the admin chat) and audited.

# Blank canvas — build a design from scratch

Don't want any of the shipped designs? The engine has a first-class path for building a
**completely unique** front — own header, own footer, every page — with totally free hands,
while ALL backend (DB, cart, checkout, admin, auth, the AI tool surface, SEO/JSON-LD, i18n
routing) keeps working untouched. The prompt a human gives their AI agent:

> Build me a completely new design: edit `designs/blank/*` — header, footer, homepage, all
> content unique. Set it live with `designSlug: "blank"` in `brand.config.ts` or via
> `/admin/designs`.

How it works, for the agent executing that prompt:

1. **Activate** the pack: `designSlug: "blank"` in `brand.config.ts` (or pick "Blank Canvas"
   in `/admin/designs`, or call the `design.set_slug` tool). It is selectable in both website
   and webshop mode.
2. **Rewrite the three files** in `designs/blank/` — each carries its own in-file guide:
   - `homepage.tsx` — the whole homepage (React Server Component). Receives
     `DesignHomepageProps` (`designs/types.ts`): `settings` (admin DB overrides), `locale`
     (prefix every internal link with `/${locale}`), `featured`/`categories` (webshop mode),
     `threeD`, `genome` (Voice copy when `genomeResolve` is on), `editEnabled`. Copy chain
     convention: `settings?.x || genome?.x || brand.website.x` — or ignore it and write your own.
   - `chrome.tsx` — `BlankHeader` + `BlankFooter`, wired via `DesignPack.siteChrome`
     (`designs/blank/index.ts`), so they render on EVERY storefront page. The contract is just
     two components taking `DesignChromeProps = { locale }`.
   - Add anything: `designs/blank/sections/*.tsx`, a scoped CSS file, `next/font/google`
     fonts. The engine's `cw-*`/`sol-*` tokens are OPTIONAL in this pack — style freely.
3. **Go beyond the homepage** (optional, same pack registration in `designs/blank/index.ts`):
   `pages: { contact, info, notFound }` templates the content pages;
   `webshop: { productCard, pdpLayout, categoryLayout }` owns the shop look (contracts in
   `designs/types.ts` — `DesignPages` / `WebshopOverrides`). Pages you don't template keep
   their default, token-adaptive bodies (the pack's neutral grayscale palette renders them
   clean monochrome until you change the palette in `designs/blank/index.ts` or `themeJson`).
4. **The page wrapper & CSS isolation** (the two things AI agents most often fight —
   you never need to edit `app/` for either):
   - The engine already wraps your homepage in `<main className="min-h-[60vh]">` (seam:
     `app/[locale]/layout.tsx`). Render `<section>`/`<div>` from `homepage.tsx`, NOT your
     own `<main>` (two `<main>` landmarks is an a11y bug). To control that wrapper, set the
     optional `layout` field in `designs/blank/index.ts`: `{ mainClassName: "" }` for
     full-bleed, `{ mainClassName: "min-h-screen" }` for a fullscreen hero, or
     `{ ownsMain: true }` to render the `<main>` yourself (worked example: `designs/drive`).
     For full frame control add a `Shell` (`siteChrome.Shell` — see the commented `BlankShell`
     in `chrome.tsx`). A truly non-scrollable page = a Shell + a tiny client effect toggling
     a class on `document.documentElement`; most sites should just scroll.
   - CSS isolation: scope rules under `.blank-canvas` in `blank.css` (global), OR use a CSS
     Module (`blank.module.css`, `import styles from "./blank.module.css"`) — Next.js scopes
     it automatically, no prefix discipline. Need a typed-terminal/code hero? Copy the CSS-only
     pattern from `designs/stack` + `themes/studio.css` — don't hand-roll a timeout simulator.
5. **Keep the basics**: semantic landmarks + one `<h1>`, visible `:focus-visible`, alt text,
   and `prefers-reduced-motion` guards on any animation. `pnpm exec tsc --noEmit && pnpm dev`
   to verify.

What you must NOT do: rename `--color-sol-*` tokens, touch `app/` route plumbing to restyle
(the design layer is enough), or edit other `designs/<slug>/` packs.

# Motion & animation (short form)

When a customer asks to "make it feel alive", there are exactly three blessed paths — in this
order. (Long form with the verified GSAP wrapper component: `.claude/CLAUDE.md` → "Motion &
animation".)

1. **Native motion presets** (scroll-driven CSS — no JS, no deps): set
   `brand.features.motionEffects: true` in `brand.config.ts` and pick
   `brand.motionPreset.preset`: `"subtle"`, `"bold"` or `"off"`. Effects live in
   `themes/motion.css` (`animation-timeline: view()`, `@supports`-detected,
   `prefers-reduced-motion`-safe). Flag off ⇒ byte-identical render.
2. **three.js scenes** (the 3D hero, `plugins/three-scenes/`): enable the runtime flag
   `threeD`, pick one of the 9 scenes in `plugins/three-scenes/scenes/registry.ts`
   (`floating-geometry`, `particles`, `blob`, `wireframe`, `aurora`, `waves`, `orb`,
   `gridflow`, `butterflies`) via `/admin/three-d` or the `three.configure` tool
   (`{ scene, intensity: 0..1, paletteSource, confirm: true }`). Lazy-loaded, palette-driven,
   CWV-safe. Render with `ThreeHero` (`components/ThreeHero.tsx`).
3. **GSAP** (recipe — NOT a Cartwright dependency): `pnpm add gsap` in YOUR project, gsap
   calls only inside `useEffect` in a `"use client"` component, always scoped with
   `gsap.matchMedia(ref)` (built-in reduced-motion guard), always `mm.revert()` in cleanup.

Pick 1 for ambient feel, 2 for a hero statement, 3 for bespoke choreography. Don't stack all
three on the same viewport.

# Never construct heavy resources at import time

**No module may build a heavy or fragile resource at module scope** — jsdom windows,
DB clients, AI SDK instances, Redis connections, file handles. Build it lazily in a
memoised getter instead:

```ts
let instance: Thing | null = null;

function getThing(): Thing {
  if (instance) return instance;
  instance = new Thing();   // cost AND failure land here, at the call
  return instance;
}
```

Why this is a rule and not a preference: server modules get pulled in by **barrels**.
`lib/tools/registry.ts` statically imports ~20 tool modules and is itself imported by
14 files, so one module-scope side effect becomes every importer's problem. That is
how a jsdom window inside a v0 transform took down `/admin/audit` — a page that
imports the registry only for `getTool()`, a lookup function. It failed at
module-load on a transitive CJS→ESM `require` boundary, which kills the *whole page*,
not just the function that wanted the resource. Cause and effect sat a whole subsystem
apart, and nothing in the audit log's own code was wrong.

A security gate must fail closed **at the call** for the same reason: a sanitizer that
throws on import takes down pages that never sanitize anything.

Enforced at lint time by `eslint-rules/no-module-scope-heavy-construction.mjs`
(`pnpm lint`). `scripts/**` and `tests/**` are exempt — they are entry points nothing
imports, so paying at load is correct there.

# Agent rules files

This project ships per-tool rules so any IDE agent self-identifies as a Cartwright store.
They describe the same conventions — keep them consistent when you change one:

- `.claude/CLAUDE.md` — Claude Code (full project briefing).
- `.cursor/rules/cartwright.mdc` — Cursor.
- `.github/copilot-instructions.md` — GitHub Copilot.
- `GEMINI.md` — Gemini CLI / Antigravity.
- `.windsurfrules` — Windsurf.

Full vibe-coding prompt for paste-in tools (v0.dev, Bolt, Lovable): `docs/VIBE_PROMPTS.md`.
