# Hoptify — Cartwright's tongue-in-cheek pendant to Shopify

Branch: `feat/hoptify` (off `feat/design-import` → inherits Firecrawl scraper +
design-importer). Additive, flag-gated, default-off. **Not pushed, not deployed.**
Main + the three canaries are untouched.

## What it is

A playful new identity for the Cartwright engine: a familiar Shopify-style storefront
**design** + a parody **"import from Shopify" onboarding** that ribs the incumbents
while *genuinely* letting a merchant switch — plus a **Gemini logo generator** so any
shop can mint its own mark. Clearly a parody/switch-campaign, not a trade-dress clone:
our own "Hoptify green" (not Shopify's shade), our own wordmark, "Powered by Cartwright"
visible throughout, satirical copy.

## Delivered

### HOP0 — Hoptify DesignPack (`designs/hoptify/`)
- `index.ts`: `hoptifyDesign` — slug `hoptify`, mode `webshop`, own green palette
  (`#2f9e54` accent), `applyPaletteAsTheme` maps palette → sol-*/cw- tokens.
- `homepage.tsx`: Server Component — Shopify-pendant look (hero "Din butik. Uden
  huslejen.", bestsellers grid, "Hop off Shopify" switch-pitch [0 kr husleje / AI-først
  / du ejer den], category grid, "Powered by Cartwright 2.0 Engine").
- `design.md` spec; registered in `designs/index.ts` (DESIGNS) + `designs/options.ts`
  (DESIGN_OPTIONS) → selectable in `/admin/designs`.

### HOP1 — "Hop off Shopify" hybrid onboarding
- `lib/hoptify/migrate.ts` `migrateFromShopify(input, actor)`: **always** applies the
  Hoptify design; with a URL + `FIRECRAWL_API_KEY` it does the **real** import —
  palette via `extractDesignTokens`→`applyDesignPalette` (Track I) + products via
  `scrapeProduct` (Track F) into a `hoptify-import` category. Fail-soft → "demo" mode.
  Audited (`hoptify.migrate`), invalidates theme cache.
- `/admin/hoptify` page + `HopMigrate` client: cheeky animated "migration" theater
  ("Befrier dine produkter fra abonnementet…", "Fjerner den månedlige husleje 💸…")
  while the real action runs; result panel.
- `features.hoptify` flag (default off) + manifest descriptor + nav entry.

### HOP2 — Gemini logo generator
- `lib/ai/logo-gen.ts` `generateLogoImage(prompt)`: text-to-image via the existing
  `gemini-2.5-flash-image` path (`composeWithReferenceImages`, 0 refs). Fail-soft on
  missing key / safety-block / rate-limit (returns `{ok:false}`, never throws to UI).
- `generateLogoWithGemini` action: generate → Vercel Blob `put` → save
  `logoImageUrl` + `invalidateBrandCache`. Flag-gated, fail-soft on Blob.
- `LogoForm` gains a gated "🎨 Generér med Gemini" raster section.
- `features.logoGenerator` flag (default off) + manifest descriptor.
- `designs/hoptify/LOGO.md`: how to slot the owner's finished AI-Studio logo **or**
  generate one in-app.

## Verification
- `npx vitest run` (Hoptify suites): **7 green** — design registration (1),
  migrate real-path import + demo fail-soft (2), logo-gen key/no-key/safety/empty (4).
- `npx tsc --noEmit`: zero new errors (only the pre-existing
  `checkout-action.test.ts` import error, unrelated).
- `pnpm build`: passes; `/admin/hoptify` in the route manifest.
- Flag-off = unchanged: Hoptify is just another optional design; onboarding + logo-gen
  sit behind default-false flags.

## Go-live (owner provides at deploy)
- The **Hoptify logo file** (SVG preferred) → slot per `designs/hoptify/LOGO.md`.
- `FIRECRAWL_API_KEY` (shared with Tracks F/I) → enables the real import path.
- Gemini key (`GOOGLE_GEMINI_API_KEY` or `/admin/integrations`) + `BLOB_READ_WRITE_TOKEN`
  → enables the logo generator.

## Honest scope / deferred
- Import v1 brings the **look** (palette) + **sample products** from the product URLs
  you paste; full-catalog crawl (sitemap/collection walk) is a documented enhancement.
- Logo generator returns a single raster candidate; multi-candidate "agent preview"
  gallery is a future polish.

## Trademark note (responsible)
Built as parody/switch-campaign, not a clone: distinct palette + wordmark, "Powered by
Cartwright" visible, satirical copy. Inspired-by, not trade-dress copy. Worth a quick
legal glance before any public launch given the deliberate Shopify reference.

## Rollback
`git branch -D feat/hoptify` (sits on top of `feat/design-import`).
