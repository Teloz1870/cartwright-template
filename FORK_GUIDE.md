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
npm install
cp .env.example .env
# Sæt DATABASE_URL=file:./dev.db, AUTH_SECRET=$(openssl rand -hex 32),
#     NEXT_PUBLIC_APP_URL=http://localhost:3000
npx prisma migrate deploy
npx prisma db seed
npm run dev
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
