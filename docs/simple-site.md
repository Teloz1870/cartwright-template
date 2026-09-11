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

Two modules are worth knowing by name:

- **`--with contact-form`** — a contact page and a Resend-backed endpoint, no database. Included by
  default today; from create-cartwright 2.10 it becomes opt-in like everything else here, so pass
  the flag if you want it and do not rely on the default either way.
- **`--with trust-pages`** — `app/[locale]/about` and `app/[locale]/privacy`, two thin pages that
  render the built-in legal content. Opt-in: a plain site scaffold does not carry them, and the
  stock footer does not link them. (`/info/terms` and `/info/cookies` ship in every profile — they
  are one route, `app/[locale]/info/[slug]`, with default legal copy you edit or delete.)

## Removing the stock pages

A `site` scaffold is deliberately small, and what it does ship is yours. Seven routes in it are
Cartwright's own site rather than yours — `/cartwright`, `/priser`, `/cases`, `/start`, `/changelog`,
`/built-with-cartwright` and `/manifest` — along with our `CHANGELOG.md` and our issue templates.
The engine marks all of them engine-only in a ledger the scaffold carries
(`scaffold/manifest.json` → `engineOnly`), and every link to them in what the engine ships asks the
`engineMarketing` capability first, which is `false` in a `site` scaffold. So in a site scaffold they
are already unreachable from your navigation, your footer, your sitemap and your `llms.txt`.

**They are still on disk, and today you delete them yourself.** The ledger is the engine's half; the
CLI half is not built — `create-cartwright` 2.9.5, the current release, does not read `engineOnly` at
all, so a scaffold cut today contains all seven directories plus `CHANGELOG.md`,
`.github/ISSUE_TEMPLATE/` and `.github/PULL_REQUEST_TEMPLATE.md`. From create-cartwright 2.10 the
scaffolder removes them for you. Until then:

```bash
rm -rf "app/[locale]/cartwright" "app/[locale]/priser" "app/[locale]/cases" \
       "app/[locale]/start" "app/[locale]/changelog" "app/[locale]/built-with-cartwright" \
       app/manifest CHANGELOG.md .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md
```

Safe in a `site` scaffold with no follow-up edit: nothing that ships links any of them once
`engineMarketing` is false. **The other two profiles are not that.** A `full` scaffold has all ten
paths; a `light` one has eight — its own prune list already drops `app/[locale]/priser` and
`app/[locale]/cases`, so those two lines are a no-op there — and in both, `engineMarketing` is `true`,
so the links to the rest are live. Delete a route there only together with the links to it, or wait
for 2.10.

What you may still want to remove, and how:

| You want gone | Delete | Then |
| --- | --- | --- |
| The contact page | `app/[locale]/contact/`, `app/api/inquiries/` | Remove the `/contact` links from your design pack (or scaffold with `--with none`) |
| About / Privacy | `app/[locale]/about/`, `app/[locale]/privacy/` | Nothing in what the engine ships: the footers, the design packs' own chrome, the cookie banner and the sitemap all ask the `trustPages` capability first. A design pack **you** wrote is yours to check |
| Terms / Cookies | `app/[locale]/info/` | Remove the two `/info/*` links in `components/Footer.tsx` **and their two entries in `app/sitemap.ts`** — unlike About/Privacy these ship in every profile, so nothing gates them for you |
| The 404 body, the catch-all, `llms.txt` | — | Keep them. They are the shop's own, and removing them hands visitors Next's default pages |

After deleting a route, run `pnpm build` and open `/sitemap.xml`. A plain site scaffold's sitemap
lists the homepage plus `/info/terms` and `/info/cookies`. About and Privacy are gated on the
`trust-pages` module, so deleting *those* cannot leave a stale entry behind — but the two `/info/*`
URLs are unconditional, because every profile serves them, so if you delete that route delete its
two lines in `app/sitemap.ts` in the same commit. **Known gap:** with `--with trust-pages` the two pages ship but are
neither listed in the sitemap nor linked from the stock footer; add them to your own design's footer
until the CLI turns the capability on with the module. Never the other way round: a sitemap entry
for a page that is gone is a 404 you advertised.

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
