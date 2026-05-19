# Cartwright

Private template-repo for AI-first webshops. Bygget på Next.js 16, Prisma, Stripe og MCP. Forks bruges som foundation for nye niche-shops (eyewear, fencing, etc.).

> **Denne kodebase er en template** — designet til at blive klonet per brand.
> Brug: `gh repo create my-shop --template=<din-org>/cartwright --private`
> Se [`FORK_GUIDE.md`](./FORK_GUIDE.md) for klon-proces.
> Se [`DEPLOY.md`](./DEPLOY.md) for Vercel/Turso-recipe.

## Stack

- **Next.js 16** (App Router, Server Actions, Turbopack)
- **Prisma + SQLite** (lokal dev) eller **Turso libSQL** (production)
- **Stripe** (Payment Element + webhook + mock-fallback)
- **NextAuth v5** (magic-link + credentials)
- **MCP-server** (`/api/mcp`) — eksternt AI-agent-interface
- **AI** (Anthropic Claude + Google Gemini for SEO/theme/category-genereret content)
- **Sentry** (error monitoring, no-op uden DSN)
- **Resend** (transactional email, no-op uden API-key)
- **Vercel Blob** (admin image-upload)
- **Tailwind CSS v4** (token-baseret palette i `themes/<slug>.css`)

## Kom i gang lokalt

```bash
npm install
cp .env.example .env
# Udfyld:
#   DATABASE_URL=file:./dev.db
#   AUTH_SECRET=$(openssl rand -hex 32)
#   NEXT_PUBLIC_APP_URL=http://localhost:3000
npx prisma migrate deploy
npx prisma db seed
npm run dev
# Åbn http://localhost:3000 — første visit redirector til /admin/setup
```

## Setup wizard

Ved første visit til `/admin` (uden produkter i DB) tager wizardet over og guider dig gennem:

1. Brand-identitet (storeName, domain, tagline)
2. Theme-palette (AI-genereret eller manuelt color-picker)
3. Anthropic API-key (AI-assistent)
4. Første kategori

Efter wizard kan du tilføje produkter via `/admin/produkter` og konfigurere integrations (Stripe, Resend, Gemini, Sentry) via `/admin/integrations`.

## Required env-vars

| Variabel | Hvor | Hvad |
|---|---|---|
| `DATABASE_URL` | dev + prod | SQLite-fil eller Turso libSQL URI |
| `AUTH_SECRET` | dev + prod | NextAuth JWT-secret (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | dev + prod | Canonical URL — bruges af email-links, Stripe-callback, MCP |

## Optional env-vars (graceful no-op)

| Variabel | Effekt hvis ikke sat |
|---|---|
| `ANTHROPIC_API_KEY` | AI-assistent 503'er — admin kan sætte via `/admin/integrations` |
| `GOOGLE_GEMINI_API_KEY` | SEO/theme-generator disabled — admin kan sætte via panel |
| `STRIPE_SECRET_KEY/PUBLISHABLE_KEY/WEBHOOK_SECRET` | Mock-checkout i stedet for real Stripe — admin kan sætte via panel |
| `RESEND_API_KEY` | Preview-mailer i dev, ingen email i prod |
| `SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN` | Error-tracking disabled |
| `SENTRY_ORG/PROJECT/AUTH_TOKEN` | Source-map upload disabled (build virker stadig) |
| `TURSO_DATABASE_URL/AUTH_TOKEN` | Falls back til lokal SQLite |
| `CRON_SECRET` | Vercel cron-routes 401'er |
| `BLOB_READ_WRITE_TOKEN` | Admin-image-upload disabled |

## Tests

```bash
npm test            # Vitest unit-tests (240+)
npm run test:e2e    # Playwright e2e (kræver dev-server kørende)
npx tsc --noEmit    # Typecheck
```

## Project structure

```
app/               Next.js App Router routes
  admin/           Admin-panel (CRUD + setup wizard + integrations)
  api/             API routes (webhook, mcp, assistant, cron)
components/        React components (storefront + admin)
lib/               Platform-logik
  ai/              Claude + Gemini clients + prompts
  tools/           MCP tool-registry
  orders/          Order creation + state machine
brand.config.ts    Single source of truth for brand-specifik konfig
themes/generic.css Palette + glass-presets (kopiér ved fork)
industry-templates/
  generic/         Default seed-data (cartwright shipper kun denne)
prisma/
  schema.prisma    Database schema
  migrations/      Prisma migrations (kør med migrate deploy)
  seed.ts          Seed-script (læser brand.industryTemplate)
```

## License

Private template — see fork-org policy.
