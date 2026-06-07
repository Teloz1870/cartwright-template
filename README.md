# Cartwright — the AI-first Next.js + Stripe e-commerce template

**Scaffold a fully-featured, self-hosted webshop, corporate website, or agent-marketplace
in minutes — and own every line of code.** No SaaS lock-in, no per-order fees, no platform
tax. Cartwright is an open-source commerce + AI engine built on Next.js 16, React 19,
Stripe, Prisma and the Model Context Protocol.

```bash
npx create-cartwright
```

🌐 **[cartwright.app](https://cartwright.app)** · 📦 **[Source & template](https://github.com/Teloz1870/cartwright-template)** · 🛍️ Live demos: [solbrillen.dk](https://solbrillen.dk) (eyewear, max-features) · [demo.cartwright.app](https://demo.cartwright.app) (coffee, modern shop)

> _Looking for a Shopify alternative or a free Next.js Stripe starter kit? Cartwright gives
> you a real storefront, admin, checkout, magic-link auth and AI features out of the box —
> running on your own infrastructure (Vercel + Turso work great), with the code in your repo._

<!-- TODO: add a hero GIF of voice/vision shopping + admin here, and 2-3 screenshots. -->

## Why Cartwright

- **You own the code.** It's a template you fork/scaffold, not a hosted account. Cancel nothing.
- **AI-native, not bolted-on.** Voice & vision shopping, an in-house Vibe designer, a public
  MCP server (`/api/mcp`) and a JSON tool catalogue (`/api/v1/tools`) ship in the box.
- **Built to be cited by AI.** JSON-LD structured data on every page, `llms.txt`,
  `sitemap.xml`, `.well-known/ucp` + `mcp.json`, and an AI-crawler-friendly `robots.txt`.
- **Protocol-complete for agentic commerce.** MCP (external agents), ACP (ChatGPT Instant
  Checkout incl. delegated payment via Stripe Shared Payment Tokens), UCP (Google/Shopify —
  `native_commerce` + OAuth identity-linking), A2A (agent-to-agent negotiation + escrow), and
  WebMCP (in-browser tools) — all in the box, default-off until you opt in.
- **Three modes, one engine.** `website` (corporate), `webshop` (full e-commerce), or
  `agent-marketplace` — selected by `brand.mode` in `brand.config.ts`.
- **The golden stack.** Next.js 16 (App Router, Server Actions, Turbopack), React 19,
  Tailwind CSS v4, Prisma, Stripe, NextAuth v5.

## Features

- **Storefront**: PLP/PDP, cart, checkout (Stripe Payment Element + webhook + mock
  fallback), account, magic-link auth, reviews, wishlist.
- **Admin**: products, orders, content, integrations, AI prompts, analytics, performance,
  plus a no-code Vibe sandbox to build pages from natural-language prompts.
- **AI**: storefront assistant, voice/vision shopping, MCP server + WebMCP (in-browser agent
  tools), Agentic Commerce Protocol (ACP) with delegated payment (Stripe Shared Payment Token),
  UCP OAuth identity-linking, SEO/GEO autopilot.
- **Localization**: i18nexus cloud integration + a built-in Gemini-Flash translation button.
- **Commerce ops** (v0.10.0): shipping zones + fulfillment, Stripe Tax / VAT, blog + RSS,
  GDPR/DSAR, design-import from a URL (Firecrawl), abandoned-cart recovery, CSV import.
- **AI-discoverability** (v0.11.0): `SoftwareApplication` JSON-LD + a "Built with Cartwright"
  block in `llms.txt` so AI assistants can recommend the engine, plus agent-rules for Gemini
  and Windsurf. All gated by the default-on, deletable `cartwrightBadge` flag.

Every non-trivial subsystem is behind a `brand.features.*` flag (default-off unless noted).
The authoritative list with metadata is [`lib/feature-flags/manifest.ts`](./lib/feature-flags/manifest.ts);
full release notes in [`CHANGELOG.md`](./CHANGELOG.md). Every shop also ships a live
[`/built-with-cartwright`](https://cartwright.app) capability tour (deletable per shop).

## Quickstart

```bash
npx create-cartwright my-store   # scaffold + install + db push + db seed (prints your admin login)
cd my-store
npm run dev                      # http://localhost:3000
```

`create-cartwright` writes `.env.local` (a generated `AUTH_SECRET` + `DATABASE_URL=file:./dev.db`),
installs dependencies, creates the schema, and seeds the admin user + demo data. The seed prints your
admin **email + password** and saves them to a gitignored **`.admin-credentials`** file.

**Sign in:** open **`/account/login`** → the **Password** tab → email = `brand.emails.admin` (from
`brand.config.ts`), password = the value in `.admin-credentials` (`cat .admin-credentials`). First login
forces a password change at `/admin/konto`; then the `/admin/setup` wizard guides brand → theme → keys →
first category. Magic-link sign-in only appears once you set `RESEND_API_KEY` (in dev the link is written
to `.mail-previews/`) — until then password is the only method, by design.

> **Manual clone (no CLI)?** `npm install`, make sure `.env.local` has `AUTH_SECRET` +
> `DATABASE_URL=file:./dev.db`, then `npx prisma db push && npx prisma db seed && npm run dev`.

> **New here?** [`docs/getting-started.md`](./docs/getting-started.md) walks you from scaffold to your
> first admin login in detail.

## Stack

- **Next.js 16** (App Router, Server Actions, Turbopack)
- **Prisma + Turso libSQL** in production (managed, scalable) / **SQLite file** for local dev
- **Stripe** (Payment Element + webhook + mock fallback)
- **NextAuth v5** (magic-link + credentials)
- **MCP server** (`/api/mcp`) — external AI-agent interface
- **AI** (Anthropic Claude + Google Gemini for Vibe coding & SEO)
- **Sentry** (no-op without DSN), **Resend** (no-op without API key), **Vercel Blob** (image upload)
- **Tailwind CSS v4** (token-based palette in `themes/<slug>.css`)

## Required env vars

| Variable | Where | What |
|---|---|---|
| `DATABASE_URL` | dev | SQLite file for local dev (`file:./dev.db`) |
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | **prod** | Production DB (Turso libSQL). Required in prod — the app refuses to boot without it |
| `AUTH_SECRET` | dev + prod | NextAuth JWT secret (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | dev + prod | Canonical URL — used by email links, Stripe callback, MCP |

### Optional env vars (graceful no-op)

| Variable | Effect if unset |
|---|---|
| `ANTHROPIC_API_KEY` | AI assistant 503s — set via `/admin/integrations` |
| `GOOGLE_GEMINI_API_KEY` | SEO/theme generator disabled |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` | Mock checkout instead of real Stripe |
| `RESEND_API_KEY` | Preview mailer in dev, no email in prod |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error tracking disabled |
| `BLOB_READ_WRITE_TOKEN` | Admin image upload disabled |
| `FIRECRAWL_API_KEY` | Design-import / Hoptify URL scraping disabled |
| `CRON_SECRET` | Vercel cron routes 401 |

> **Before going live with real customers**: set Turso (`TURSO_DATABASE_URL` +
> `TURSO_AUTH_TOKEN` — local `file:./dev.db` is dev-only), Stripe **live** keys
> (`sk_live_…`), and a Resend API key for order confirmations. Full go-live path in
> [`DEPLOY.md`](./DEPLOY.md).

## Tests

```bash
npm test            # Vitest unit tests
npm run test:e2e    # Playwright e2e (requires dev server running)
npx tsc --noEmit    # Typecheck
```

## Project structure

```
app/               Next.js App Router routes
  admin/           Admin panel (CRUD + setup wizard + integrations)
  api/             API routes (webhook, mcp, assistant, cron)
components/        React components (storefront + admin)
lib/               Platform logic (ai/, tools/, orders/, feature-flags/)
brand.config.ts    Single source of truth for brand-specific config
themes/<slug>.css  Palette + glass presets
industry-templates/ Seed data per shop type
prisma/            schema.prisma, migrations, seed.ts
```

## License

See [`LICENSE`](./LICENSE).
