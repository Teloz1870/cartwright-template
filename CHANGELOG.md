# Changelog

Cartwright templates ship as tagged releases. `npx create-cartwright` pulls the
template at the current `DEFAULT_REF` tag (managed in `cartwright-app/apps/cli`).

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
