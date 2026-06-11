# Fork Guide — Klon Cartwright til en ny niche-shop

Denne template er designet til at blive klonet for hvert nyt brand. Hver fork får sit eget Git-repo, Vercel-deploy, Turso-DB og integration-key-sæt.

## 1. Klon template

```bash
gh repo create my-shop --template=<din-org>/cartwright --private
git clone git@github.com:<din-org>/my-shop.git
cd my-shop
```

## 2. Lokal opstart

```bash
pnpm install
cp .env.example .env
# Sæt DATABASE_URL=file:./dev.db, AUTH_SECRET=$(openssl rand -hex 32),
#     NEXT_PUBLIC_APP_URL=http://localhost:3000
pnpm db:push
pnpm seed
pnpm dev
```

## 3. Tilpas brand-overflader

Cartwright shipper med "Cartwright Demo Store" placeholder-værdier. Du ændrer disse til dit nye brand. **Du behøver kun røre disse filer:**

| Fil | Hvad ændres |
|---|---|
| `brand.config.ts` | storeName, domain, emails, tagline, uiLabels, policies, currency, stripeAppearance, emailColors |
| `themes/generic.css` | Hex-værdier på `--color-sol-*` tokens (eller rename filen til `themes/<din-slug>.css`) |
| `app/globals.css` | Hvis du renamede theme-filen: opdatér `@import "../themes/<slug>.css"` |
| `lib/ai/prompts/generic.ts` | AI-voice, brand-eksempler, domæne-termer (eller kopiér til `prompts/<slug>.ts`) |
| `lib/ai/prompts/index.ts` | Registrér ny prompt-modul i `PROMPT_MODULES` |
| `app/manifest.ts` | `theme_color` + `background_color` så de matcher din palette |
| `package.json` | `"name"` field |

### Feature-flags (`brand.config.ts` → `features`)

Hver feature er bag et flag og er **default-off** — din fork opfører sig som en ren
shop indtil du tænder noget. Den fulde liste med metadata er
`lib/feature-flags/manifest.ts`. v0.10.0-flag du kan tænde: `blog`, `wishlist`,
`abandonedCart`, `shippingZones`, `stripeTax`, `designImport`, `hoptify`,
`logoGenerator`, `seoAutopilot` (Pro), `genomeResolve`. Nogle kræver en key for at
virke (se næste afsnit) — uden key falder de fail-soft tilbage, så det er sikkert at
tænde flaget før key'en er på plads.

Undtagelsen fra "default-off": **`cartwrightBadge`** er **default-on** — det er det
deletable "Built with Cartwright"-referral-mærke (à la "Made with Framer") i footeren, som
også styrer `SoftwareApplication`-JSON-LD på `/built-with-cartwright` og "Built with
Cartwright"-blokken i `llms.txt`. Vil din fork ikke vise det, så sæt `cartwrightBadge: false`
i `brand.config.ts` (eller slå det fra i `/admin/features`).

**Keys pr. feature** (env eller `/admin/integrations`):

- `FIRECRAWL_API_KEY` → Firecrawl-scraper, `designImport`, Hoptify ægte-import.
- `BLOB_READ_WRITE_TOKEN` + `GOOGLE_GEMINI_API_KEY` → `logoGenerator`.
- Stripe Tax (`stripeTax`) + GSC-OAuth (`seoAutopilot`) → sættes i `/admin/integrations`.
- `CRON_SECRET` → backup/abandoned-cart/cleanup/seo-snapshot-cron'ene.

## 4. Tilføj egen industry-template (valgfrit)

Cartwright shipper kun `industry-templates/generic/`. For at få mere domæne-relevant seed-data:

```bash
cp -r industry-templates/generic industry-templates/<din-slug>
# Redigér industry-templates/<din-slug>/seed-data.ts: categories, products, pages
```

Registrér den i `industry-templates/index.ts`:

```ts
import { mySlugTemplate } from "./<din-slug>/seed-data";

const TEMPLATES: Record<string, IndustryTemplate> = {
  generic: genericTemplate,
  "<din-slug>": mySlugTemplate,
};
```

Sæt `brand.industryTemplate = "<din-slug>"` i `brand.config.ts`.

### Machine-editable surfaces

#### `layoutJson` (DB: `BrandingSettings.layoutJson`)

Runtime override af Studio homepage section-order/visibility. Kræver feature-flag
`sectionLayout: true`. Brug MCP-tool `design.set_layout`; læs current state med
`design.get_layout`.

Required sections kan ikke skjules: `hero`, `ctaFooter`.

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

Runtime override af de 6 base colors. v0.16.0 understøtter også optional
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

Injection guards: `radius.*` skal matche `^\d+(\.\d+)?(px|rem|em|%)$`.
`font-family` må ikke indeholde `{`, `}`, `<`, `;`.

`fonts.sans` ændrer kun CSS family name (`--font-sans`). Det loader ikke nye
webfonts via `next/font`; font-load pipeline skal ændres separat.

#### `products.json` (seed overlay)

Hvis en fork skal kunne redigere produktseed maskinelt, så læg en JSON-array i
`prisma/products.json`. Filen er en overlay: hvis den findes og validerer,
bruger `pnpm seed` produkterne derfra i stedet for `industry-templates`.

Schemaet spejler `SeedProduct`: `name`, `slug`, `description`, `priceDkk`,
`images`, `stock` og `categorySlug` er required; `frameColor`, `lensColor`,
`brand` og `featured` er optional. `priceDkk` er i ØRE, ikke kroner — undgå
100x-fejlen: `19900` betyder 199 kr., ikke 19.900 kr. Ukendt `categorySlug`
giver en warning og produktet springes over. Malformed JSON eller schemafejl
stopper seed med exit 1 og viser række + felt, fx
`products.json[2].slug`.

## 5. Setup-wizard på første visit

Når du første gang åbner `/admin` redirector wizardet dig automatisk til `/admin/setup`. Det dækker:

- Brand-identitet (storeName, tagline)
- Theme-palette (AI-genereret hvis Gemini-key er sat)
- API-keys (Anthropic for AI, Stripe for betalinger, Resend for email, Gemini for SEO)
- Første kategori

Du kan også springe wizardet over og konfigurere alt manuelt via `/admin/integrations`.

## 6. Production deploy

Se [`DEPLOY.md`](./DEPLOY.md).

## 7. Gotchas

- **CSS-token-prefix `--color-sol-*` bevares** i cartwright (~1000+ className-refs gør rename for dyrt i v0.1). Du beholder dem som "primary brand color"-prefix uanset niche. Senere breaking-PR kan rename til `--color-brand-*`.
- **Prisma Product-felter `frameColor`, `lensColor`, `brand`** er nullable legacy-felter fra cartwright's eyewear-oprindelse. Nye niche-shops bør bruge `Product.attributes` JSON-feltet til domæne-specifikke attributter.
- **Sentry org/project** læses fra env (`SENTRY_ORG`, `SENTRY_PROJECT`) — sæt dem i Vercel-projekt-env-vars så dine fejl ikke ryger til cartwright-skabelonens Sentry-projekt.
- **Migration-strategi:** Cartwright-forks har deres egen migrations-tree fra fork-tidspunktet. Nye platform-features i cartwright sync'es manuelt til forks (cherry-pick eller manual rewrite). Ingen automatic upstream-merge.
