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
- `components/WebVitalsReporter.tsx` — Phase 0 Web Vitals client. Gated by `brand.features.webVitals`.
- `components/a11y/LiveRegion.tsx` — `aria-live` announcement helper for cart/review/error events.
- `app/api/vitals/` — server endpoint receiving CWV beacons.
- `app/admin/` — admin UI: products, orders, content, integrations, AI prompts, analytics, performance, plus v0.10.0: `genome`, `seo-performance`, `design-import`, `hoptify`, `shipping`, `processors`, `redirects`, `translations`, `blog`.
- `lib/feature-flags/manifest.ts` — **single source of truth** for every flag (compile-enforced). `getFeatureView()` in `lib/feature-flags/status.ts` reads it (drives `/admin/features`, `llms.txt`, `/built-with-cartwright`).
- v0.10.0 subsystems: `lib/genome/` (Resolvable Genome), `lib/seo/` (SEO/GEO autopilot), `lib/scrape/` (Firecrawl), `lib/design-import/`, `lib/hoptify/` + `lib/ai/logo-gen.ts`, `lib/gdpr/`, `lib/tax/`, `lib/shipping/`, `designs/hoptify/`.
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

## Run it & sign in (first time)

A fresh project is empty until the schema is created and the admin is seeded. `npx create-cartwright`
runs steps 1–3 for you and prints the admin login — if you scaffolded with it, skip to step 4. For a
manual clone, run from the project root:

1. `pnpm install`
2. `npx prisma db push` — create the local SQLite schema (`dev.db`)
3. `npx prisma db seed` — create the admin user + demo data; prints the admin **email + password** and
   writes them to **`.admin-credentials`** (gitignored) in the project root
4. `pnpm dev` → open **`/account/login`** → **Password** tab:
   - Email = `brand.emails.admin` (from `brand.config.ts`); password = the value in `.admin-credentials`
     (`cat .admin-credentials`), or the `db seed` output.
   - First login forces a password change at `/admin/konto`; then the `/admin/setup` wizard opens.

Magic-link only appears once `RESEND_API_KEY` is set (dev link → `.mail-previews/`); until then password
is the only method, by design. Pre-set a password with `ADMIN_PASSWORD` before `db seed`.

If `npx prisma db push` exits with a blank `Schema engine error:`, just run it again (transient Prisma
7.8 first-run hiccup). Use `prisma db push`, not `prisma migrate deploy`, for local/dev databases.

## Getting help

- This project is generated from the open-source Cartwright engine. Source + issues: https://github.com/Teloz1870/cartwright-template
- For Cartwright-specific patterns: invoke the `cartwright-guidance` skill (your agent should do this automatically).
- For modern web platform questions: invoke the `modern-web-guidance` skill (likewise).
