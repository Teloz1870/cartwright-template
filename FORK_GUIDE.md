# Fork Guide — Clone Cartwright into a new niche shop

This template is designed to be cloned for every new brand. Each fork gets its own Git repo, Vercel deploy, Turso DB and integration key set.

## 1. Clone the template

```bash
gh repo create my-shop --template=<your-org>/cartwright --private
git clone git@github.com:<your-org>/my-shop.git
cd my-shop
```

## 2. Local startup

```bash
pnpm install
cp .env.example .env
# Set DATABASE_URL=file:./dev.db, AUTH_SECRET=$(openssl rand -hex 32),
#     NEXT_PUBLIC_APP_URL=http://localhost:3000
pnpm db:push
pnpm seed
pnpm dev
```

## 3. Customize the brand surfaces

Cartwright ships with "Cartwright Demo Store" placeholder values. You change these to your new brand. **You only need to touch these files:**

| File | What changes |
|---|---|
| `brand.config.ts` | storeName, domain, emails, tagline, uiLabels, policies, currency, stripeAppearance, emailColors |
| `themes/generic.css` | Hex values on the `--color-sol-*` tokens (or rename the file to `themes/<your-slug>.css`) |
| `app/globals.css` | If you renamed the theme file: update `@import "../themes/<slug>.css"` |
| `lib/ai/prompts/generic.ts` | AI voice, brand examples, domain terms (or copy to `prompts/<slug>.ts`) |
| `lib/ai/prompts/index.ts` | Register the new prompt module in `PROMPT_MODULES` |
| `app/manifest.ts` | `theme_color` + `background_color` so they match your palette |
| `package.json` | `"name"` field |

### Feature flags (`brand.config.ts` → `features`)

Every feature sits behind a flag and is **default-off** — your fork behaves like a plain
shop until you turn something on. The full list with metadata is in
`lib/feature-flags/manifest.ts`. v0.10.0 flags you can enable: `blog`, `wishlist`,
`abandonedCart`, `shippingZones`, `stripeTax`, `designImport`, `hoptify`,
`logoGenerator`, `seoAutopilot` (Pro), `genomeResolve`. Some require a key to
work (see the next section) — without a key they fall back fail-soft, so it's safe to
turn the flag on before the key is in place.

The exception to "default-off": **`cartwrightBadge`** is **default-on** — it's the
deletable "Built with Cartwright" referral badge (à la "Made with Framer") in the footer, which
also controls the `SoftwareApplication` JSON-LD on `/built-with-cartwright` and the "Built with
Cartwright" block in `llms.txt`. If your fork shouldn't show it, set `cartwrightBadge: false`
in `brand.config.ts` (or turn it off in `/admin/features`).

**Keys per feature** (env or `/admin/integrations`):

- `FIRECRAWL_API_KEY` → Firecrawl scraper, `designImport`, Hoptify real import.
- `BLOB_READ_WRITE_TOKEN` + `GOOGLE_GEMINI_API_KEY` → `logoGenerator`.
- Stripe Tax (`stripeTax`) + GSC OAuth (`seoAutopilot`) → set in `/admin/integrations`.
- `CRON_SECRET` → the backup/abandoned-cart/cleanup/seo-snapshot crons.

## 4. Add your own industry template (optional)

Cartwright ships only `industry-templates/generic/`. To get more domain-relevant seed data:

```bash
cp -r industry-templates/generic industry-templates/<your-slug>
# Edit industry-templates/<your-slug>/seed-data.ts: categories, products, pages
```

Register it in `industry-templates/index.ts`:

```ts
import { mySlugTemplate } from "./<your-slug>/seed-data";

const TEMPLATES: Record<string, IndustryTemplate> = {
  generic: genericTemplate,
  "<your-slug>": mySlugTemplate,
};
```

Set `brand.industryTemplate = "<your-slug>"` in `brand.config.ts`.

### Machine-editable surfaces

#### `layoutJson` (DB: `BrandingSettings.layoutJson`)

Runtime override of the Studio homepage section order/visibility. Requires the feature flag
`sectionLayout: true`. Use the MCP tool `design.set_layout`; read the current state with
`design.get_layout`.

Required sections cannot be hidden: `hero`, `ctaFooter`.

Legal `sectionKeys`: `hero`, `valueProps`, `featureGrid`, `howItWorks`,
`stackGrid`, `ctaFooter`.

```json
{
  "sections": [
    { "key": "hero", "enabled": true },
    { "key": "featureGrid", "enabled": true },
    { "key": "valueProps", "enabled": true },
    { "key": "howItWorks", "enabled": false },
    { "key": "stackGrid", "enabled": true },
    { "key": "ctaFooter", "enabled": true }
  ]
}
```

#### `themeJson` (DB: `BrandingSettings.themeJson`)

Runtime override of the 6 base colors. v0.16.0 also supports optional
`fonts.sans`, `fonts.mono`, `radius.md`, `radius.lg`, `radius.xl`.

```json
{
  "accent": "#1e3f5a",
  "accentDeep": "#0f2438",
  "cream": "#f4efe6",
  "sand": "#e8e1d3",
  "ink": "#1a1a1a",
  "muted": "#726d62",
  "fonts": {
    "sans": "Inter, ui-sans-serif, system-ui, sans-serif",
    "mono": "JetBrains Mono, ui-monospace, monospace"
  },
  "radius": {
    "md": "8px",
    "lg": "12px",
    "xl": "1.25rem"
  }
}
```

Injection guards: `radius.*` must match `^\d+(\.\d+)?(px|rem|em|%)$`.
`font-family` may not contain `{`, `}`, `<`, `;`.

`fonts.sans` only changes the CSS family name (`--font-sans`). It does not load new
webfonts via `next/font`; the font-load pipeline must be changed separately.

#### `products.json` (seed overlay)

If a fork needs to be able to edit the product seed programmatically, place a JSON array in
`prisma/products.json`. The file is an overlay: if it exists and validates,
`pnpm seed` uses the products from there instead of `industry-templates`.

The schema mirrors `SeedProduct`: `name`, `slug`, `description`, `priceDkk`,
`images`, `stock` and `categorySlug` are required; `frameColor`, `lensColor`,
`brand` and `featured` are optional. `priceDkk` is in CENTS, not whole units — avoid
the 100x error: `19900` means 199, not 19,900. An unknown `categorySlug`
produces a warning and the product is skipped. Malformed JSON or a schema error
stops the seed with exit 1 and shows the row + field, e.g.
`products.json[2].slug`.

## 5. Setup wizard on first visit

The first time you open `/admin`, the wizard automatically redirects you to `/admin/setup`. It covers:

- Brand identity (storeName, tagline)
- Theme palette (AI-generated if a Gemini key is set)
- API keys (Anthropic for AI, Stripe for payments, Resend for email, Gemini for SEO)
- First category

You can also skip the wizard and configure everything manually via `/admin/integrations`.

## 6. Production deploy

See [`DEPLOY.md`](./DEPLOY.md).

## 7. Gotchas

- **The CSS token prefix `--color-sol-*` is kept** in cartwright (~1000+ className refs make a rename too costly in v0.1). You keep them as the "primary brand color" prefix regardless of niche. A later breaking PR may rename them to `--color-brand-*`.
- **The Prisma Product fields `frameColor`, `lensColor`, `brand`** are nullable legacy fields from cartwright's eyewear origin. New niche shops should use the `Product.attributes` JSON field for domain-specific attributes.
- **The Sentry org/project** is read from env (`SENTRY_ORG`, `SENTRY_PROJECT`) — set them in your Vercel project env vars so your errors don't end up in the cartwright template's Sentry project.
- **Migration strategy:** Cartwright forks have their own migrations tree from the moment of the fork. New platform features in cartwright are synced manually to forks (cherry-pick or manual rewrite). No automatic upstream merge.
