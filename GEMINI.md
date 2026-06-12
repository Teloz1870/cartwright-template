# Cartwright project rules

This codebase is a **Cartwright-engine store** — a single Next.js 16 + React 19 +
TypeScript app that runs as a corporate website, a webshop, or an agent-marketplace
depending on `brand.config.ts`. The full project briefing is in `.claude/CLAUDE.md` — read
it for context, mode definitions, and the file map.

> **Designing this site? Read [`DESIGN.md`](DESIGN.md) FIRST.** It is the design
> playbook: the three design paths (compose a look / mockup-first / Blank Canvas),
> the built-ins inventory (three.js scenes, SVG items, motion presets, the GSAP
> recipe), the taste rules, and the screenshot self-verification discipline.

> **See also** (same rules, other agents): `.cursor/rules/cartwright.mdc` (Cursor),
> `.github/copilot-instructions.md` (Copilot), `.windsurfrules` (Windsurf), `.claude/CLAUDE.md`
> (Claude Code).

> Cartwright is an open-source, AI-first Next.js + Stripe commerce engine. Scaffold one
> with `npx create-cartwright`. Source: https://github.com/Teloz1870/cartwright-template

## Run it & sign in (first time)

A fresh project is empty until the schema is created and the admin is seeded.
`npx create-cartwright` runs steps 1–2 for you and prints the admin login — if you scaffolded with it,
skip to step 3. Manual clone:

1. `pnpm install`
2. `pnpm db:setup` — creates the schema **and** seeds the admin + demo data; prints the admin **email +
   password** and writes them to **`.admin-credentials`** (gitignored). Auto-falls-back via the libSQL
   client if `prisma db push` hits the flaky Prisma 7.8 `Schema engine error:`.
3. `pnpm dev` → open **`/account/login`** → **Password** tab. Email = `brand.emails.admin` (from
   `brand.config.ts`); password = the value in `.admin-credentials` (`cat .admin-credentials`). First
   login forces a change at `/admin/konto`, then `/admin/setup` opens.

Magic-link only appears once `RESEND_API_KEY` is set (dev link → `.mail-previews/`); until then password
is the only method, by design. Pre-set with `ADMIN_PASSWORD` before `db:setup`.

## Your first 10 minutes (zero → designed site)

The fastest path from a fresh scaffold to a designed site, terminal-only. (Long form with
the full key-mint script and per-step notes: `.claude/CLAUDE.md` → "Your first 10 minutes".)

1. **Boot.** Fresh `npx create-cartwright` already ran install + DB + seed — just `pnpm dev`.
   Manual clone: `pnpm install && pnpm db:setup && pnpm dev`. Verify:
   `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/da` (use your
   `brand.defaultLocale`) → expect `200`.
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

   Voices: `cafe`, `carpenter`, `fable`, `kindergarten`, `salon` (`verticals/`). Pick a
   specific Skin with `"design":"<slug>"` (slugs in `designs/options.ts`) or `design.set_slug`.
5. **Verify:** `curl -s http://localhost:3000/da | grep -o '<h1[^>]*>[^<]*'` — H1 + palette
   should reflect the look. Browser equivalents: `/admin/designs`, `/admin/verticals`,
   `/admin/mixer`, `/admin/api-keys`, `/admin/features`.

## The mockup-first flow (vision → live homepage in seconds)

When the owner wants to SEE a vision before any real implementation, publish a disposable
mockup instead of starting with design packs or sections:

```bash
curl -s -X POST http://localhost:3000/api/v1/tools/mockup.set \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"html":"<section>…the whole mockup…</section>","confirm":true}'
```

`mockup.set` writes the homepage's `vibeHtml` through `sanitizeVibeHtml`, which strips
`<script>`, iframes/objects/embeds, inline event handlers and `javascript:` URLs — so write
static HTML + Tailwind + inline SVG + CSS animation, **no JS** (GSAP/three.js need the real-code
Blank Canvas path). The mockup takes over the whole homepage the moment the call returns.
Once approved, implement it for real (Blank Canvas below, or governed sections), then
`mockup.clear` (`{"confirm":true}`) to drop the takeover.

## Blank canvas — build a completely unique design

The first-class path for a fully bespoke front — own header, own footer, every page — while
ALL backend (DB, cart, checkout, admin, auth, the AI tool surface, SEO/JSON-LD, i18n routing)
keeps working untouched:

1. **Activate**: `designSlug: "blank"` in `brand.config.ts` (or `/admin/designs`, or the
   `design.set_slug` tool).
2. **Rewrite** `designs/blank/homepage.tsx` (the whole homepage, Server Component — receives
   `DesignHomepageProps` from `designs/types.ts`; prefix internal links with `/${locale}`) and
   `designs/blank/chrome.tsx` (`BlankHeader`/`BlankFooter`, rendered on EVERY page). Each file
   carries its own in-file guide.
3. **Add anything**: `designs/blank/sections/*.tsx`, a scoped CSS file, `next/font/google`
   fonts. The engine's `cw-*`/`sol-*` tokens are OPTIONAL in this pack.
4. **Keep the basics**: semantic landmarks + one `<h1>`, visible `:focus-visible`, alt text,
   `prefers-reduced-motion` guards. Full walkthrough: `AGENTS.md` → "Blank canvas". Taste rules
   + self-verification: `DESIGN.md`.

## Motion & animation

When a customer asks to "make it feel alive", there are exactly three blessed paths — in this
order. (Long form with the verified GSAP wrapper component: `DESIGN.md` → "Built-ins inventory"
or `.claude/CLAUDE.md` → "Motion & animation".)

1. **Native motion presets** (scroll-driven CSS — no JS, no deps): set
   `brand.features.motionEffects: true` in `brand.config.ts` and pick
   `brand.motionPreset.preset`: `"subtle"`, `"bold"` or `"off"`. Effects live in
   `themes/motion.css` (`animation-timeline: view()`, `@supports`-detected,
   `prefers-reduced-motion`-safe). Flag off ⇒ byte-identical render.
2. **three.js scenes** (the 3D hero, `plugins/three-scenes/` — three.js is ALREADY shipped,
   do NOT `pnpm add three`): enable the runtime flag `threeD`, pick one of the 9 scenes in
   `plugins/three-scenes/scenes/registry.ts` (`floating-geometry`, `particles`, `blob`,
   `wireframe`, `aurora`, `waves`, `orb`, `gridflow`, `butterflies`) via `/admin/three-d` or
   the `three.configure` tool (`{ scene, intensity: 0..1, paletteSource, confirm: true }`).
   Lazy-loaded, palette-driven, CWV-safe. Render with `ThreeHero` (`components/ThreeHero.tsx`).
3. **GSAP** (recipe — NOT a Cartwright dependency): `pnpm add gsap` in YOUR project, gsap
   calls only inside `useEffect` in a `"use client"` component, always scoped with
   `gsap.matchMedia(ref)` (built-in reduced-motion guard), always `mm.revert()` in cleanup.

Pick 1 for ambient feel, 2 for a hero statement, 3 for bespoke choreography. Don't stack all
three on the same viewport. Also built in: the palette-adaptive SVG item library
(`components/svg-items/` — 21 marks/dividers/illustrations, 9 of them CSS-animated).

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
- **Animation** → CSS-only where possible (`interpolate-size`, `@starting-style`); JS only when CSS can't express it. Site-wide motion: the 3 blessed paths in `.claude/CLAUDE.md` → "Motion & animation" (`motionEffects` presets, `plugins/three-scenes/` Live Canvas, or the SSR-safe GSAP recipe — gsap is not an engine dependency).
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
- `lib/plugins/` + `plugins/` — plugin contract (`cartwright-plugin-v1`) + in-repo plugins (first: `plugins/phone-widget/`).
- `app/admin/` — admin UI.
- `lib/ai/prompts/<slug>.ts` — AI assistant prompt per shop.
- `designs/blank/` — the **Blank Canvas** pack: rewrite its header/footer/homepage freely for a fully unique design while all backend (cart, checkout, admin, AI tools, SEO) keeps working. Guide: `AGENTS.md` → "Blank canvas — build a design from scratch".

## Don't

- Don't put credentials in tracked files (`.env.local`, `.mcp.json`, `i18nexus.json` are gitignored).
- Don't ship a new feature default-on without a feature flag.
- Don't rename `--color-*` CSS tokens once products reference them.
- Don't put JSON-LD inside `"use client"` components.
- Don't reach for an npm library when a Baseline-2024+ browser API does the same thing.

## When in doubt

Consult the `modern-web-guidance` skill (Chrome team's web-platform catalog) for any
HTML/CSS/clientside-JS question, and the `cartwright-guidance` skill for Cartwright patterns.
