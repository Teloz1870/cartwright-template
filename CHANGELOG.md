# Changelog

Cartwright templates ship as tagged releases. `npx create-cartwright` pulls the
template at the current `DEFAULT_REF` tag (managed in `cartwright-app/apps/cli`).

A scaffolded shop is a one-shot snapshot — nothing updates it automatically. The
**Security advisories** index below is therefore the canonical place to learn whether the
engine version your shop runs (see `.cartwright/release.json`) has a known security fix you
should pull. When a release fixes a security issue, its version block gets a `### 🔒
Security` section (issue + severity + the version you must upgrade to) **and** a row is
added to the index below.

## 🔒 Security advisories

| ID | Affected versions | Fixed in | Severity | Action |
|----|-------------------|----------|----------|--------|
| _None yet_ | — | — | — | — |

## v0.24.1 — 2026-06-06

**Onboarding hardening.** Fixes scaffold/first-run failures a real Codex install surfaced. No schema
changes, no flags.

### 🐛 Fixed

- **Migration baseline regenerated.** The committed `prisma/migrations/` had drifted ~50 migrations
  behind `schema.prisma` (missing `vibeHtml`, `Page.layoutJson`, the v0 `IntegrationSettings` columns,
  …), so `prisma migrate deploy` / raw-applying migrations produced a wrong schema (`no such column:
  vibeHtml`). Collapsed to a single clean from-empty baseline that is byte-identical to the current
  schema (verified `migrate diff --exit-code` → no difference). **`db push` remains the canonical path;
  the 3 canaries deploy via `db push`, so their live DBs are unaffected.**
- **Resilient first-run DB setup** (in `create-cartwright`): the auto `prisma db push` now retries once
  on the transient Prisma 7.8 "Schema engine error", and on a real failure it surfaces the actual error
  and states that `.admin-credentials` was not created. The scaffold's baseline-regeneration step also
  had a wrong Prisma-7 flag (`--to-schema-datamodel` → `--to-schema`) that made it silently no-op —
  fixed, so fresh projects always get a correct migration baseline.
- **First login lands on the setup wizard.** After the forced first password change, the new owner is
  redirected to `/admin/setup` (previously stayed on `/admin/konto`; the wizard's empty-catalog gate
  doesn't fire once demo data is seeded). Normal later password changes are unchanged.

### 📝 Notes

- Agent-rules (`AGENTS.md`, `.claude/CLAUDE.md`) gained a one-line Prisma troubleshooting note
  (transient `db push` engine error → re-run; use `db push`, not `migrate deploy`).

## v0.24.0 — 2026-06-06

**Onboarding & first-login clarity.** No schema, no flags — a pure DX pass so a fresh shop is
sign-in-ready regardless of approach (CLI, IDE agent like Codex, or a manual clone). Prompted by a real
session where the agent couldn't log in: the admin wasn't seeded, and every surface pointed at magic-link
while a fresh install only offers password.

### ✨ New / Changed

- **`create-cartwright` now bootstraps the DB.** After installing dependencies it runs `prisma db push`
  + `prisma db seed`, so the admin user exists and `.admin-credentials` is written **before** you open the
  app. Failures are non-fatal — the CLI prints the manual commands instead. `--no-install` skips it and
  lists the steps as required.
- **Password-first login guidance, everywhere.** A fresh shop has no `RESEND_API_KEY`, so the login page
  shows only the **password** tab (magic-link appears once Resend is set; in dev its link is written to
  `.mail-previews/`). The CLI output, the seed banner, the `.admin-credentials` file, the README, all six
  agent-rules files (`AGENTS.md`, `.claude/CLAUDE.md`, Copilot, Gemini, Windsurf, Cursor), and a new
  `docs/getting-started/first-login` page now state the same flow: sign in at `/account/login` with
  `brand.emails.admin` + the seeded password → forced change at `/admin/konto` → `/admin/setup` wizard.
- **Dev-only login hint.** When email is unconfigured and `NODE_ENV !== "production"`, the login screen
  shows a one-line pointer to `.admin-credentials`. Never rendered on a deployed shop.
- **`ADMIN_PASSWORD`** documented as the way to pre-set the admin password before seeding.

## v0.23.0 — 2026-06-06

The **Visual Builder** and the **Vercel v0** generator, bridged. Both ship **flag-OFF** and
**canary-safe** — an existing shop (and each of the three canaries) is byte-identical until it opts in.

### ✨ New

- **Visual Builder** (`visualBuilderEnabled`, default-off, compile-time): a governed three-panel page
  editor at `/admin/visual-builder` — section list (add / reorder / hide) · live-preview iframe
  (`/[locale]/builder-preview`) · inspector. Output is stored as **audited data** in the new
  `Page.layoutJson` (a validated section tree: hero / featureGrid / ctaFooter / richText / vibe), never
  code written to disk. Writes go through the `pages.set_layout` tool (plan-first confirmation token +
  audit + one-click revert); an AI "generate section" action fills a section's own Zod-validated props
  (the model cannot emit arbitrary markup). A `null` `layoutJson` renders from `body` / `vibeHtml`
  exactly as before, so the storefront is unchanged when the flag is off. A shared `PageSections`
  component guarantees preview === production render.
- **Vercel v0 generator** (`v0Generator`, default-off, runtime): a second AI engine in the Vibe
  Sandbox alongside Anthropic. v0 (text→UI via the v0 Platform API) emits code; Cartwright
  **normalizes it to HTML, sanitizes it (XSS strip), and persists it as `vibeHtml`** — the
  data-not-code doctrine stays intact, no TSX hits disk. The key is admin-set (`/admin/integrations`,
  AES-256-GCM-encrypted) or `V0_API_KEY`; a daily-usage guard fails cheap before v0's limits. Adds a
  "Vercel (v0 Platform API)" GDPR processor entry (privacy tier `opt-out` by default).
- **v0 inside the Visual Builder** (Fase 1.3): a whitelisted `vibe` section bridges the two streams —
  when `v0Generator` is on, the builder's "generate section" routes the `vibe` key through v0
  (generate → extract → sanitize → `{ html }` props), so free-form v0 output flows through the **same**
  section-schema validation, `pages.set_layout` audit/confirm/revert governance, and `PageSections`
  render path as every structured section. The section sanitizes again on render (always-on XSS
  boundary). All other section keys keep the structured Anthropic `generateObject` path.

### 🛠 Migration

- Run **`pnpm db:push`** (libSQL/Turso: `prisma migrate diff` → `turso db shell`) before enabling:
  additive `Page.layoutJson` + four `IntegrationSettings` columns (`v0ApiKey`, `v0UsageJson`,
  `v0PrivacyTier` default `"opt-out"`, `v0DefaultDesignSystemId`). All nullable / lossless. Note
  `getIntegrationStatus` selects the v0 columns, so push them **before** redeploying.

### 📝 Notes

- `v0-sdk` is `^0.16.4` (beta) and the generator is inert without a key. Verified on the consolidated
  tree: `tsc` 0 errors, 857/857 vitest, `build` exit 0, the three canaries byte-identical with flags off.

## v0.22.0 — 2026-06-06

**AI-native commerce.** The catalog becomes semantically searchable, the storefront chat composes its
own product UI, the agent-commerce surfaces complete, and AI spend is metered. All additive; the new
search path has a **soft lexical fallback**, so there is no regression when embeddings aren't primed.

### ✨ New

- **Hybrid semantic product search** (Hul A): vector cosine-similarity + lexical boost on top of the
  (previously unused) `ProductEmbedding` table, with a soft fallback to pure lexical when embeddings
  aren't ready — wired into both `/api/products/search` and the `products.search` tool. Embeddings via
  `lib/ai/embeddings.ts` (Gemini `text-embedding-004` primary, local Ollama `nomic-embed-text`
  fallback). Backfill with `pnpm embeddings:backfill`.
- **pgvector / Postgres acceleration** (Hul A-2, opt-in): an optional scaling layer that pushes the
  ANN search into Postgres + a pgvector **HNSW** index for large catalogs — same ranking formula as
  the TS path, identical results. Gated behind `DATABASE_DRIVER=postgres` (+ a Postgres schema
  provider-fork that is not on `main`); the Turso/SQLite branch in `lib/db.ts` always fires first, so
  the three canaries (Teloz / Northbound / Solbrillen) are untouched. Dual-write
  (`ProductEmbedding.vectorJson` + a `vector(768)` column); setup via `pnpm pgvector:setup`. Runs on
  **Supabase Postgres** — see `docs/supabase-postgres.md` and `docs/HUL-A2-PGVECTOR.md`.
- **Model-selectable generative UI** (Hul B): the storefront chat lets the *model* choose how products
  are presented — grid / spotlight / comparison — via a whitelisted `ui.present_products` tool (the
  model picks one of three layouts + product slugs; the server fetches the data — never arbitrary
  markup). `catalog:read`, XSS-safe (the note renders as React-escaped text).
- **UCP `native_commerce`** (Hul D): the Google Merchant feed (`/feed/google.xml`) and the
  `/.well-known/ucp` capability mark catalog products as native-buyable by agents, gated on `acp`
  (+ `merchantFeed` for the capability) so the shop never advertises what it can't honor.
- **ACP checkout-completion scaffold** (Hul C): the missing `/complete` (delegated-payment) step of
  the ACP session lifecycle, as a structured **inert** scaffold behind `ACP_PAYMENT_COMPLETION=1`
  (default off). The verifiable parts (gate + status validation) are real; the one external step
  (shared-payment-token charge) throws `payment_not_wired` until Stripe SPT is connected — it can
  never accidentally move money. See `docs/HUL-C-ACP-COMPLETION.md`.
- **Token-level cost-metering** (Hul E): per-call token-usage accounting on the admin + assistant chat
  routes (`lib/ai/usage.ts`), so AI spend is observable per request.

### 📝 Notes

- The UCP `native_commerce` attribute is an emerging March-2026 Google spec — verify the exact
  attribute string against current docs before go-live (the structure + gating are correct).

## v0.21.0 — 2026-06-05

The Google Workspace modules on top of the v0.20.0 connector, plus subscriptions. All additive and
**flag-OFF**. Built / reviewed / integrated in the same overnight run as v0.20.0.

### ✨ New

- **Google Sheets ↔ catalog sync** (`sheetsSync`, default-off): Sheets API v4 via the connector —
  pull (sheet → products, upsert by SKU, never deletes), push (products → sheet, clears the range
  first so a shrunk catalog leaves no stale rows), and a combined sync with added/updated/skipped
  reporting. `CRON_SECRET`-gated `/api/cron/sheets-sync`; admin `/admin/sheets`.
- **Google Drive media + backup** (`googleDrive`, default-off): import images from a Drive folder
  into the media library (reuses `MediaAsset` + Blob + sha256 dedupe) and push DB/media backups to
  Drive (reuses `lib/backup/dump.ts`). `CRON_SECRET`-gated `/api/cron/drive-backup`; admin
  `/admin/drive`.
- **Stripe Subscriptions** (`subscriptions`, default-off): recurring billing on the existing
  `Subscription` model. Admin `/admin/subscriptions` (cancel-at-period-end), customer
  `/account/subscriptions` (start/pause/resume/cancel, scoped to own user — no IDOR). Webhook
  subscription/invoice handling is additive + flag-gated; one-off checkout unchanged when off.
- **Google Docs → content** (`docsImport`, default-off): import a Google Doc as a draft blog Post
  or `/info` Page via the connector. The converter emits Cartwright engine **markdown** (`## ` / `> `
  / `**bold**` / `- `), never HTML; content is stored with `bodyFormat="text"` and rendered through
  the existing safe `renderContentBlocks()` path (React text nodes, no `dangerouslySetInnerHTML`), so
  a shared Doc with `<script>`/`<img onerror>`/`javascript:` cannot become stored XSS. Raw-HTML
  rendering stays only for trusted admin `vibeHtml`. `docs.import` tool (`pages:write`) +
  `/admin/docs-import`. (Replaces the earlier deferred, content-sniffing design.)

### 🛠 Migration

- Run **`pnpm db:push`** (libSQL/Turso: `prisma migrate diff` → `turso db shell`): additive columns
  for sheets sync (`IntegrationSettings`/`Product`), Drive (`IntegrationSettings`/`MediaAsset`),
  subscriptions (`Subscription`), and docs import (`bodyFormat` on `Post`/`Page`, null ⇒ text). See
  the per-track migrations under `prisma/migrations/`.

### 📝 Notes

- Repo-wide hardening follow-up: cron routes treat an unset `CRON_SECRET` as open — require it.

### 🔧 Post-integration-review hardening (independent Gemini cross-track pass)

- **Receipt FX drift fixed**: the order-confirmation email now formats amounts at the order's
  snapshotted `Order.fxRate` (what the customer was charged), not the live FX cache — which is
  unprimed in the Stripe webhook/cold-serverless path and would otherwise fall back to static anchors
  and mismatch the charge when `fxAutoUpdate` is on. All four send sites forward `currency` + `fxRate`.
- **Google token-refresh race fixed**: `refreshGoogleConnectionAccessToken` is now single-flight
  (concurrent in-instance refreshes share one request) so parallel admin tasks can't clobber a
  rotated refresh token or persist a transient error state.

## v0.20.0 — 2026-06-05

Google integration foundation plus two gap-closers. Every new subsystem is additive and ships
**flag-OFF** (or, for the connector, fail-soft infra that is inert without credentials), so an
existing shop is byte-identical until it opts in.

### ✨ New

- **Google Workspace OAuth2 connector** (infra, no flag): a shared `lib/google/{oauth,client,scopes}`
  layer + admin credential UI (`/admin/integrations`, encrypted via the same AES-256-GCM pattern as
  Stripe) + a `GoogleConnection` singleton storing encrypted tokens. CSRF/PKCE-protected
  initiate/callback routes, skew-aware refresh-token rotation, and a **local-authoritative**
  disconnect (remote revoke is best-effort; local state always clears). Fail-soft: no credentials ⇒
  every Google surface is silently inert. Foundation for the Sheets/Drive/Docs modules.
- **Google Sign-In** (`googleAuth`, default-off, compile-time): a "Fortsæt med Google" button on the
  customer login via a NextAuth v5 Google provider, mirroring the existing GitHub provider
  (flag + `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). No new model — uses the OAuth-ready `Account`.
- **FX auto-refresh** (`fxAutoUpdate`, default-off): a DB override store
  (`IntegrationSettings.fxRatesJson`) read as `dbRate ?? staticAnchor`, refreshed from the ECB
  no-key daily feed by a `CRON_SECRET`-gated `/api/cron/fx-refresh`. Display (SSR + client `Price`)
  and checkout resolve the **same** rate — no price drift. Flag off ⇒ static `brand.config` anchors
  everywhere, exactly as before.

### 🐛 Fixed

- **Storefront translation rendering**: saved Product/Category translations now render on the
  storefront (PDP/PLP/category — name, description, metadata, alt text, breadcrumbs, JSON-LD),
  closing the documented v0.15 gap where translations were saved but not displayed. Fallback is
  bulletproof: a missing translation shows the base text, never empty.

### 🛠 Migration

- Run **`pnpm db:push`** (or, for libSQL/Turso, `prisma migrate diff` → `turso db shell`) before
  enabling: new `GoogleConnection` table + `IntegrationSettings.googleOAuthClientId` /
  `googleOAuthClientSecret` / `fxRatesJson`. All additive.

### 📝 Notes

- Security follow-up (applies to GitHub auth too): OAuth providers use
  `allowDangerousEmailAccountLinking`; optionally deny OAuth sign-in for admin-role accounts via a
  `callbacks.signIn` check. Tracked, not a v0.20.0 blocker.

## v0.19.0 — 2026-06-04

Security hardening, the missing "finished package" customer surfaces, and an onboarding/credential
UX revamp. The headline: **no more hardcoded `admin1234`** — the seed now generates a strong random
admin password (forced change on first login) and a new owner can always find it. Most items are
additive; three new columns need `pnpm db:push` before enabling (see Migration).

### ✨ New

- **Secure-by-default admin credentials** (#113): the seed generates a strong random password (or
  honors `ADMIN_PASSWORD`), stores `User.mustChangePassword`, and the admin layout forces a change at
  the new `/admin/konto` page before any other admin access. No hardcoded default anywhere.
- **Password-reset flow** (#114): `/account/forgot-password` + `/account/reset-password` for all
  users — HMAC-hashed single-use tokens (`PasswordResetToken`), 1h TTL, no email-enumeration,
  Resend-delivered, per-email + per-IP rate-limited.
- **Contact-form image attachments** (#115, flag `contactAttachments`, default-off): image-only,
  ≤5MB, magic-byte-validated uploads to Vercel Blob, shown as thumbnails in `/admin/henvendelser`.
  `/api/inquiries` gains a per-IP spam rate-limit. New `Lead.attachmentUrls`.
- **Customer account-settings** (#116): `/account/settings` — edit profile (name/phone/shipping) and
  change password (or set one for magic-link-only accounts).
- **Default legal pages** (#117): privacy / terms / cookie policy render from templated defaults
  (built from `brand.config`) when no CMS page exists — the footer no longer 404s on a fresh shop.
- **Self-service GDPR export** (#118): a "Download my data" button on `/account` streams the full
  DSAR JSON (own data only, session-scoped), per-user rate-limited.
- **Onboarding & credential UX** (#119–#121): the seed also writes the generated password to a
  gitignored `.admin-credentials` (+ a boxed banner) so it's never lost; `docs/getting-started.md`
  explains the first-login flow; the login screen hides "forgot password"/magic-link when email
  isn't configured (no `.mail-previews/` dead-ends); and the setup wizard's **"Email & Domæne"** step
  now actually persists the sender identity (`emailAdmin`/`emailFrom`/`emailFromName`, read by
  `getBrand()`) and can turn on Resend in place.

### 🛠 Migration

- Run **`pnpm db:push`** before enabling: new `User.mustChangePassword`, `PasswordResetToken` table,
  `Lead.attachmentUrls`. All additive. Prisma 7's CLI can't push to libSQL directly — apply to Turso
  via `prisma migrate diff` → `turso db shell` (see internal runbook).

### 📝 Notes

- Known follow-up: the live `ResendMailer` sender (`from`) still reads the static `brand.config`, not
  the `getBrand()` DB override the wizard now writes — aligning them is tracked separately.

## v0.18.0 — 2026-06-04

Dependency + infrastructure modernization (Master-Spec "Track 4"): **Prisma 7**, current Stripe API,
native Tailwind v4.3 utilities, and an optional marketing-automation hook.

### ✨ New

- **Prisma 7** (#110): the Rust-free `prisma-client` generator (ESM TS client at
  `app/generated/prisma`) + required libSQL driver adapter. `prisma.config.ts` holds the CLI
  datasource; runtime connects via the adapter in `lib/db.ts`. Seed runs through `tsx`.
- **`marketingAutomations`** (#112, flag, default-off): emits `welcome` / `cart.abandoned` /
  `order.placed` lifecycle events to Resend Automations.
- **Stripe SDK 22.2.0** + apiVersion `2026-05-27.dahlia` (#108); native **Tailwind v4.3** scrollbar
  utilities replace ad-hoc CSS on overflow panels.
- **Docs** (#109): API-key security, scopes/tools, MCP architecture, and an optional Supabase/Postgres
  path. Removed the vestigial `package-lock.json` (#111, pnpm-only).

### 📝 Notes

- Prisma 7 is a major dep bump; smoke-test against live Turso before promoting a fork to production.

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
