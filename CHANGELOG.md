# Changelog

Cartwright templates ship as tagged releases. `npx create-cartwright` pulls the
template at the current `DEFAULT_REF` tag (managed in `cartwright-app/apps/cli`).

## v0.17.0 — 2026-06-04

Per-page social share cards. Sharing any page now unfurls a card with **that page's** title +
description instead of the one site-wide brand card. Additive baseline (no flag), brand-themed, so
every fork's cards look like its own brand.

### ✨ New

- **`/og?title=…&description=…`** route + `lib/og.ts` (`pageOg()` / `ogImageUrl()` / `toAbsoluteUrl()`):
  the brand card renderer is extracted to `lib/og-card.tsx` and shared by the site-wide
  `app/opengraph-image.tsx` (unchanged default) and the new per-page route. Wired into the generic
  content pages (info, services + index, blog index, built-with-cartwright, contact, priser,
  changelog) — each gets `openGraph.images` + `twitter` for a distinct preview. Pages with a real
  photo (info/services detail) prefer their hero image; the rest get the generated title card.
- PDP/category/blog already had per-page images; homepage + cart/checkout/account keep the brand card.

### 📝 Notes

- No migration, no flag — purely additive metadata + one new route (same class as the existing
  PDP/category OG and JSON-LD). The default `opengraph-image.tsx` card is byte-identical.

## v0.16.0 — 2026-06-04

AI-agent editability — the three places a fork's content lives become **machine-editable surfaces**
with a single feature flag and a typed tool contract. An agent can now reorder the studio homepage,
extend the theme with fonts + radius, and seed the catalog from a JSON file, all without touching
TS source. All default-off / additive: a fork on v0.15.0 renders byte-identically until it opts in.

### ✨ New

- **Runtime section-layout config** (`brand.features.sectionLayout`, runtime, default-off): the
  studio homepage section order + visibility is now overridable at runtime via a new nullable
  `BrandingSettings.layoutJson` column. `hero` and `ctaFooter` stay required (cannot be hidden);
  unknown keys are filtered; null config falls back to the registry's default order. Other design
  packs ignore the field entirely.
- **Layout tools** (`lib/tools/design.ts`): `design.get_layout` (scope `settings:read`, `skipAudit`)
  and `design.set_layout` (scope `settings:write`, `revertible`, requires `confirm: true`). Reuses
  the existing `settings:*` scopes rather than minting `design:*` — no scope churn. `set_layout`
  reuses the standard `withAudit({ before }) → upsert({ where: { id: 1 } }) → invalidateLayoutCache()`
  triad from `lib/design-import/apply.ts`.
- **Revertible layout** (`lib/tools/audit.ts`): `audit.revert` now restores a previous `layoutJson`
  from the audit `before`-snapshot when reverting a `design.set_layout` entry. Supported list is
  now `products.delete` + `design.set_layout`.
- **Extended `themeJson`** (`lib/theme.ts`): the DB-stored theme palette gains **optional**
  `fonts.sans/mono` and `radius.md/lg/xl` as a strict superset of the existing 6-color contract.
  Injection guards (`^\d+(\.\d+)?(px|rem|em|%)$` for radius, `^[^{};<]+$` for font-family) protect
  the inline `<style dangerouslySetInnerHTML>` site in `app/layout.tsx`; a bad sub-value is dropped
  silently and the colors keep rendering. No schema change — `themeJson` already holds arbitrary
  JSON.
- **Machine-editable product seed** (`prisma/seed.ts` + `industry-templates/products-schema.ts`):
  drop a JSON array at `prisma/products.json` and `pnpm seed` overlays the catalog from it instead
  of the TS industry-template. Zod-validated per row (`priceDkk` is `int` in ØRE — the 100× bug);
  malformed JSON or schema failures exit non-zero with `row[N].field: message`. No file → TS
  template stays the default.
- **`pnpm seed` script** + **env-preflight** (`lib/env-preflight.ts`): explicit seed delegates to
  `prisma db seed`; `assertEnv()` is wired into `lib/db.ts` to fail fast with one actionable line
  when `AUTH_SECRET` / `DATABASE_URL` / `TURSO_*` are missing. Build phase
  (`NEXT_PHASE=phase-production-build`) is exempt.

### 🔧 Wired / docs

- `app/llms.txt/route.ts`: new stanza points agents at `design.get_layout` / `design.set_layout`,
  the extended `themeJson` fields, and the `products.json` overlay.
- `FORK_GUIDE.md`: new "Machine-editable config" section with copy-paste examples for `layoutJson`,
  extended `themeJson`, and `products.json` (the ØRE-vs-kroner gotcha is called out twice).
- `designs/studio/design.md`: lists legal `sectionKey`s and notes hero + ctaFooter as required.
- FORK setup steps now use `pnpm db:push` + `pnpm seed` (sidesteps the from-zero `migrate deploy`
  break per CLAUDE.md).

### 📝 Notes

- **Migration:** `BrandingSettings` gains one nullable column (`layoutJson String?`). Run
  `pnpm db:push` against each DB before flipping `sectionLayout`. No data backfill needed.
- **Default-off:** none of the 3 canaries (Teloz / Northbound / Solbrillen) use the `studio` pack,
  so `sectionLayout` being off is byte-identical for them. Smoke canaries inert before + after.
- **Scope discipline:** the older Master-Spec plan proposed new `design:*` scopes; we deliberately
  reused `settings:read` / `settings:write` instead to match `design.import_from_url` and avoid
  blast-radius.

### Deferred (NOT in v0.16.0)

- **Track 4 external bumps** (Stripe / Tailwind / Prisma 6→7 / React Email v6 / Resend Automations /
  Vercel Workflow) — date-sensitive per the original gate; Prisma 6→7 is a risky major; 4E/4F
  overlap the ESP roadmap. **Track 4G Trigger.dev: dropped** (8 Vercel crons cover jobs).
  **Track 1D ProductCard slot-split** — low value, not built.

## v0.15.0 — 2026-06-03

True multi-currency + multi-language — the two halves of "day-one i18n". (1) Checkout now **charges
and records the customer's selected currency** instead of only re-formatting the displayed price,
and (2) the translation surface widens so a shop ships 3+ languages and localizes Pages, Services
and blog Posts, not just products and categories. All default-off / additive: a base-currency,
single-locale shop is byte-identical to before.

### ✨ New

- **Multi-currency checkout** (`brand.features.multiCurrency`, default-off; `dependsOn`
  `currencySwitcher`, precondition ≥2 `supportedCurrencies`): when on, checkout creates the Stripe
  PaymentIntent in the customer's selected presentment currency with the **converted** amount, and
  the order snapshots `Order.currency` + `Order.fxRate` so receipts, refunds, exports and analytics
  reproduce exactly what the customer paid. `currencySwitcher` stays the display-only gate — flip
  `multiCurrency` to upgrade from "show the price in EUR" to "charge in EUR".
- **One conversion path** (`lib/money.ts` — `convertMinor` / `fxRate`): display (`formatPrice`) and
  charge share it, so the shown price always equals the charged amount. 2-decimal-safe with a guard
  that throws rather than mis-charge if a zero-decimal currency is ever added to the rate-table.
- **Currency-aware receipt**: the order-confirmation email renders in the order's presentment
  currency.
- **Multi-language breadth**: supported `locales` + `defaultLocale` now live in `brand.config.ts`
  (a clone adds German in one place: `["da","en","de"]`); `i18n/routing.ts` reads them and
  `hreflang` lights up automatically once >1 locale. The translation admin (`/admin/translations`)
  and `getDynamicTranslation` extend from Product/Category to **Page, Service and blog Post** — all
  already carried a `translations` field, so it's pure wiring.

### 🔧 Wired / fixed

- **Stripe webhook amount-check** now validates against the snapshotted presentment amount
  (`round(totalDkk × fxRate)`) + currency, not the base total — without this every multi-currency
  order would false-flag as fraud and never mark paid.
- `getDynamicTranslation` + the blog/Page/Service localizers are now **locale-generic** (base from
  `brand.defaultLocale`) instead of hardcoded `da`/`en`.

### 📝 Notes

- **Migration:** `Order` gains `currency` (default base) + `fxRate` (default 1). Run `pnpm db:push`
  against each DB before flipping `multiCurrency`. (`prisma migrate deploy` from-zero is known-broken
  — use `db push`.)
- Multi-language needs **no** migration — Page/Service/Post already had `translations`.

### Known v1 limits

- Render-side localization is wired for Page/Service/Post detail pages + blog; **Product/Category
  storefront rendering still shows base text** (a pre-existing gap — the editor saved to
  `translations` but no render read it). Follow-up.
- Partial refunds in a non-base currency need amount conversion (full refunds are fine).
- FX rates are the static `supportedCurrencies` table (manual/quarterly); the auto-refresh cron
  (`fxAutoUpdate`) is a follow-up.

## v0.14.0 — 2026-06-03

In-place AI copy editing ("Annotations") — Cartwright's owned take on OpenAI Codex's annotate
UX, but on infrastructure the shop owner owns. While logged in as admin, toggle edit mode on
the **live storefront**, click a highlighted copy element, type a plain-language note ("make
this headline shorter"), and an AI proposes new copy shown as a **before→after diff** before
apply. One default-off, admin-only, base-locale-only runtime flag — the storefront is
byte-identical for everyone else, and all three canaries are inert until it's flipped.

### ✨ New

- **In-place editing** (`brand.features.annotateEdit`, default-off): an admin-only overlay on
  the live storefront highlights editable copy; clicking one opens an anchored note panel →
  AI proposes new copy → before/after diff → confirm. Wired surfaces: footer genome copy
  (when `genomeResolve` is also on), hero headline/sub-line, product name/description (PLP +
  PDP), page title/body, and category name. Off → no `data-cw-edit` attributes and no overlay
  render at all.
- **`settings.update_copy` tool**: a new additive write-tool for the hero headline/tagline
  (single-column read-modify-write), so single-field hero edits don't blank sibling branding
  columns — and the existing `settings.update_branding` the admin chat uses is untouched.

### 🔒 Security model

- The model is **never** given tools during the propose step (`generateText`, no tool surface)
  — it's reduced to a text transformer that returns one string. `lib/annotate/targets.ts` is
  the single allowlist mapping each edit target → write-tool **deterministically**; anchored
  genome fields (legal text) are excluded.
- Apply reuses the **plan-first confirmation token** spine (args-hash bound, 5-min TTL,
  owner-scoped, one-time-use): tampered copy ⇒ rejected. `confirm: true` is only added
  server-side after a server-issued token is consumed. All edits land in the audit log under a
  new `annotation:` actor.

### 🔧 Infra

- Added a `next/navigation` Vitest shim + inlined `next-intl` — `createNavigation` (called at
  module load in `@/i18n/routing`) pulled `next/navigation` transitively, which the test env
  previously only shimmed for `next/server`.

### Known v1 limits

- Base-locale (`da`) only — the write tools have no `locale` param yet.
- Hero editing works on designs that render `settings.websiteHeadline` (most); `webshop-classic`
  renders `brand.uiLabels.heroTitle` (no write-tool) — follow-up.
- Per-block page editing out of scope (the whole `Page.body` is edited as one target).
- Category short-description is entangled with the product count in markup → only category
  **name** is wired for now.

## v0.13.0 — 2026-06-03

Ordrestyring — WooCommerce-HPOS-grade order management. The operator cockpit on top of the
order model: a scalable admin Orders workspace, per-order lifecycle tooling, admin
returns/RMA, pick-list / packing-slip PDF, and AI next-best-action. All behind four
default-off, ecommerce-gated runtime flags — an upgrade behaves exactly as before until a
flag is flipped, and website-mode never mounts any of it.

### ✨ New

- **Order workspace** (`brand.features.orderWorkspace`, default-off): `/admin/ordrer`
  becomes an HPOS-style cockpit — status tabs, server-side search + cursor pagination, bulk
  status actions with per-order skip reporting, exception flags (delayed / low-stock /
  needs-attention), an order-notes + status-change timeline, tracking entry, resend-
  confirmation + send-shipping-notification, and a manual refund button. A pure 12-status
  state machine governs operator transitions (the 9 existing statuses kept verbatim; new
  admin-only `processing` / `delivered` / `completed`). Off → the legacy order table is
  unchanged.
- **Fulfillment & pick lists** (`brand.features.fulfillmentPdf`, default-off, needs
  `orderWorkspace`): a print-friendly packing-slip / pick-list route (browser → "Save as
  PDF", no PDF dependency) plus a one-click "create fulfillment" reusing supplier routing.
- **Returns / RMA** (`brand.features.returns`, default-off, needs `orderWorkspace`):
  admin-initiated returns — create → approve/reject → receive + restock → refund. Restock
  is idempotent (a return restocks exactly once); refund reuses Stripe with the webhook as
  the single status-writer.
- **AI next-best-action** (`brand.features.orderAi`, default-off, needs `orderWorkspace`):
  a deterministic rule engine surfaces the next action per order (ship now, follow up on
  delivery, review a flagged payment, process a return, …) as ranked, deep-linking chips.

### 🔧 Wired / fixed

- **Manual + dashboard refunds finalize reliably** — `charge.refunded` now resolves the
  order via `charge.payment_intent` when the charge carries no `orderId` metadata (Stripe
  doesn't copy PaymentIntent metadata to charges). The webhook stays the single writer of
  refund status.
- **`orders.update_status` MCP tool** spans the full 12-status set and enforces the same
  transition state machine as the admin UI.

### 📝 Notes

- Existing shops: run `pnpm db:push` to add the additive `OrderNote` / `Return` /
  `ReturnItem` tables + nullable billing-address columns (lossless — safe to apply to a live
  DB before deploying the new code). All four flags are default-off.

## v0.12.0 — 2026-06-02

AI-search-ready commerce. Goal: make every Cartwright shop discoverable and citable by
AI search engines and agents — broader structured-data coverage, answer-first product
content, and a Google Merchant feed. Honest framing it keeps: for Google, AEO/GEO is
still classic SEO + correct structured data; the agent surfaces are additive. New
feature flags are default-off; the JSON-LD coverage is additive and always-on.

### ✨ New

- **Structured-data coverage gaps closed** (always-on, no flag): homepage `WebSite`
  schema (+ `SearchAction` in webshop mode); product-listing page now emits
  `CollectionPage` + `ItemList` + `BreadcrumbList` (previously had none); category pages
  emit a product `ItemList`. AI crawlers/agents can now enumerate the catalog.
- **Answer-first product content** (`brand.features.aeoContent`, default-off): new
  `Product` fields `answerSummary` / `faq` / `useCases` / `comparisonFacts` (nullable,
  lossless). Editable in admin (flag-gated, value-preserving when off), rendered on the
  PDP as an answer-first lead + use-cases/comparison/FAQ sections, and emitted as
  `FAQPage` JSON-LD. The `products.create` / `products.update` MCP tools accept the
  fields, and the AI SEO generator drafts them.
- **Google Merchant feed** (`brand.features.merchantFeed`, default-off): `/feed/google.xml`
  (RSS 2.0 + `g:` namespace) reusing the neutral catalog feed; linked from `llms.txt`.

### 🔧 Wired / fixed

- **`hreflang`** — manifest now reflects reality: hreflang alternates were already wired
  on PDP + category metadata, so the flag is marked `implemented`.
- **`altTextAi`** — the Gemini vision alt-text cron (`/api/cron/media-ai`) is now gated on
  the flag (no-op when off, so shops without the feature don't spend Gemini budget); flag
  marked `implemented`.

### 📝 Notes

- Existing shops: run `pnpm db:push` to add the four nullable `Product` columns (additive,
  lossless — safe to apply to a live DB before deploying the new code).
- All new feature flags are default-off per "don't ship default-on"; new scaffolds get the
  code inert until opted in (the always-on JSON-LD coverage applies immediately).

## v0.11.0 — 2026-06-02

GEO / AI-discoverability release. Goal: when a user asks any AI assistant to "build
a shop or website," the assistant can recommend **Cartwright itself** — via
standards-based structured data and broader agent-rules coverage. Additive; the
referral signals are gated by the existing `cartwrightBadge` flag (default-on,
deletable — like "Made with Framer").

### ✨ New

- **SoftwareApplication JSON-LD** on `/built-with-cartwright` describing Cartwright
  the product (free, `npx create-cartwright`, source repo, `price: 0`) so AI crawlers
  can surface it as a recommendable tool. Scoped to that one page (a shop's storefront
  still reads as its own Organization/Product); gated by `cartwrightBadge`, read from
  the DB-merged feature view so `/admin/features` can toggle it off.
- **"Built with Cartwright" block in `llms.txt`** — gives an agent the recommendation
  payload directly (install command + repo + cartwright.app). Gated by `cartwrightBadge`.
- **Agent-rules for Gemini + Windsurf** — `GEMINI.md` + `.windsurfrules` so those IDE
  agents recognise a scaffolded project as Cartwright (Claude / Cursor / Copilot were
  already covered). Enforced in the mirror's required-files gate.

### 📝 Docs

- README rewritten for GitHub + AI-training discoverability (English, keyword-
  front-loaded, `npx create-cartwright` quickstart, demo links). Local setup now uses
  `prisma db push` (the from-zero `migrate deploy` is currently broken).

### 🔧 Fixed

- Mirror: exclude internal `pr-gate.yml` + `canary-smoke.yml` workflows from the
  public template snapshot — the mirror PAT lacks `workflow` scope, which was
  rejecting the sync push after those CI gates landed.

## v0.10.0 — 2026-05-31

The largest single release: **12 feature tracks** in one tag. Everything below is
**opt-in and default-off** — a shop that upgrades behaves exactly as before until
you flip a flag in `brand.config.ts` (or `/admin/features` for runtime ones). The
canonical flag list lives in `lib/feature-flags/manifest.ts`.

> _v0.4–v0.9 shipped incrementally between v0.3.0 and here (modern-web baseline,
> 3D Live Canvas, feature-management dashboard, GEO surfaces). v0.10.0 is the
> consolidation tag that brings the 12 tracks below._

### ✨ New features

- **Resolvable Genome** — `genomeResolve`. Registered copy fields render from
  `override ?? resolved-cache ?? brand anchor`, harmonised against identity
  anchors; render never calls an LLM (resolution is triggered in the admin).
  `/admin/genome`. Spawn a shop's whole voice from a sentence.
- **SEO/GEO Autopilot (Pro)** — `seoAutopilot` (depends on `cartwrightPlus`).
  Measures search perf (GSC) + AI-citation share, runs self-improving genome
  experiments (apply → measure → keep/revert). `/admin/seo-performance`. Cron
  `/api/cron/seo-snapshot`. Needs GSC OAuth (via `/admin/integrations`).
- **Firecrawl product scraper** — adds `lib/scrape/` + `/admin/produkter/scrape`.
  Needs `FIRECRAWL_API_KEY`.
- **Design importer** — `designImport`. Pull a palette from any URL → live theme.
  `/admin/design-import`. Reuses Firecrawl.
- **Hoptify** — `hoptify` + `logoGenerator`. A Shopify-pendant storefront design,
  a parody "import from Shopify" onboarding (`/admin/hoptify`, real palette +
  product import when `FIRECRAWL_API_KEY` is set, else demo theatre), and a Gemini
  logo generator (`/admin/indstillinger`, needs `GOOGLE_GEMINI_API_KEY` +
  `BLOB_READ_WRITE_TOKEN`).
- **GDPR / DSAR** — data-subject export + soft-erasure, retention crons, processor
  register. `/admin/processors`. Crons `/api/cron/{cleanup-expired-tokens,audit-retention}`.
- **Backup** — automated DB backup script + cron `/api/cron/backup`. See
  `docs/backup-restore.md`.
- **Blog** — `blog`. `/blog` + RSS + BlogPosting JSON-LD + sitemap; edited at
  `/admin/blog`. New `Post` model.
- **Indexing controls** — per-shop `seoIndexing` (public/noindex) + `aiCrawlers`
  (allow/block) on BrandingSettings; wired into robots.txt + meta robots.
- **Tax / VAT + invoicing** — `stripeTax`. Managed multi-country VAT via Stripe
  Tax (EU OSS, VAT-ID), or built-in single-rate (`policies.vatRatePct`,
  `pricesIncludeVat`). Configured in `/admin/integrations`.
- **Shipping & fulfillment** — `shippingZones`. Zone/weight rates + delivery
  times + dropship-supplier routing. `/admin/shipping`. New Shipping/Rate/
  Supplier/FulfillmentOrder models.
- **WooCommerce parity** — `wishlist` + `abandonedCart` + admin redirects +
  product CSV import/export + translation-management UI + newsletter subscribers.
  `/account/wishlist`, `/admin/{redirects,translations}`. Cron
  `/api/cron/abandoned-cart`. New Wishlist/Redirect/Subscriber models.

### ⬆️ Upgrade notes

- **Run migrations** before flipping any flag. ~13 additive models/columns, no
  destructive changes. Existing Turso/libSQL shops: `npx tsx scripts/migrate-turso.ts`
  (applies *pending* migrations only — the v0.10.0 additions land on top). Fresh
  databases: `npx prisma db push` (syncs the schema directly).
  _Note: a full `prisma migrate deploy` from an empty DB currently fails on a
  pre-existing migration-ordering issue (`phase10_media_assets`); use `db push`
  for fresh DBs until that's repaired._
- **New env keys** (see `.env.example`): `FIRECRAWL_API_KEY`, `BLOB_READ_WRITE_TOKEN`.
  Reused: `GOOGLE_GEMINI_API_KEY` (logo gen), `CRON_SECRET` (new crons),
  `UPSTASH_REDIS_*` (redirects).
- **Canaries:** Teloz stays website-mode (all new flags off). Solbrillen is the
  max-features canary (all new flags **on**). Northbound enables a selective set.

## v0.3.0 — 2026-05-26

### ✨ New features

#### Voice Shop (Gemini Live)

Customers can now talk directly to your storefront via Google's Gemini Live
voice model. Floating mic-FAB on storefront, server-side tool dispatch with
the same audit-log + scope-guards as your text chat.

- Opt-in per shop via `brand.features.voiceShop = true`
- Activate in `/admin/integrations` → "Voice Shop" section
- Requires Google Gemini API key (also activated in `/admin/integrations`)
- Per-session minute cap + daily cap configurable in admin
- BotID-protected token-mint in production
- Default allowed tools: `products.search`, `products.get`, `cart.add`,
  `cart.get_summary`, `discounts.try_apply` (orders.create opt-in)

See [docs/voice-shop.md](./docs/voice-shop.md).

#### Local AI v2 (Ollama / Gemma 4)

Run your storefront and admin AI on a local Ollama instance — free, private,
no cloud round-trip. Bring-your-own-model.

- `/admin/integrations` → "AI provider" section: Cloud (Anthropic) / Local
  (Ollama) / Auto (with on-error fallback)
- Live Ollama discovery + Pull-this-model button (SSE-streaming progress)
- Per-model capability tiers: read-only / low-risk-writes / all-37-tools
- Apple Silicon `-mlx` variants auto-selected on Mac
- Delete-with-confirm + total-disk-usage display
- Status pill on `/admin/*` shows provider + model + live latency

See [docs/local-ai.md](./docs/local-ai.md).

#### Admin AI Status Pill

Fixed bottom-right badge on every `/admin/*` page showing which AI is
currently driving (Cloud / Local / Auto / Degraded / Offline) with live
latency from a 30s health-check endpoint.

#### Setup-wizard branching

The `/admin/setup` AI step now offers three paths instead of two:

- **Cloud AI** — Claude Haiku 4.5 (recommended for shops)
- **Lokal AI** — Ollama with live probe and auto model-detection
- **Spring over** — configure later in `/admin/integrations`

#### Audit-log stamps

Every AI-driven tool call (text chat, voice, vibe-generation) is now
stamped with `provider`, `model`, `modality`, `sessionMinutes` so
`/admin/audit` can filter by modality (text vs voice) or provider
(anthropic vs local vs google). Existing rows backfilled to
`provider="anthropic", modality="text"`.

### 🔧 Improved

- `chatModelResolved(intent)` exposes provider/model/capabilities to callers
  that need it (audit-stamping, tool filtering). Backwards-compatible —
  legacy `chatModel()` still works.
- `MODEL_CAPABILITIES` matrix covers Claude 4.5/4.6/4.7, Gemma 4 (e2b/e4b/
  e4b-mlx/26b/31b), Gemma 3, Llama 3.x, Qwen.
- Vibe generators (theme + product-SEO + category-SEO) now force Anthropic
  even when `aiProvider="local"` — structured JSON output needs reliability.

### 🐛 Fixed

- `lib/consent.ts` split into shared + server-only so Client Components
  can import the cookie parser without triggering Next.js's `server-only`
  guard. (Phase 10 introduced this; fixed in same release.)

### 📦 Schema

New columns on `IntegrationSettings`:

- `voiceShopEnabled`, `voiceShopModel`, `voiceShopVoice`,
  `voiceShopAllowedToolsJson`, `voiceShopMaxMinutesPerSession`,
  `voiceShopMaxMinutesPerDay`, `voiceShopVisionEnabled`,
  `voiceShopLastDailyUsageJson`
- `anthropicModel`, `localAiFallbackMode`, `lastDegradedAt`,
  `lastModelDetectedAt`, `aiUsageJson`

New columns on `AuditLog`:

- `provider`, `model`, `modality`, `sessionMinutes` (+ index on `provider`)

All nullable with defaults — your existing data is untouched. Run
`npx prisma migrate dev` after upgrade.

### 📦 Dependencies

- `@ai-sdk/openai-compatible@^2.0.48` — Ollama uses OpenAI-compatible API
- `@google/genai@^2.6.0` — Gemini Live WebSocket client
- `botid@^1.5.11` — voice-token abuse protection
- `zod-to-json-schema` — converts Zod schemas to Gemini function declarations

### 💥 Migration notes

- **Voice shop is OFF by default** — set `brand.features.voiceShop = true`
  in your fork's `brand.config.ts` to opt in
- **Audit-log backfill runs automatically** in the new migration —
  existing rows get `provider="anthropic", modality="text"`
- **No breaking API changes** — existing callers of `chatModel()` work
  unchanged. New `chatModelResolved()` is opt-in for routes that want
  provider/model awareness

---

## v0.2.0

Earlier releases — see git history.
