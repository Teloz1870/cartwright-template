# Your Cartwright Store — Project Briefing

This file is loaded automatically by Claude Code (and equivalent agent CLIs) every session. It tells your AI coding agent what this codebase is, where the important pieces live, and which patterns to follow.

> **Designing this site? Read [`DESIGN.md`](../DESIGN.md) first** — the design playbook: the three design paths, built-ins inventory, taste rules, and screenshot self-verification.

> If you scaffolded this project with `npx create-cartwright`, you also have two skills available: **cartwright-guidance** (this project's specifics, at `.claude/skills/cartwright-guidance/SKILL.md`) and **modern-web-guidance** (Chrome team's web-platform best-practice catalog, installed globally if you accepted the prompt during scaffold). Your agent will use both automatically.

---

## What is this?

A Cartwright-engine store: the build engine AIs reach for — a real site with design, database and backend, live in minutes. A single Next.js 16 + React 19 + TypeScript app that can run as a corporate website, a webshop, or an agent-marketplace, depending on configuration. Single source of truth is `brand.config.ts`.

## Your first 10 minutes (zero → designed site)

The fastest path from a fresh scaffold to a designed, content-filled site running locally. Every step is terminal-only — no browser required.

1. **Boot.** If `npx create-cartwright` just ran, install + DB + seed are already done — skip to `pnpm dev`. Manual clone: `pnpm install && pnpm db:setup && pnpm dev`. Admin login is in `.admin-credentials`. Verify: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/da` (use your `brand.defaultLocale`) → expect `200`.

2. **Mint an agent API key** (one-time; unlocks the whole tool surface over REST — `POST /api/v1/tools/<name>`, see `docs/api-keys.md` + `docs/scopes-and-tools.md`). Keys are normally created in `/admin/api-keys`; the no-browser bootstrap is a short script that writes the key row directly:

   ```ts
   // scripts/agent-key.ts — run once, then delete (or keep; it only ADDs keys)
   import { config as loadEnv } from "dotenv";
   loadEnv({ path: ".env" });
   loadEnv({ path: ".env.local", override: true });

   async function main() {
     const { generateApiKey } = await import("../lib/api-auth");
     const { prisma } = await import("../lib/db");
     const { SCOPES } = await import("../lib/scopes");
     const admin = await prisma.user.findFirst({ where: { role: "admin" } });
     if (!admin) throw new Error("No admin user — run pnpm db:setup first.");
     const { plaintext, hash } = generateApiKey();
     await prisma.apiKey.create({
       data: {
         userId: admin.id,
         name: "agent-bootstrap",
         keyHash: hash,
         scopes: JSON.stringify(SCOPES), // or a narrower list from lib/scopes.ts
       },
     });
     console.log(plaintext); // shown once — the DB stores only the hash
   }
   main().catch((e) => { console.error(e); process.exit(1); });
   ```

   ```bash
   KEY=$(pnpm exec tsx --conditions react-server scripts/agent-key.ts | tail -1)
   ```

   `--conditions react-server` is required — `lib/*` modules guard with `server-only`. Keep script imports to exactly this narrow set (`lib/api-auth`, `lib/db`, `lib/scopes`); importing `lib/tools/registry` from a standalone script crashes on Next-only modules. Call tools over REST instead.

3. **Turn on genome copy rendering.** Voices (step 4) write their pre-written copy through the Resolvable Genome, and the storefront only renders genome copy when `genomeResolve` is on (otherwise only palette/scene change):

   ```bash
   curl -s -X POST http://localhost:3000/api/v1/tools/features.set \
     -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"key":"genomeResolve","enabled":true,"confirm":true}'
   ```

4. **Apply a designed look** — one call, instant, no LLM involved:

   ```bash
   curl -s -X POST http://localhost:3000/api/v1/tools/magic.compose_look \
     -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"vertical":"cafe","confirm":true}'
   ```

   A **Voice** (`verticals/`: `cafe`, `carpenter`, `fable`, `kindergarten`, `salon`) applies pre-written on-brand copy + palette + a suggested design + 3D scene in one step. To pick a specific **Skin** instead/as well, pass `"design":"<slug>"` (slugs in `designs/options.ts`) or call `design.set_slug`. A downloaded look installs via `composition.apply`.

5. **Verify the design landed:** `curl -s http://localhost:3000/da | grep -o '<h1[^>]*>[^<]*'` — the H1 and the `--color-sol-*` palette variables in the HTML should reflect the chosen look.

Prefer a browser? The same things live in the admin: `/admin/designs` (skins), `/admin/verticals` (voices; panel appears when `verticalPresets` is enabled), `/admin/mixer` (combine skin + voice + chrome), `/admin/api-keys`, `/admin/features`.

## The mockup-first flow (vision → live homepage in seconds)

When the owner wants to SEE a vision before any real implementation, don't start with design packs or sections — publish a disposable mockup. Two steps, two prompts:

**Step 1 — the mockup.** "Generate a single self-contained HTML mockup of `<vision>` and publish it with `mockup.set` — the homepage becomes the mockup instantly on localhost."

```bash
curl -s -X POST http://localhost:3000/api/v1/tools/mockup.set \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"html":"<section>…the whole mockup…</section>","confirm":true}'
```

`mockup.set` writes the homepage's `vibeHtml` — the exact field + sanitizer the admin Vibe Sandbox uses (`sanitizeVibeHtml` strips `<script>`, iframes/objects/embeds, inline event handlers and `javascript:` URLs — so write static HTML + Tailwind classes, no JS). The vibe takeover renders ABOVE the active design AND above the first-run welcome canvas (`lib/first-run.ts` has a `!homePage?.vibeHtml` leg), so the whole homepage IS the mockup the moment the call returns.

**Step 2 — the real thing.** Once approved: "Implement the approved mockup for real in `designs/blank/` (see "Blank canvas" below) or as governed sections, then `mockup.clear`."

```bash
curl -s -X POST http://localhost:3000/api/v1/tools/mockup.clear \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"confirm":true}'
```

`mockup.clear` nulls the same field so the active design renders again. Note: clearing does NOT bring back the first-run welcome canvas if the site was otherwise touched (design chosen, copy set, product created, setup completed) — that predicate retires permanently, by design. Both tools are `settings:write`, confirm-gated (plan-first in the admin chat) and audited (`lib/tools/mockup.ts`).

## Blank canvas — build a design from scratch

When the owner wants a **completely unique** front instead of a shipped design — own header, own footer, every page, totally free hands — use the `blank` DesignPack. The prompt a human gives you:

> Build me a completely new design: edit `designs/blank/*` — header, footer, homepage, all content unique. Set it live with `designSlug: "blank"` in `brand.config.ts` or via `/admin/designs`.

The pack ships deliberately bare, heavily commented files made to be rewritten:

- `designs/blank/homepage.tsx` — the whole homepage (Server Component). Receives `DesignHomepageProps` (`designs/types.ts`): `settings`, `locale` (prefix internal links with `/${locale}`), `featured`/`categories` (webshop mode), `threeD`, `genome`. Copy chain: `settings?.x || genome?.x || brand.website.x` — or write your own copy.
- `designs/blank/chrome.tsx` — `BlankHeader`/`BlankFooter`, wired via `DesignPack.siteChrome` so they replace the shared chrome on EVERY page. Contract: two components taking `DesignChromeProps = { locale }`.
- Optional, in `designs/blank/index.ts`: `pages: { contact, info, notFound }` and `webshop: { productCard, pdpLayout, categoryLayout }` to template more pages (contracts in `designs/types.ts`). Untemplated pages keep their default bodies — rendered clean monochrome by the pack's neutral grayscale palette until you change it.

The `cw-*`/`sol-*` tokens are OPTIONAL inside this pack — any CSS/Tailwind/fonts go. Everything behind the front keeps working for free: DB/Prisma, cart + checkout + Stripe, `/admin`, auth, the AI tool surface (`/api/v1/tools`), JSON-LD/SEO, i18n routing. Keep a11y (semantic landmarks, one `<h1>`, `:focus-visible`) and `prefers-reduced-motion` guards. Full version of this guide: `AGENTS.md` → "Blank canvas". For a *designed* premium pack instead, see the `cartwright-premium-design` skill.

## Scaffold profiles (light vs full)

`npx create-cartwright` scaffolds one of two profiles (same engine, one codebase):

- **`--profile light` (the default)** — website-mode scaffold with a curated set of 10 design packs (see `.cartwright/profile.json` → `keptDesigns`), the lean module set, and non-core plugin modules pruned. Built to be a real site (design system, sections, builder, database, pages, SEO/JSON-LD, deploy) out of the box.
- **`--profile full`** — everything, identical to the pre-profile scaffold. Required for `--template agent-marketplace`.

The scaffolder records which profile a project was cut from in **`.cartwright/profile.json`** (next to `release.json`, the engine-version marker). Pruned designs can be re-installed per design; pruned plugin modules re-install via the plugin system below.

## Plugins (`cartwright-plugin-v1`)

Optional engine modules are packaged as **in-repo plugins**: a flag + self-contained files + route mounts + optional admin surface, declared in a Zod-validated manifest.

- `lib/plugins/spec.ts` — the `cartwright-plugin-v1` contract (sibling of `cartwright-design-v1` and `cartwright-composition-v1`).
- `plugins/registry.ts` — the plugin catalogue; `lib/plugins/install.ts` — install state + install/uninstall logic.
- `app/api/admin/plugins/` — admin-only API: `GET` lists every plugin with installed/enabled state, `POST { slug, action: "install" | "uninstall" }` (audited, same allowlist path as `/admin/features`).
- First plugin: **`plugins/phone-widget/`** (flag `brand.features.phoneWidget`) — Phone.inc click-to-call widget + admin telephony dashboard. Its storefront component lives in the plugin; `components/ui/PhoneWidget.tsx` is an import-path shim, and `app/admin/telefon/` + `app/api/phone/*` are thin route mounts that re-export from the plugin.

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
- `reviews` — ProductReview system + AggregateRating JSON-LD.
- `consentBanner` — EU 3-category cookie consent.
- `mediaLibrary` — centralized MediaAsset table + ProductMedia join.
- `aiStylist`, `voiceShop`, `tryOn` — storefront AI features.
- `mcpPublic` — expose `/api/mcp` + `/api/v1/tools` publicly (AI-first shops).
- `cartwrightPlus` — honor-system Pro-tier signal (no enforcement yet).
- `cartwrightBadge` — **default-on**, deletable "Built with Cartwright" referral signal (like "Made with Framer"). Gates the footer badge, the `SoftwareApplication` JSON-LD on `/built-with-cartwright`, and the "Built with Cartwright" block in `llms.txt`. All three read it via `getFeatureView()`, so toggling it in `/admin/features` removes the signal everywhere. Customers flip it false to remove.

v0.10.0 additions (all default-off; full metadata in `lib/feature-flags/manifest.ts`):

- `genomeResolve` — Resolvable Genome: copy fields render override ?? resolved-cache ?? anchor; resolution triggered in `/admin/genome` (render never calls an LLM).
- `seoAutopilot` — SEO/GEO autopilot (Pro, needs `cartwrightPlus`): GSC + AI-citation measurement, self-improving genome experiments. `/admin/seo-performance`.
- `designImport` — pull a palette from a URL → live theme (`/admin/design-import`; needs `FIRECRAWL_API_KEY`).
- `hoptify` — parody "import from Shopify" onboarding (`/admin/hoptify`; real import when Firecrawl is set).
- `logoGenerator` — Gemini raster-logo generator in `/admin/indstillinger` (needs Gemini key + `BLOB_READ_WRITE_TOKEN`).
- `blog` — `/blog` + RSS + BlogPosting JSON-LD; managed at `/admin/blog`.
- `stripeTax` — managed multi-country VAT via Stripe Tax (else built-in single-rate). Set in `/admin/integrations`.
- `shippingZones` — zone/weight shipping rates + delivery times + dropship routing (`/admin/shipping`).
- `wishlist` — logged-in wishlist (`/account/wishlist`); part of the WooCommerce-parity set.
- `abandonedCart` — cron-driven cart-recovery email (`/api/cron/abandoned-cart`).

(Also non-flag in v0.10.0: GDPR/DSAR at `/admin/processors`, indexing controls `seoIndexing`/`aiCrawlers`, DB backup cron, admin redirects + translations + product CSV.)

v0.14.0 addition (default-off; full metadata in `lib/feature-flags/manifest.ts`):

- `annotateEdit` — in-place AI copy editing on the live storefront. Admin-only + default-off + base-locale only: toggle "Rediger side" → click a highlighted copy element → write a note → AI proposes new copy → before/after diff → confirm. Writes go through the existing tool-registry (`genome.set` / `settings.update_copy` / `pages.upsert` / `products.update` / `categories.upsert`) with plan-first confirmation tokens + audit (`annotation:` actor). The model never selects the tool — `lib/annotate/targets.ts` maps each target deterministically. See `lib/annotate/` + `app/api/admin/annotate`.

v0.15.0 additions (default-off / additive; full metadata in `lib/feature-flags/manifest.ts`):

- `multiCurrency` — "true" multi-currency: checkout **charges** the customer in their selected presentment currency (Stripe PaymentIntent in that currency with the converted amount) and snapshots `Order.currency` + `Order.fxRate`, vs. `currencySwitcher` which only re-formats the displayed price. `dependsOn` `currencySwitcher`, precondition ≥2 `supportedCurrencies`. One conversion path in `lib/money.ts` (`convertMinor`/`fxRate`) shared by display + charge + receipt; the Stripe webhook amount-check validates the snapshotted presentment amount. Run `pnpm db:push` for the two new `Order` columns before enabling.
- **Multi-language breadth** (no flag — config + additive): supported `locales` + `defaultLocale` live in `brand.config.ts` (`i18n/routing.ts` reads them; `hreflang` auto-on at >1 locale). `/admin/translations` + `getDynamicTranslation` now cover **Page, Service, blog Post** in addition to Product/Category (all already had a `translations` field). Localizers are now base-locale-generic via `brand.defaultLocale`. (Known gap: Product/Category *storefront render* still shows base text — follow-up.)

When adding features: **don't ship default-on**. Add the flag default-false, flip it on staging, then promote.

## Where things live

- `brand.config.ts` — identity, mode, feature flags, policies, contact, footer, copy.
- `themes/<slug>.css` — color palette per shop (don't rename `--color-*` tokens once products reference them).
- `lib/ai/prompts/<slug>.ts` — AI assistant prompt module per shop.
- `industry-templates/<slug>/` — seed data per shop type (coffee, sunglasses, generic, studio, agent-marketplace).
- `components/JsonLd.tsx` — structured data helper. Used SSR-side on root layout (Organization), PDP (Product/Offer), PLP (BreadcrumbList), blog (BlogPosting), category (FAQPage), and `/built-with-cartwright` (SoftwareApplication for the Cartwright product, gated by `brand.features.cartwrightBadge`).
- `components/a11y/LiveRegion.tsx` — `aria-live` announcement helper for cart/review/error events.
- `app/admin/` — admin UI: products (`produkter`), orders (`ordrer`), content (`sider`), integrations, AI prompts (`ai`), features, designs, plus v0.10.0: `genome`, `seo-performance`, `design-import`, `hoptify`, `shipping`, `processors`, `redirects`, `translations`, `blog`.
- `lib/feature-flags/manifest.ts` — **single source of truth** for every flag (compile-enforced). `getFeatureView()` in `lib/feature-flags/status.ts` reads it (drives `/admin/features`, `llms.txt`, `/built-with-cartwright`).
- `lib/plugins/` + `plugins/` — the plugin contract, catalogue and the plugins themselves (see "Plugins" above).
- v0.10.0 subsystems: `lib/genome/` (Resolvable Genome), `lib/seo/` (SEO/GEO autopilot), `lib/scrape/` (Firecrawl), `lib/design-import/`, `lib/hoptify/` + `lib/ai/logo-gen.ts`, `lib/gdpr/`, `lib/tax.ts`, `lib/shipping/`, `designs/hoptify/`.
- `prisma/schema.prisma` — DB schema (Turso/libSQL by default; Postgres + SQLite also supported).

## Conventions worth knowing

- **Modern web platform first.** When you have a choice between a native API (Popover, `<dialog>`, View Transitions, container queries, `:has()`) and a JS library, default to the native API. See the `cartwright-guidance` skill for Cartwright-specific patterns and `modern-web-guidance` for the wider catalog.
- **Structured data is non-negotiable.** Every page that can be cited (product, article, FAQ, breadcrumb) ships JSON-LD via `JsonLd.tsx`. Server-side only.
- **Feature-gate breaking changes.** Anything that may regress on older browsers or older shop forks goes behind `brand.features.*`.
- **Don't put credentials in tracked files.** `.env.local`, `.env.*.local`, `.mcp.json`, `i18nexus.json` are gitignored. Use `.env.example` stubs.
- **Test before push.** `pnpm dev` and click through the storefront — at minimum `/da` (or your default locale) and (if webshop) `/da/produkter` — before pushing to main.

## Motion & animation

When a customer asks to "make it feel alive", reach for these three paths — in this order:

1. **Native motion presets (scroll-driven CSS — no JS, no deps).** Flip `brand.features.motionEffects: true` in `brand.config.ts` (compile-time flag) and pick `brand.motionPreset.preset`: `"subtle"` (calm ~12px reveals), `"bold"` (pronounced transforms + animated aurora background) or `"off"`. The preset lands as `data-motion` on `<html>` (`lib/motion.ts:resolveMotionAttr`); every effect rule in `themes/motion.css` is scoped to it and uses `animation-timeline: view()` — compositor-thread, feature-detected via `@supports`, `prefers-reduced-motion`-safe, with a static `RevealOnScroll` fallback. Master flag off ⇒ `data-motion="off"` ⇒ byte-identical render.

2. **three.js scenes (Live Canvas).** The 3D hero ships as the `plugins/three-scenes/` plugin. Enable the runtime flag `threeD`, then pick a scene: 9 slugs in `plugins/three-scenes/scenes/registry.ts` — `floating-geometry`, `particles`, `blob`, `wireframe`, `aurora`, `waves`, `orb`, `gridflow`, `butterflies`. Configure via `/admin/three-d` or the `three.configure` tool (`{ scene, intensity: 0..1, paletteSource, confirm: true }`). Scenes are lazy-loaded (only the active scene's module is fetched), palette-driven from the theme tokens, and CWV-safe. Render with `ThreeHero` (`components/ThreeHero.tsx` shim → the plugin). Note: Voices set a suggested scene automatically.

3. **GSAP (recipe — NOT a Cartwright dependency).** For choreography CSS can't express (timelines, stagger across elements, scroll-scrubbed sequences): `pnpm add gsap` in YOUR project, then use this verified SSR-safe wrapper pattern:

   ```tsx
   "use client";

   import { useEffect, useRef, type ReactNode } from "react";
   import gsap from "gsap";

   export function GsapReveal({ children }: { children: ReactNode }) {
     const scope = useRef<HTMLDivElement>(null);

     useEffect(() => {
       // All gsap work happens client-side after mount (SSR-safe) and is
       // scoped to this subtree. matchMedia = built-in reduced-motion guard.
       const mm = gsap.matchMedia(scope);
       mm.add("(prefers-reduced-motion: no-preference)", () => {
         gsap.from("[data-gsap-item]", {
           opacity: 0,
           y: 24,
           duration: 0.6,
           stagger: 0.12,
           ease: "power2.out",
         });
       });
       return () => mm.revert(); // cleanup on unmount — kills tweens, restores styles
     }, []);

     return <div ref={scope}>{children}</div>;
   }
   ```

   Mark animated children with `data-gsap-item`. The rules: gsap calls only inside `useEffect` (never at module scope of a file that renders on the server), always scope with `gsap.matchMedia(ref)`/`gsap.context`, always `revert()` in cleanup, and always leave content visible when `prefers-reduced-motion: reduce` (the `matchMedia` guard above does this — the tween simply never runs, content stays at full opacity). Register plugins (e.g. `ScrollTrigger`) inside the effect too.

Pick 1 for ambient feel across the site, 2 for a hero statement, 3 for bespoke one-off choreography. Don't stack all three on the same viewport.

## Useful commands

```bash
pnpm dev               # start dev server (localhost:3000)
pnpm build             # production build (catches type/route errors)
pnpm db:push           # sync Prisma schema to DB
pnpm typecheck         # tsc --noEmit
pnpm test              # Vitest unit suite
vercel --prod          # deploy to production (if linked)
```

## Run it & sign in (first time)

A fresh project is empty until the schema is created and the admin is seeded. `npx create-cartwright`
runs steps 1–2 for you and prints the admin login — if you scaffolded with it, skip to step 3. For a
manual clone, run from the project root:

1. `pnpm install`
2. `pnpm db:setup` — creates the schema **and** seeds the admin + demo data in one robust step. Tries
   `prisma db push`; if that hits the flaky Prisma 7.8 `Schema engine error:`, it falls back to applying
   the schema via the libSQL client (bypassing the schema engine), then seeds. Prints the admin **email +
   password** and writes them to **`.admin-credentials`** (gitignored) — only on a successful first-run
   seed. Re-running is safe (never re-seeds a DB that already has data).
3. `pnpm dev` → open **`/account/login`** → **Password** tab:
   - Email = `brand.emails.admin` (from `brand.config.ts`); password = the value in `.admin-credentials`
     (`cat .admin-credentials`), or the `db:setup` output.
   - First login forces a password change at `/admin/konto`; then the `/admin/setup` wizard opens.

Magic-link only appears once `RESEND_API_KEY` is set (dev link → `.mail-previews/`); until then password
is the only method, by design. Pre-set a password with `ADMIN_PASSWORD` before `db:setup`.

Locked out / password drifted? Run **`pnpm admin:reset`** — it resets only the admin password (keeps all
data) and rewrites `.admin-credentials` so the file always matches the DB. **Agents: use this, never
`UPDATE User SET passwordHash …` directly** — a raw update leaves `.admin-credentials` stale and makes a
working login look broken (this is exactly what caused a "can't log in" red herring once).

The blank `Schema engine error:` from `prisma db push` is an **intermittent** Prisma 7.8 first-run crash
(macOS arm64 + Node 24) — NOT reliably transient, so "run it again" can keep failing. **`pnpm db:setup`
is the fix** (it routes around the flaky schema engine via libSQL). If it reports the schema engine
"failed to start at all", use a tested LTS: `nvm use 22 && pnpm db:setup`. If setup fails, no admin
exists yet — `.admin-credentials` only appears after a successful seed. Use `prisma db push`, not
`prisma migrate deploy`, for local/dev databases.

## Getting help

- This project is generated from the open-source Cartwright engine. Source + issues: https://github.com/Teloz1870/cartwright-template
- For Cartwright-specific patterns: invoke the `cartwright-guidance` skill (your agent should do this automatically).
- For modern web platform questions: invoke the `modern-web-guidance` skill (likewise).
