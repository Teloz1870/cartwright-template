# Master integration report — `merge/all-tracks`

All twelve feature tracks built in the session, integrated into one branch off
`main`. **Not pushed, not deployed.** `main` itself is untouched; the three
canaries are untouched. Per-track detailed reports live on each `feat/*` branch.

## What was integrated (9 merges, 12 tracks)

Two tracks were stacked, so 9 branch tips brought in all 12:

| Track | Branch (tip) | Brought in | Adds |
|---|---|---|---|
| A — Resolvable Genome | `feat/seo-geo-autopilot` ⤳ | `feat/genome-kernel` | `lib/genome/*`, `genomeJson`, `genomeResolve` flag, `/admin/genome` |
| K — SEO/GEO Autopilot (Pro) | `feat/seo-geo-autopilot` | — | `lib/seo/*`, Seo/Geo/Experiment models, `seoAutopilot` flag, `/admin/seo-performance`, `seo-snapshot` cron |
| F — Firecrawl scraper | `feat/hoptify` ⤳ | `feat/firecrawl-scraper` | `lib/scrape/*`, scraper tool, `/admin/produkter/scrape` |
| I — Design importer | `feat/hoptify` ⤳ | `feat/design-import` | `lib/design-import/*`, `designImport` flag, `/admin/design-import` |
| Hoptify | `feat/hoptify` | — | `designs/hoptify/*`, `lib/hoptify/*`, `lib/ai/logo-gen.ts`, `hoptify`+`logoGenerator` flags, `/admin/hoptify` |
| B — GDPR/DSAR | `feat/gdpr-dsar` | — | `lib/gdpr/*`, `DataErasureRequest`, processors/retention, `/admin/processors`, cleanup+audit crons |
| C — Backup | `feat/backup` | — | backup script + `/api/cron/backup` |
| D — Blog | `feat/blog` | — | `Post` model, `blog` flag, `/blog` + feed + `/admin/blog` |
| E — Indexing controls | `feat/noindex-controls` | — | `seoIndexing`/`aiCrawlers` settings, robots/meta wiring |
| J — Tax + invoicing | `feat/tax-invoicing` | — | `lib/tax/*`, `stripeTax` flag, `vatRatePct`/`pricesIncludeVat` |
| G — Shipping/fulfillment | `feat/shipping-fulfillment` | — | Shipping/Rate/Supplier/Fulfillment models, `shippingZones` flag, `/admin/shipping` |
| H — Woo-parity | `feat/woo-parity` | — | Wishlist/Redirect/Subscriber models, `wishlist`+`abandonedCart` flags, CSV import/export, translations UI, redirects, abandoned-cart cron |

## Conflict resolution (all union-merges, no logic lost)

Conflicts were confined to the shared registries every track appends to:
`brand.config.ts` (features), `lib/feature-flags/manifest.ts` (descriptors),
`prisma/schema.prisma` (models + settings columns), `app/admin/layout.tsx` (nav),
`app/admin/produkter/page.tsx` (toolbar), `vercel.json` (crons),
`lib/tools/registry.ts` (tool registration). Each was resolved by **taking the
union** — every flag, descriptor, model, nav entry, cron, and tool from all
tracks is present. `OVERNIGHT-REPORT.md` was reduced to a pointer to this file
(per-track reports remain on their branches).

## Verification (on the fully integrated branch)

- `npx prisma validate` + `npx prisma generate`: **schema valid**, client generated.
- `npx tsc --noEmit`: **zero new errors** — only the single pre-existing
  `tests/unit/checkout-action.test.ts` import error that is already present on `main`.
- `pnpm build`: **passes**; new routes mounted (`/api/wishlist`, `/api/wishlist/toggle`,
  `/blog/feed.xml`, `/admin/hoptify`, `/admin/seo-performance`, `/admin/shipping`,
  `/admin/processors`, `/admin/redirects`, `/admin/translations`, …).
- `npx vitest run`: every **track-specific** suite passes (genome, seo-autopilot,
  hoptify ×3, gdpr, design-import, scraper, shipping, tax, woo). The 35 failing
  tests are **pre-existing environmental failures** (Intl locale formatting + i18n:
  `format`, `discount`, `trust-badges`, `api-auth`, `orders-create`, …) — verified
  to fail **identically on clean `main`**, so they are not introduced by this merge.

## Flags — all default OFF

Every new subsystem ships behind a `brand.features.*` flag defaulting to `false`
(`genomeResolve`, `seoAutopilot`, `designImport`, `hoptify`, `logoGenerator`,
`blog`, `stripeTax`, `shippingZones`, `wishlist`, `abandonedCart`). Flag-off = the
engine behaves exactly as `main` does today. Nothing surprises an existing shop.

## Before this becomes live (operator steps — NOT done here)

1. **Review** this branch against the three-canary discipline in `CLAUDE.md`
   (`/da` website-mode + `/da/produkter` webshop both load clean).
2. **DB migration**: each track shipped its own migration SQL; run
   `pnpm db:push` (or the Turso migrate script) against a fresh DB and confirm the
   merged schema applies cleanly before touching any canary DB.
3. **Go-live keys** (per feature, all optional/default-off): `FIRECRAWL_API_KEY`
   (F/I/Hoptify), Gemini key + `BLOB_READ_WRITE_TOKEN` (logo generator/voice),
   GSC OAuth (SEO autopilot), Stripe Tax enabled in Stripe dashboard (tax),
   `CRON_SECRET` (all crons), `RESEND_*` (abandoned-cart/newsletter).
4. **Smoke** before and after any deploy. On your own deployment that is
   `bash scripts/verify-deploy.sh <url>` (any URL, no prior knowledge needed).
   Cartwright's own three-canary rollout additionally runs the engine-internal
   canary gate, which asserts each canary's identity, mode, design markers and
   internal links. The two checks overlap only partly — the canary gate goes
   deeper on identity but does not look at robots/sitemap/llms at all — and it
   only makes sense against those three sites.
5. Only then fast-forward `main` and let the mirror/tag pipeline run.

## Rollback

`git checkout main && git branch -D merge/all-tracks`. Nothing pushed, nothing
deployed, no canary touched. The individual `feat/*` branches remain intact.
