# The simple site — Cartwright without a database

Use the shipped `site` profile when you want a plain website — a page, a landing page, a personal
or company site whose content lives in the repo — with designed pages, a contact form and strong
discovery, and without the webshop, database, admin or authenticated agent runtime.

## Quick start

```bash
npx create-cartwright@latest my-site --profile site
cd my-site
pnpm dev
pnpm build
```

The scaffold is materialised from `scaffold/manifest.json`, not hidden behind runtime flags. It
contains the static design/page layer plus the default `contact-form` module and deliberately
omits Prisma, the database, admin, auth, commerce, MCP execution and private tool APIs.

## Optional modules

The CLI accepts repeatable `--with` flags for modules that the selected profile supports. The
template's generated manifest is the source of truth; ask the CLI for the current list:

```bash
npx create-cartwright@latest --help
```

Discovery in a `site` scaffold is capability-aware: it advertises the static public resources that
actually exist and does not claim MCP, REST operations, checkout or other removed interfaces.

## What you edit

- **Words** — `brand.config.ts`: `storeName` (the site's name), `website.headline`, `website.tagline`, `website.cta`,
  `website.ctaHref`, and `url` (your real domain; on Vercel, `NEXT_PUBLIC_APP_URL` or the
  deployment URL wins over it for canonicals). `locales` + `defaultLocale` live there too.
- **Look** — `designSlug` in `brand.config.ts` (slugs in `designs/options.ts`). For a bespoke
  one-page build set `designSlug: "blank"` and rewrite `designs/blank/homepage.tsx` and
  `designs/blank/chrome.tsx` — a homepage, header and footer you own entirely; SEO and locale
  routing stay wrapped around whatever you render.
- **Pages** — `app/[locale]/<route>/page.tsx`, plain React; the `[locale]` layout gives it the
  site chrome. Prefix internal links with `/${locale}`.
- **Images** — `public/`. **Shared UI strings** — `messages/<locale>.json`.

Verify a change landed: `curl -s http://localhost:3000/en | grep -o '<h1[^>]*>[^<]*'`.

## Measured

| Step | Time |
| --- | --- |
| Scaffold + install | ~24 s |
| `next build` | ~30 s |
| Boot to HTTP 200 with a rendered H1 | ~2 s |

20 runtime dependencies, 16 dev dependencies, 423 files. Measured cold run, 2026-09-06,
GitHub-hosted ubuntu-latest, create-cartwright@2.9.4, engine v0.56.2 (a1bbe1f),
`--profile=site --ref=stable --yes --pm=pnpm` — release scaffold gate run 34045315774
(`cartwright-app/.github/workflows/release-scaffold-gate.yml`), which scaffolds every profile
exactly like a customer on every engine release. Copied from its `timings-site.json`, never typed.

## Honest limits

- No admin and no runtime editing — content lives in files; browser editing is the default
  profile's admin.
- No database, auth, cart or checkout; no MCP or REST tool surface on the site itself.
  Discovery advertises only what ships.
- `/` redirects to your default locale (`/en` in a new scaffold); there is no root page.
- No map, timeline, weather or checklist sections — components like these are ordinary React
  you write, in the `blank` pack or any route.
- Only `Organization`/`WebSite` JSON-LD render by themselves; builders for `FAQPage`, `HowTo`
  and `ItemList` live in `lib/builder/section-jsonld.ts`, and the generic `<JsonLd>` takes any type.
- Not a static export: a Node.js 22+ app (the OG route, the sitemap and the contact endpoint
  need a server) — Vercel or any Node host, not GitHub Pages.
- The contact form delivers mail only with `RESEND_API_KEY` (`RESEND_FROM` optional; in development
  submissions land in `.mail-previews/`); `--with none` scaffolds without it.
- Three of the 20 runtime dependencies are dormant (the MCP SDK, `jsdom`, `v0-sdk`): installed,
  imported by nothing in this profile.

## When to choose `light` instead

Choose the default `light` profile if the site needs editable CMS pages, the admin panel, a local or
hosted database, API keys, or the public read-only agent surface:

```bash
npx create-cartwright@latest my-managed-site
```

`light` starts in website mode and retains the mode-gated webshop foundation. Add
`--template generic` when it should start as a shop. Heavy full-only modules and non-curated design
packs are pruned; they are available with `--profile full`.

## What `site` intentionally does not provide

- No database, Prisma schema, seed or admin login.
- No `/admin`, customer accounts, cart, checkout or order storage.
- No executable MCP server, authenticated REST tool registry or operational AI actions.
- No runtime CMS editing; content lives in the generated source files.

These are profile boundaries, not temporarily disabled features. If a requirement crosses one of
them, scaffold `light` or `full` instead of reassembling the removed runtime by hand.

## See also

- [`docs/getting-started.md`](getting-started.md) — the general first-run guide
- `docs/scopes-and-tools.md` — the governed agent surface of the database-backed profiles (not shipped in a site scaffold; read it in the [engine repo](https://github.com/Teloz1870/cartwright-template/blob/main/docs/scopes-and-tools.md))
- [`docs/versioning-policy.md`](versioning-policy.md) — stable tags, `main`, and deliberate updates
