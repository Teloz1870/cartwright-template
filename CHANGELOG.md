# Changelog

Cartwright templates ship as tagged releases. `npx create-cartwright` pulls the
template at the current `DEFAULT_REF` tag (managed in `cartwright-app/apps/cli`).

A scaffolded shop is a one-shot snapshot — nothing updates it automatically. The
**Security advisories** index below is therefore the canonical place to learn whether the
engine version your shop runs (see `.cartwright/release.json`) has a known security fix you
should pull. When a release fixes a security issue, its version block gets a `### 🔒
Security` section (issue + severity + the version you must upgrade to) **and** a row is
added to the index below.

## Unreleased

## v0.65.1 — 2026-10-29

A security patch: upgrade. `pnpm audit --prod` on v0.65.0 lists one critical, nine high, ten
moderate and two low findings, all in dependencies (CW-2026-012), and v0.65.1 lists none. The audit
counts one finding per advisory and vulnerable version range, so an advisory that hits both
`undici` 6.x and 7.x counts twice; below, each advisory is named once. The
critical one, a middleware bypass in `@sentry/nextjs`'s tunnel route, needs a webpack build, and
the engine builds with Turbopack. None of the others is known to be reachable from a request in a
shipped shop. Also in this release: Node 26, the new LTS, is supported, and an order cancelled
before it was paid gives its discount-code use back. No schema change: no `pnpm db:push` is needed.

### 🔒 Security
- **Dependency advisories closed (CW-2026-012).** `@sentry/nextjs` moves to ^10.76.2, and the
  `overrides` in `pnpm-workspace.yaml` raise the floors of packages below our direct dependencies.
  Every version was public for at least three days.
  - `@sentry/nextjs` below 10.75.2 (GHSA-mchm-gjx6-7h55, critical): with `tunnelRoute` set, the SDK
    skipped middleware for every path under the tunnel path, not only the requests it forwards to
    Sentry. The engine sets `tunnelRoute: "/monitoring"`, and `app/[locale]` matches any first path
    segment, but the advisory only affects webpack builds, and `pnpm build` uses Turbopack. A shop
    that builds with `next build --webpack` is affected for routes whose only authorization check
    is in `proxy.ts` (Next 16's name for middleware).
  - `undici` 6.x below 6.29.1 and 7.x below 7.30.1 (under `@vercel/blob`, `jsdom` and the AI SDK):
    four high advisories (TLS certificate validation bypass GHSA-2m5v-pch6-74hx, cache poisoning
    GHSA-4w7w-5xrc-9h26, and the denial-of-service advisories GHSA-qrxm-fqhp-jwvm and
    GHSA-xjj6-f33q-929c) and four moderate ones.
  - `body-parser` below 2.4.0 (GHSA-27r3-jxmh-p828, high) and `qs` up to 6.16.0
    (GHSA-6pq8-jhm2-2vcw, moderate), both under the MCP SDK's `express`, which the engine never
    imports.
  - `zod` below 4.6.6 (GHSA-mrhx-c7xc-m3w5, high): only the older copy inside
    `@vercel/cli-config`; the engine's own `zod` was already 4.6.7.
  - `fast-uri` below 3.1.9 under `ajv` (two moderate, two low) and `ip-address` up to 10.7.3 under
    the MCP SDK's `express-rate-limit` (GHSA-rxp7-6hxx-x8q5, moderate).

  To fix it in your own shop without upgrading, see CW-2026-012 in the advisory index.

### Upgrading
Pull and run `pnpm install`: the dependency changes arrive through `package.json`,
`pnpm-lock.yaml` and `pnpm-workspace.yaml`. No schema change and no new environment variable.
Node 22, 24 and 26 are supported. `tsconfig.json` now excludes `**/agent-replays`, and
`eslint.config.mjs` ignores `**/agent-replays/**`. If your own project has a directory of that name
that you want typechecked or linted, remove the entries.

### Changed
- **Node 26 is supported (NODE26-READY).** Node 26 became the active LTS on 2026-10-28, and
  `engines` now reads `>=22 <27` instead of turning it away. The unit suite was red on Node 26:
  Node ≥ 25 puts its own `localStorage`/`sessionStorage` on the global object, empty unless
  `--localstorage-file` is given, and that shadowed jsdom's storage in jsdom tests
  (`client-admin-prefix-welcome`, 9 of 9). `tests/setup/env.ts` now points both at jsdom's in a
  jsdom file, and the PR gate runs the unit suite on Node 26 next to the Node 22 floor. `.nvmrc`
  and the Dockerfile default stay on 22. Vercel uses the newest major it offers inside `engines`,
  which is 24 today; the day it offers 26, deploys move to 26 unless the project pins a Node
  version in its settings. A shop picks this up by pulling; nothing to migrate.
- **A local copy of replayed projects no longer breaks typecheck, lint or the ownership tests.** A
  locally ignored `agent-replays` directory holding whole replayed scaffolds was picked up by
  `tsconfig.json`'s `**/*.ts` (`tsc` ran out of memory at 4 GB), by `pnpm lint` (37 errors from
  those projects) and by the ownership walk in `tests/helpers/claims.ts`. All three now skip it. A
  fresh clone has no such directory, so CI was never affected.

### Fixed
- **An order cancelled before it was paid gives its discount-code use back (DRØM103-a).**
  Checkout counts one use of a discount code when it creates the order, but cancelling an unpaid
  order only returned its stock, so every order cancelled before payment used up one use of a
  limited code for good. The cancel that wins the order's status write now also takes one off
  `usageCount` (never below 0) in the same transaction: an operator cancel, the
  `payment_intent.canceled` webhook, the reconcile cron and checkout's own rollback all count it
  once between them. Paid and already-cancelled orders are untouched, and past counts are not
  recalculated.

## v0.65.0 — 2026-10-28

No security advisory in this release. A magic link for an account saved with ASCII capitals now
signs in to that account instead of making a second, password-less one (on SQLite and Turso a
capital outside ASCII, such as `Ö`, still is not matched). A storefront page such as
`/administration` keeps its storefront buttons (`/admin` and `/admin/…` still hide them), a
signed-in visitor is no longer refused a page whose address only contains `/account/login` or
`/account/signup`, a homepage vibe page no longer renders blank in a language whose vibe tab was
saved empty, and a Vibe Sandbox save that leaves the HTML as it is keeps the German and Spanish
vibe HTML that Translate made. In the shared header, product cards and footers, the cart count,
product badges and footer links now grow with the visitor's own text size, as do the AI order
flow's right-of-withdrawal notice, the first-run welcome screen and the small text in the reviews,
blog and phone-widget plugins; at the default size they look
the same, and the crema design and other px text are later slices. For a move from WooCommerce,
the migration board (behind `migrationDashboard`, default off) gains checks for catalogue counts,
page content and head tags (counts and a few fields, not a full comparison; product pages fail the
SKU test until PDP-SKU-JSONLD), and the web DNS and its TTL, reads a WordPress
installed in a subdirectory, and a new library function writes the redirect CSV for the old
shop's system pages and feeds (no tool or screen calls it yet). Claude Haiku 5.5 can be picked as the AI model; the default stays Haiku 4.5. Each
entry below says where its fix stops.

### Upgrading
Nothing to run: no dependency, schema or environment variable changes. `pnpm lint` has a new
rule, `cartwright/no-module-scope-local-font-read`: a design pack of your own that reads a
self-hosted font's `.variable`, `.className` or `.style` at module scope now fails lint — move the
read inside the component (see FONT-LOCAL-ROUTE-DROP under Added). A customer whose earlier
magic link already made a lowercased second account keeps signing in to that account; joining the
two is a data change this release does not make (see REG-EMAIL-CASE-c under Fixed).

### Added
- **`pnpm lint` now fails when a design pack reads a self-hosted font's `.variable`, `.className` or
  `.style` at module scope (FONT-LOCAL-ROUTE-DROP).** In the route-handler layer
  (`/api/admin/designs/[slug]/export` imports every pack) Turbopack drops the import of a
  `next/font/local` module with a single importer, so such a read failed `pnpm build` minutes in
  with "`<font>` is not defined", on a route nobody was editing. The new rule
  `cartwright/no-module-scope-local-font-read` names the line and the fix — read it inside the
  component, or wrap it in a function — and a unit test runs it over every pack and font module on
  disk. It covers files under `designs/` and `app/fonts/`, and it recognises a font by its import
  path (`…/font`, the `app/fonts/<family>/font.ts` convention, including a namespace import and a
  font destructured out of one), a `localFont(…)` call in the same file, or a plain alias of either.
  It follows each binding through scope analysis, so a local variable that happens to share a font's
  name is not flagged, and an `import` written below the read is still seen. Destructuring
  (`const { variable } = display`) counts as a read, and so does a read that runs while the module
  loads even though it sits in a function or class: an immediately invoked function (also through
  `.call`/`.apply`), a `static` field, a `static {}` block or a computed member key. A font passed
  into an immediately invoked function as an argument is not followed. A local font re-exported under another module
  name, and `next/font/google` fonts (not seen to be dropped), are not covered. Nothing a shop owner or customer sees changes.
- **An opt-in Playwright project checks the WebMCP tools in a real Chromium, with no fake browser API
  (TREND36-a).** `pnpm test:e2e:webmcp-real` launches Chromium with `--enable-features=WebMCP` and asks
  the browser itself, through Playwright's `page.webmcp`, which tools the storefront registered; it
  expects `search_products`, `get_cart` and `navigate`, checks that Chromium reports `search_products`
  as read-only, and calls it once. A browser or Playwright without the WebMCP API makes it fail, not
  skip. `pnpm test:e2e` does not run it (the project is `default: false`), it needs a webshop brand
  with `webMcp` on, and it is engine-only: `tests/e2e/` and `playwright.config.ts` do not ship to the
  template. It does not cover the per-page tools, the cart-changing tools or checkout; the fake-based
  `webmcp.spec.ts` still covers those.
- **The migration board can now check that the imported catalogue holds as many categories and
  products as the WooCommerce shop (MIGD-5a).** `migration.run_checks` with `checkIds: ["data.counts"]`
  reads the shop the way `migration.woo_plan` does (its public Store API, GETs only, about 45 seconds)
  and holds every category and product it lists against the rows imported here under their
  WooCommerce id. It is a pass only when every one is here and nothing imported is gone from the shop.
  A row the import leaves out on purpose is on a skip list with the importer's own reason — a variable
  or grouped product until schema batch B, or a row the import plan holds back as a conflict, orphan
  or blocked — and makes the check a warn, which does not count toward "Ready for DNS switch"; a
  missing row nothing explains, or an imported row the shop no longer lists, is a fail; a shop that
  cannot be read whole is inconclusive. The run keeps the first 50 differing ids. A product
  soft-deleted here does not count as imported. Behind the runtime flag `migrationDashboard`, and only
  on a site with the webshop module. It does not count pages, posts, variations or stock, and
  `data.ids` is not a check of its own yet: the id list lives in the `data.counts` run.
- **The migration board reads the web DNS and its TTL before the switch, and proves the DNS after it
  (MIGD-6a).** `migration.run_checks` now runs `dns.web` and `dns.ttl`, one check per call, each
  finished in that call. `dns.web` looks up the domain that moves (`settings.expectedHost`, else the
  old site's host) and its www twin, and holds them against the new site: a CNAME to its host, or
  only its addresses (plus `settings.targetResolve.ip` when set, or the new site's own IP when its
  address is one) is a pass, with an IPv6 address matched in any spelling; a new-site host that resolves to no address reads `inconclusive`, so a
  CNAME to a host that does not exist is never a pass. Before the owner signs
  off the switch, a domain still on the old host reads `skip` with what it resolves to today —
  information, not a failure; after the sign-off it is a `fail`. A new site on a `*.vercel.app` alias
  is the exception, because Vercel answers a custom domain from other addresses than the alias
  (measured: `demo.cartwright.app` and `demo-cartwright.vercel.app` share none): a CNAME to Vercel's
  edge (`cname.vercel-dns.com`, `*.vercel-dns-NNN.com`) or its documented apex A `76.76.21.21` passes,
  though DNS cannot tell which Vercel project answers, and any other difference after the sign-off
  reads `inconclusive`, not `fail` — so a domain on Vercel's own nameservers stays `inconclusive`
  until `settings.targetResolve.ip` lists the addresses Vercel gave it. `dns.ttl` asks each name's own zone
  nameservers (a www delegated to a zone of its own is asked there), so the TTL is the one the zone
  sets, not what is left in a cache, and warns above
  300 s. A lookup that errors or takes longer than 3 seconds reads `inconclusive`. Neither check is
  required for "Ready for DNS switch". Behind the runtime flag `migrationDashboard` (default off);
  nothing on a storefront changes. Not covered: `dns.mail` (it needs the owner's DKIM selectors), a
  CNAME's own TTL (node:dns cannot read it, so such a name reads `inconclusive`), a tool to set
  `settings.targetResolve`, and requests to the new site under the production host name.
- **A WooCommerce migration can now produce the redirect CSV for the old addresses that get no
  page of their own (W21-live-6a).** `lib/woo/redirects-csv.ts` reads the shop's wp/v2 pages,
  posts and shipping classes (GET only, through the existing read-only client) and, with the
  catalogue snapshot, writes the `from,to,status` file the Redirects import already takes: the
  checkout, my-account and shop pages (found by WooCommerce's own slugs — `kasse`, `min-konto`,
  `butik`, or the English ones — or the owner's) to `/checkout`, `/account` and `/produkter`;
  shipping-class archives to `/produkter`; `/feed/` and its variants to the blog feed, the shop's
  feed to the Google product feed (or the homepage when that feed is off), and each product,
  category and post feed to its own page. Products, categories, tags and content pages are never
  a row: they answer at their own address. It never guesses: a role two pages claim, a query
  address (`?p=`, a shipping class without a pretty URL), a dotted path, another host and an
  address the engine already answers (`/kurv/`, which the engine sends to `/cart` itself) are
  listed as skipped with the reason — as are a shop page set as the site's front page (the
  importer refuses `/` as a source), a child page that only shares a system page's slug
  (`/om-os/butik/`) or sits on another host or outside the install's path, any address that
  keeps answering at itself (every page of a role two pages claim stays one), any path the engine
  answers at as a destination (`/checkout/` as a shipping class), and a row whose destination is
  another row's source. A shop page already at `/produkter/` needs no row, but its feed still gets
  one. A destination given with a locale prefix is refused with an error. The two feed files
  (`/blog/feed.xml`, `/feed/google.xml`) exist only without a locale, so those rows are written
  absolute on the engine's origin (the old shop's, or one the owner gives): `/da/feed/` reaches
  the feed instead of a `/da/blog/feed.xml` that does not exist. On a WordPress installed in a subdirectory the site feeds are written
  under it (`/wp/feed/`). Tests run every generated file through the importer's own
  planner: no refused row, no chain, no loop. Nothing calls it yet — no tool, no screen — and
  it does not cover `/wp-content/uploads/*` (needs the media-alias table), the endpoints under
  my-account and checkout (`/kasse/order-received/…`), or a shop whose file passes the
  importer's 2,000-row limit.
- **Claude Haiku 5.5 can be picked as the AI model; the default stays Claude Haiku 4.5 (TREND37-a).**
  The model picker in `/admin/integrations` → AI now lists `claude-haiku-5-5`. Picked, it gets the
  full admin tool set and is priced in the usage meter at $0.10 in / $0.50 out per million tokens
  (Anthropic's pricing page, read 2026-10-25). A saved choice and a fresh shop keep Haiku 4.5;
  nothing switches on its own. Haiku 5.5 answers `temperature`, `top_p`, `top_k`, a thinking
  budget and an assistant prefill with a 400; a test pins that the requests the engine builds for
  it carry none of these, and that no file which resolves the chat model sets a sampling or
  thinking-budget value. Not covered: a request whose prompt is over 100,000 tokens costs five
  times as much on Haiku 5.5 ($0.50 / $2.50), and the meter still counts it at the lower price;
  a chat history sent by a client that ends on an assistant turn still reaches the model as sent.
- **The migration project keeps the path of a WooCommerce shop installed in a subdirectory, and `migration.woo_plan` reads it there (W21-STOREPATH).**
  `migration.project_set` now stores `sourceUrl` as its origin and path with the trailing slash
  dropped, so `https://example.com/shop/` is kept as `https://example.com/shop` instead of
  `https://example.com`. The import plan then reads that shop's Store API and wp/v2 at
  `/shop/wp-json/…`, `/admin/migration` shows the plan only while the project names that same
  origin and path, and `migration.freeze_sitemap` starts from `/shop/sitemap_index.xml` unless a
  `sitemapUrl` is given. A `sourceUrl` with a query (`?`) or fragment (`#`) is refused (422)
  instead of having it dropped. A shop in the root is stored and read exactly as before when its
  `sourceUrl` is the bare domain; the path must be where WordPress is installed, not a page, so a
  root shop given as its shop page (`https://example.com/shop/`, which used to be cut back to the
  domain) is now read at `/shop/wp-json/`, and its 404 says to set the bare domain. A
  project saved earlier with an origin only keeps working unchanged; moving the source to another
  path on the same host counts as a new source and drops the frozen URL map, as a new host does.
  A shop that redirects is still not followed. `targetUrl` is still stored as an origin. The tools
  sit behind the runtime flag `migrationDashboard` (default off); nothing on a storefront changes,
  and no database column was added.
- **The migration board can now check that each moved page says the same thing, and carries the
  same head tags, on the new site (MIGD-4a).** `migration.run_checks` runs `url.content` and
  `seo.head`, one check per call, behind the same default-off `migrationDashboard` flag. For every
  frozen URL that `url.parity` found on the new site, each fetches the old page live and the new one
  (GETs only, the same SSRF-guarded fetch). `url.content` fails a soft 404 (a 200 that looks like the
  new site's own 404 page, which it reads once per call), a changed or missing `<h1>`, a changed
  JSON-LD `sku`, or fewer tables inside `<main>`; fewer paragraphs, links or images is a warning.
  `seo.head` fails a new `noindex` (robots meta tag or `X-Robots-Tag` header), a missing canonical,
  or one on another host than the old site's domain, and a missing `<title>`; a changed title or
  meta description, a missing `og:image`, a canonical moved to the domain's `www.` twin and one
  that points at another page (another path than the old canonical's, or the old URL's when the
  old page had none, or the new URL's) are warnings; a page cut at the 1 MB read cap is
  "inconclusive", since a robots tag past the cut would go unseen. Content that React streams in
  after the page shell — a Next.js product or category page's Suspense content — is counted where
  it renders, inside `<main>`, and a `<title>` that arrives late in the body is still found (the first one outside an inline `<svg>` counts). The old page is reached through its own http→https and `www.` redirects; text is
  compared with every HTML 4 named entity decoded (`&oslash;` is "ø") and inline markup kept inside its word
  (`H<sub>2</sub>O` is "H2O"), and the SKU JSON-decoded and compared exactly, case included; a
  preview limit such as `max-image-preview:none` is not read as `noindex`; a new site whose 404
  page is empty still has a readable one. A URL `url.parity` has not reached is
  "skip" and a source that does not answer is "inconclusive"; either keeps the run from passing,
  so it never counts toward "Ready for DNS switch". Not covered yet: both checks need the old site
  up, so they refuse to run after the DNS switch (freezing the old head at sitemap-freeze time is a
  later slice); paragraph text, link targets and image files are counted, not compared; the
  per-URL results live only in the run's first 20 rows, not on each URL; streamed content React
  sends in another form (its external runtime, or inside a table) stays where it was sent, so it
  can only count low (a warning or failure, never a false pass); and every product page
  fails `url.content` on `sku` until the product page's JSON-LD sends the product's own SKU instead
  of its id (PDP-SKU-JSONLD).

### Changed
- **The engine's PR check now also runs the shipped test suite under the market a new scaffold is
  born with: USD, US, English only (SCAFFOLD-USD-GATE).** `create-cartwright` scaffolds USD by
  default, and this repository is a Danish shop (DKK incl. VAT), so a test that quietly assumed DKK
  passed here and failed only in the pre-release scaffold check, as #694's did. The new step patches
  `brand.config.ts` in memory the way the CLI does (currency, country, the currency table, locales,
  default locale) and runs the same suite again; nothing changes in a shop. It does not reproduce
  the rest of a scaffold: the CLI's template and copy patches, a non-default `--currency`, the light
  and site profiles' pruned files, or the missing git history are still only caught by the
  pre-release scaffold check.
- **The tests behind five of v0.64.0's fixes now fail when those fixes are undone (REVIEW-NITS-2026-10-24).**
  Nothing a shop renders, stores or answers changes — this is tests plus one clarified code
  comment. The proxy's matcher test now also pins that `/admin`, `/account`, `/api`,
  `/oauth/authorize`, `/icon` and `/og` still reach the proxy. The anonymous MCP ceiling test
  now checks that an API-key session's server is built with no ceiling, not just one above
  5,000. The password-reset tests check, for every case, that the link went to the address
  the account holds and came from that reset, that a reset reads the accounts once and does
  not also look the exact spelling up by its unique key, and the "only row there is" rule against two
  near-miss readings of it. The product-page frame tests pin the default-language rule with
  translations stored, a name-only translation and the genome description on another language (each in the page body as well as the frame),
  and that an unframed page still renders its body. The admin translation tests answer a
  lookup only with the columns it selects, and cover the product and page forms opening a
  column stored as JSON text and leaving an empty column alone. Not covered: whether a reset
  can be requested for an address with letters outside ASCII (the form's own validation
  decides that).
- **`DESIGN.md` asks for text that survives the visitor's own text size, `docs/webmcp.md` says the
  declarative forms sit outside the WebMCP spec, and the AI roadmap and the agentic-web verification
  say ACP payment completion is wired but inert (DOCS-RADAR-2026-10-25).** Documentation and one code
  comment only. Rule 7 of the playbook's a11y minimums now asks for relative font units (in a fluid
  `clamp()` the `rem` part sits in the preferred value, never `vw` alone), no custom font size on
  `:root`/`html`, no loss at 200 % text size and reflow at 320 px width (modern-web-guidance
  `respect-os-text-scale`), and meaning-bearing text in the DOM rather than in `::before`/`::after`
  (WCAG F87, modern-web-guidance `accessible-generated-content`). `docs/webmcp.md` records that the
  spec removed the declarative API on 2026-10-08 (webmcp#338) while Chrome's implementation stays
  experimental; no tool is renamed or removed. `docs/AI-NATIVE-ROADMAP-2026.md`,
  `docs/AGENTIC-WEB-VERIFICATION-2026.md` and the doc comment on the ACP `complete` route now say
  what the code does: `completeAcpSession` charges a Stripe Shared Payment Token and creates the order
  only with `ACP_PAYMENT_COMPLETION=1` (`501` without it, `404` when `acp.enabled` is off, the engine
  default), it awaits Stripe SPT access and ChatGPT merchant onboarding, and it is not verified end
  to end.

### Fixed
- **The AI order flow's right-of-withdrawal notice, and the prices and stock in the AI assistant and voice panels, now grow with the visitor's text size (TREND34-b3).**
  The order confirmation card (the statutory 14-day right-of-withdrawal notice), the AI assistant
  panel (product brand, name, price and stock in a comparison, the cart summary and the order
  receipt) and the voice-shopping overlay set their smallest text in pixels (9–11px), so a visitor
  who had raised the text size in the browser or operating system still saw it at 9–11px. Those
  sizes are now in rem, with the same size at the default text size: the panels look exactly as
  before until a visitor enlarges their text, and then this text grows with the rest. Wording in
  Danish and English is unchanged. Not covered here: px text sizes elsewhere on the storefront and
  in design packs (TREND34-b1, b2, b4–b8).
- **`migration.woo_plan` keeps to the counts a shop reports and stops the whole read when one part fails (W21-SAFE-INT).**
  An `X-WP-Total` or `X-WP-TotalPages` header past 2^53 now reads as an unknown count, as a missing
  header does, instead of a rounded number that made the saved plan unreadable for the tool's own
  output and for `/admin/migration`. A redirect on the shop's wp/v2 product route now ends the read
  with the redirect message (the HTTP status and the address) instead of a plan flagged only as
  missing the status and Yoast fields; a 401, 403 or 404 there still just leaves those fields out.
  When one of the wp/v2 requests that run four at a time fails, the others stop retrying instead of
  going on in the background. No public-address (DNS) check starts once the read's budget is spent.
  The tool sits behind the runtime flag `migrationDashboard` (default off); nothing on a storefront
  changes.
- **A storefront page whose address begins with `/admin`, such as `/administration`, keeps its storefront chrome (CLIENT-ADMIN-PREFIX).**
  Three storefront components hid themselves "inside the admin" whenever the address began with
  `/admin`: the first-run welcome guide, the AI assistant button and the voice-shopping button. On a
  shop whose addresses carry no language prefix (`urls.localePrefix: "never"`), a migrated
  `/administration` page therefore lost them. (The same
  check in `components/StorefrontWrapper.tsx`, which nothing in the engine mounts, is fixed too, for
  a fork that uses it.) They now read `/admin` as a whole path segment, the way the proxy has since
  PROXY-SEGMENT-BOUNDARIES: `/admin` and `/admin/…` still hide them, `/administration` and
  `/adminx` do not. The proxy and the site profile's proxy use the same new helper
  (`lib/path-segments.ts`) for their `/admin` and `/api` checks, with unchanged behaviour. Pages
  under a language prefix (`/da/administration`) were never affected. Not covered: the AI assistant
  and voice buttons' `/account/login` checks, and `lib/auth/post-login.ts` (POST-LOGIN-INCLUDES).
- **A homepage vibe page no longer renders blank in a language whose vibe tab was saved empty
  (HOME-VIBE-EMPTY-EN).** When the homepage has vibe HTML (from `mockup.set` or the Vibe Sandbox) and
  a language's own vibe HTML was stored as an empty string — the Sandbox saved with an empty English
  tab — `/en` showed an empty container instead of the base vibe page. An empty or whitespace-only
  per-language entry now counts as missing and the base vibe HTML renders, as info pages already
  did for empty strings; a real translation still wins, also on the default locale as before.
  Info pages and blog posts are unchanged: they already skip an empty string, but a
  whitespace-only translation there still wins.
- **The site-profile import audit now fails a site-included file that imports the generated Prisma
  client (SITE-AUDIT-GENERATED).** `app/generated/` is written by `pnpm install`'s `prisma generate`,
  so it is on disk in the engine checkout, and the audit (`scripts/site-profile-audit.ts`, run by
  `tests/unit/site-profile-imports.test.ts`) resolved an import of `@/app/generated/prisma/client`
  into it and passed. A `--profile site` scaffold has no prisma and no generated client, so the same
  import, even `import type`, fails that scaffold's typecheck. The audit now reports any import of
  `app/generated/**`, by alias or relative path, from a file the site profile keeps, whether or not
  the client happens to be generated locally. Files the site profile drops, and every profile that
  keeps prisma, are not affected. Nothing on any storefront changes. The audit still reads imports
  with a regular expression, so an import it cannot parse is not checked.
- **A Vibe Sandbox save that leaves the page's HTML as it is keeps the German and Spanish vibe HTML
  made by Translate (SANDBOX-KEEPS-UNCHANGED-TRANSLATIONS).** Since v0.64.0 every Vibe Sandbox save
  dropped each language's stored vibe HTML, so the de/es versions that `/admin/indstillinger` →
  Translate wrote were lost when the owner only changed the meta title or the nav order. Now they
  are dropped only when the saved HTML differs from the stored HTML. The comparison is exact apart
  from line endings (the browser sends every line break as CRLF, so HTML stored by `mockup.set` or
  the API with plain LF still counts as unchanged): any other change of whitespace counts as a new
  design and still drops them (run Translate again), and so does emptying the HTML. Other language
  fields are kept either way, and the English HTML the Sandbox posts still lands on top.
  `mockup.set` and `mockup.clear` are unchanged: `mockup.set` drops every language's vibe HTML on
  each call, even when the HTML is the same, and `mockup.clear` drops it whenever it clears a stored
  takeover.
- **A signed-in visitor sent to the login page with a `callbackUrl` is no longer refused a page whose address only contains `/account/login` or `/account/signup` (POST-LOGIN-INCLUDES).**
  The login page forwards an already signed-in visitor to `?callbackUrl=`, except to the login or
  signup page itself. That exception was a substring test, so `/blog/account/login-tips`,
  `/da/account/login2` or `/x/account/login` sent the visitor to `/account` (or `/admin`) instead of
  the page they asked for. It now reads whole path segments, the way the proxy's sign-in gate does:
  an optional configured locale, then `account/login` or `account/signup`, with or without a
  trailing slash, query string or fragment. A percent-escaped spelling (`/da/account/%6Cogin`),
  repeated slashes (`/da/account/login//`), an escaped slash that decodes to a dot segment
  (`/da/blog/..%2Faccount/login`) and the legacy Danish `konto/login` and `konto/opret`, which the
  proxy 301s to those pages, are refused as well, and so is a locale typed in another case
  (`/DA/account/login`), which next-intl redirects to the configured spelling. Not covered: the sign-in form itself (`components/LoginForm.tsx`) still applies
  no auth-page exclusion, and the AI stylist button still hides itself on any path ending in
  `/account/login`.
- **A magic link for an account saved with capitals signs in to that account (REG-EMAIL-CASE-c).**
  Auth.js lowercases the address a customer types and signed in to the account spelled exactly
  that way, so for an account a shop holds as `Foo@Example.com` the first magic link made a second,
  password-less account `foo@example.com`, and every later link signed in there — away from the
  account's orders and password. A link now picks the account by the rule a password reset uses:
  the account spelled exactly as Auth.js gives the address (lowercased) first, otherwise the account
  a password login with that address signs in to, otherwise the only account there is. The link and
  its token both name that account's stored spelling, and the link is mailed to the address the
  account holds, so clicking it signs in to that account and creates none; the same link edited to
  another spelling opens nothing. An address with no account gets its link exactly as before, and a
  new customer signs up lowercased. Where several accounts differ only in case and the rule cannot
  pick one, no link is sent; the page still says to check the inbox, and the server log says why
  without the address. The lookup reads the accounts at most once per request, after the magic-link
  rate limits; a request the limits stop is not looked up, and cannot take over the answer of a
  request for the same address made in the same instant, whichever of their tokens is filed first.
  Under a flood of magic-link requests still in flight at once (256 or more, from many clients), a
  link for an account saved with capitals can open nothing — never another account — and the
  customer has to ask for a new one. Not covered: a customer whose earlier link already made the
  lowercased account keeps signing in there, because that account is spelled exactly as the
  address is given; joining the two is a data change this does not make. On SQLite and Turso an account saved with a capital outside ASCII
  (`JÖRG@…`) is still not found by a magic link — Auth.js lowercases the whole address before the
  lookup and SQLite's `lower()` folds ASCII only — so its link makes a separate account, as it did
  before. No schema change, and no data is changed.
- **The header's cart count, product badges, footer links and the default shop's announcement follow
  the visitor's text size (TREND34-b1).** Their font sizes were fixed in px, so a visitor who raised
  the browser or OS text size saw them stay small; they are now rem, converted 1:1 (10px → 0.625rem),
  so at the default 16px size nothing moves. The cart-count bubble's box is sized in em of its own
  text, so at 200 % text it grows with the count instead of clipping it. Covered: the shared header
  (cart count, admin button), product cards (featured and origin badges), both footers, the
  test-mode payment pill and the Aurora shop's merchant announcement. Not covered yet: the crema
  design, the AI/order/voice panels, storefront plugins and the first-run canvas.
- **The first-run welcome canvas grows with the visitor's text size (TREND34-b5).**
  The small type on the welcome screen a fresh scaffold shows — the card descriptions, the
  "what's already running" chips, the eyebrows and badges, and the command and its Copy button —
  was set in px, so a visitor who had raised their browser or system font size saw it unchanged.
  It is now in rem, converted 1:1, so at the default 16px the screen looks exactly as before and at
  a larger default it scales with the rest of the page. So that grown text still fits a phone, the
  Copy button now drops below the command when the two no longer fit side by side — filling that row,
  keeping one command line of height and a divider above it there; at the default size the two
  stay side by side even on a 320px phone, also while the button reads "Copied!" — and the admin email in the setup hint may
  break mid-address instead of pushing the card wider than the screen (measured: at a 200 % browser
  font size the 390px view stays 390px wide; at 320px the cards still overflow
  by 13px, down from 34px before). Only `WelcomeCanvas.tsx` and
  `CopyCommand.tsx` change; the px sizes elsewhere in the storefront and the design packs are
  later TREND34 slices. No canary shows this screen, since all three are past first run.
- **The small text in the reviews, blog and phone-widget plugins follows the visitor's text size (TREND34-b4).**
  The review form's character counter and privacy note, the "verified purchase" badge on a review,
  the tag pills on the blog index and on a blog post, and the phone widget's "Powered by" line were set in px
  (10–11px), so a visitor who had raised the text size in the browser or operating system still saw
  them at 10–11px. They are now in rem, converted 1:1 (10px → 0.625rem, 11px → 0.6875rem), so at
  the default text size nothing moves. Wording in Danish and English is unchanged. Not covered:
  px text elsewhere in the plugins' own admin screens, and the crema design and other packs
  (TREND34-b2, b6–b8).

## v0.64.0 — 2026-10-25

No security advisory in this release. Six admin saves no longer erase a field: the category,
product and page edit forms no longer delete other languages or blank the stored English text, and
a page save, a Vibe Sandbox save, a service save and the translations screen no longer empty a page's
vibe HTML, a page's hero image, a service's translations or the English fields the screen does not
list (the Vibe Sandbox still sets the page body to its placeholder, as before). A password reset now
finds an account saved with capitals, by the rule login uses. The proxy reads whole path segments,
so a migrated `/heron-hegn/x/` reaches the proxy and `/en/administration` is an ordinary storefront
path instead of the sign-in page. For a move from WooCommerce, `migration.woo_plan` (behind
`migrationDashboard`) plans what importing a live shop's catalogue would do without writing to the
catalogue. The retired agent checkout is removed, as v0.63.0 announced. Each entry below says where
its fix stops.

### Upgrading
Nothing to run: the eight commits change no dependency, schema or environment variable. A value an
earlier admin save erased — a translation, a page's vibe HTML or hero image, a service's
translations — is not brought back; restore it from a backup if you need it.
`/api/commerce/agent-checkout` is removed, as v0.63.0 announced: it now answers `404` (see Removed).
Agents use the ACP checkout (`/api/acp/v1/checkout_sessions`) on a shop that has turned on ACP and
its payment step (`ACP_PAYMENT_COMPLETION=1`); without the payment step, completing a session
answers `501`.

### Removed
- **`/api/commerce/agent-checkout` is gone (B84).** v0.63.0 made it answer `410 Gone`, because it
  took a card payment without creating an order, and announced its removal (Deprecated). The file
  is deleted, so the path now gets the `/api` catch-all's answer, as any API path the shop does not
  have: `404` problem+json with `code: "endpoint_not_found"`. Nothing in the engine links to it;
  `/api/products/search` stopped naming it in v0.63.0. An agent that still calls it should use the
  ACP checkout (`/api/acp/v1/checkout_sessions`) on a shop that has turned ACP and its payment step
  on (`ACP_PAYMENT_COMPLETION=1`), or send the buyer to the product's `url`.

### Added
- **See what a WooCommerce import would do before anything is written (W21-live-7-a).** The new
  `migration.woo_plan` tool reads the migration project's source shop over its public Store API and
  wp/v2 (GET requests only) and plans its categories and products against this site's catalogue. It
  returns the counts per action (how many rows an import would create, and how many it would hold
  back as a conflict, an orphan or blocked) with the first 50 of the rows held back, orphan
  variations among them; a row to create is only counted. It adds the first 20 of the rows here that
  are gone from the source and of what the mapping had to change (a rewritten slug, a missing
  price). The plan has update, unchanged and skip columns too, but until the importer exists
  (W21-live-2) they stay 0: a row already here from an earlier import plans as a conflict. On a
  fresh site, the migration case, there is no such row. It writes nothing to the catalogue; it keeps
  a summary that `/admin/migration` shows in a "WooCommerce import plan (dry run)" card: the counts,
  and the first 20 of the rows that need a look, of the rows gone from the source and of the mapping
  warnings. The tool sits behind the runtime flag `migrationDashboard`, has scope `settings:read`,
  and is one of the commerce tools that a scaffold without the webshop module leaves out. Prices are
  never converted: until you pass `sourcePricesIncludeVat`, every product reads as blocked, and so
  does every product when the value you pass differs from this shop's own `pricesIncludeVat`.
  `budgetSeconds` (10–240, default 60) bounds the read. The shop is read at the root of the
  project's address: a WordPress installed in a subdirectory (`https://example.com/shop/`) is not
  supported yet, because the project keeps only the address's origin. A shop that redirects (say,
  from the bare domain to www) is not followed: the tool stops and asks you to set the address the
  shop answers on as the source. Nothing imports the plan yet.
### Changed
- **An anonymous `/api/mcp` tool call may carry at most 1,000 array elements and object members in its
  arguments (TREND30-a).** The count is recursive and does not measure bytes. A larger call gets an
  `isError: true` result, and the tool never runs. No public tool takes an array, so no real anonymous
  call comes near the limit. Calls with an API key, and the `404` a shop with `mcpPublic` off sends,
  are unchanged. This is hardening only: it closes no known hole.
### Fixed
- **Saving a category, product or page from its edit form no longer erases its translations
  (CAT-FORM-TRANSLATIONS-WIPE).** The forms at `/admin/kategorier/<id>`, `/admin/produkter/<id>` and
  `/admin/sider/<id>` were never given the stored translations, so their English fields opened
  empty, and saving wrote those empty fields over the whole `translations` value: the English text
  was blanked and every other language was deleted — on a page, also the English Vibe Sandbox HTML.
  The forms now open with the stored English text, and a save changes only the translation fields
  the form shows; other languages and any other stored translated fields are kept. A Vibe Sandbox
  save, which goes through the same page save, now merges too; its new HTML replaces the older vibe
  HTML of every language, as `mockup.set` does, so a language the Sandbox does not edit falls back
  to the new design rather than an old one. Translations an earlier save already erased are not
  brought back.
- **Four admin saves no longer erase a field their screen has no input for: a page's vibe HTML, a
  page's hero image, a service's translations, and the English fields `/admin/translations` does not
  list (ADMIN-SAVE-KEEPS-UNSHOWN-FIELDS).** Saving any page in `/admin/sider` emptied its
  `vibeHtml`, so saving the homepage there removed its mockup (from `mockup.set`, or the Danish HTML
  set in the Vibe Sandbox); the page form has no such field and now leaves it alone. Saving a page
  in the Vibe Sandbox emptied its hero image; the Sandbox has no such field and now leaves it alone.
  Each still writes the field it does show, and clears it when you empty it there. Saving a service
  in `/admin/services` emptied its translations, so the English copy made for it in
  `/admin/translations` was gone after the next edit; the service form has no translations field and
  now leaves them alone. Saving in `/admin/translations` replaced the whole English entry with the
  fields that screen shows, so it dropped a category's English long description and a page's English
  Vibe Sandbox HTML; it now changes only the fields it shows, and one you empty there is still
  cleared. To remove a page's vibe HTML, empty its Danish and its English HTML in the Vibe Sandbox
  and save — the Sandbox also sets the page's Danish and English body to its `Vibe Page Layout`
  placeholder, so write them again in `/admin/sider` — or, for the homepage, run `mockup.clear`,
  which keeps the body.
- **The proxy's path checks read whole path segments (PROXY-SEGMENT-BOUNDARIES).** A path that only
  began like one of the proxy's own names was handled as that name. An address beginning `/hero` —
  `/heroes/`, `/hero-sale/`, a migrated `/heron-hegn/x/` — never reached the proxy, so its stored
  permalink, its redirect row and the language redirect did not apply and it answered 404; now only
  the `/hero` folder itself is skipped (`/hero` and `/hero/…`, where the hero videos live), along
  with Next's files, `favicon.ico`, the `opengraph-image`, `twitter-image` and `apple-icon` routes
  and every path with a dot, as before. `/en/administration`, `/da/admin-old/`, `/en/accounting`
  and a path with `/account/` further down (`/x/account/y`) were sent to the sign-in page, and a
  signed-in customer on `/da/administration` to the homepage; they are now ordinary storefront
  paths, answered by a page or by the 404. `/apiary` was treated as the API — no redirect row, no
  language, a 404 — in the site profile's proxy as well; it is now routed by language like any
  page. A redirect row on `/apiary` never fired, and one on `/administration` only after the
  language redirect (under `localePrefix: "never"` not at all); both answer the first request now.
  `/admin` and `/account` and everything below them, with or without the language, and `/api` and
  everything below it, are gated and routed exactly as before.
- **A password reset finds an account saved with capitals (REG-EMAIL-CASE-b).** v0.63.0 made
  sign-up and login treat `Ada@Example.com` and `ada@example.com` as one account, but a password
  reset still looked the address up lowercased only, so for an account a shop holds as
  `Ada@Example.com` — every account signed up before v0.63.0 with a capital in it — a reset
  requested as `ada@example.com` sent nothing. It now finds the account whatever case it was saved
  in, by the rule login uses: an account spelled exactly as typed, otherwise the account a password
  login with that address signs in to, otherwise the only account there is. Where several accounts
  differ only in case and the rule cannot pick one, nothing is guessed and nothing is sent, as a
  login with that spelling is refused. The reset form now hands on the address as typed, so a
  customer who types it the way their account was saved gets that account's link, and the link is
  mailed to the address the account holds, not to the spelling typed. The lookup reads the accounts
  once for every address, after the form's rate limits and after the answer is sent. On SQLite and
  Turso a capital outside ASCII (`JÖRG@…`) still has to be typed the way it was saved, as for
  login. A magic link still looks the address up lowercased only, so for an account saved with
  capitals it signs in to a separate lowercased account; that is the next fix. No schema change,
  and no data is changed.
- **A design that frames the product page — halo, crema — names the product in the page's
  language (ARG2).** The pack was handed the product's stored row, so on any language but the
  shop's default its breadcrumb printed the base-language name above a translated page. It now gets
  the name and description the page itself renders: the stored translation for that language when
  there is one, else the base copy, and the voiced description when `genomeEntityCopy` is on.
  `translations` and `attributes` are still handed over as stored. The shop's default language
  renders exactly as before, and so does every design without a product-page frame. Neither shipped
  pack prints the description yet. `docs/urls.md` no longer tells a migrated shop to keep
  `urls.permalinks` unset: since v0.63.0 the stored permalink is served, and the three links still
  on `/product/<slug>` — the shopping assistant's cards, the IndexNow ping and crema's brew
  recommendation — open the same product, whose canonical names the permalink.

## v0.63.0 — 2026-10-24

Two moderate security fixes — upgrade: the public agent checkout no longer takes a payment without
creating an order (CW-2026-010), and a password-reset link no longer leaves its token in the address
bar, where GA4 sent it to Google (CW-2026-011). A deleted product can no longer be bought, and
sign-up, password reset and the login link are harder to script against. For a move from WordPress
or WooCommerce, the engine adds a migration board whose agent tools freeze the old sitemap and check
that every old URL answers on the new site; it serves a stored permalink at its own address once
`urls.permalinks` is on, lets a parent category list its subcategories' products and a product show
in each of its categories, and can plan — without writing anything — what importing a live
WooCommerce catalogue would do.

### 🔒 Security
- **The agent checkout no longer takes a payment without an order (CW-2026-010, B84; moderate).**
  `/api/commerce/agent-checkout` — public, behind no flag, and named as `checkoutEndpoint` on every
  `/api/products/search` row — opened a Stripe payment page for a product and created no order. The
  buyer could pay, the Stripe webhook skipped the payment because no order was attached to it, the
  shop recorded nothing, and the buyer landed on "page not found". The route now answers
  `410 Gone` to every request before it reads the product or contacts Stripe, with a problem+json
  body (`code: "agent_checkout_retired"`). On a shop where the ACP checkout can take the payment —
  `acp.enabled` on and `ACP_PAYMENT_COMPLETION=1` set — that body points to it
  (`POST /api/acp/v1/checkout_sessions`, which creates the order with the payment and refunds the
  payment if the order fails); on any other shop, to the product page. The search
  rows no longer carry `checkoutEndpoint`. If your shop has Stripe connected, look in the Stripe
  dashboard for Checkout Sessions whose metadata has `source: agentic_commerce` and a `productId`:
  each paid one is a payment with no order in the shop.
- **A password-reset link no longer leaves its token in the address bar, where GA4 sent it to Google
  (CW-2026-011, RESET-TOKEN-URL-LEAK; moderate).** The emailed link opened
  `/account/reset-password?token=…`, and the page ran with the token in its URL — in a browser
  signed in to the shop, since a signed-out visitor was sent to the login page without it
  (PASSWORD-RESET-GATE below opens the page to everyone). Every script on the page can read that,
  and with `analyticsGa4` on, GA4's page view sends the whole URL to Google — Consent Mode's
  cookieless ping carries it even when the visitor refused analytics. The token sets a new password
  on any account, an admin's included, for an hour, so anyone who could read the GA property could
  have used it. Now the page answers a `?token=` visit with a server-side redirect before any HTML
  exists; a new route, `/api/account/reset-password`, moves the token into an httpOnly,
  `SameSite=Lax` cookie (Secure in production) that is sent only to the reset page and lives 30
  minutes; and the browser lands back on the page with no query. The form no longer carries the
  token in a hidden field: the server action reads it from the cookie, answers an expired or used
  token exactly as before, and drops the cookie after a successful reset. The emailed link is
  unchanged, so links already sent keep working, under either `urls.localePrefix`. Once the cookie
  has expired the page asks for a new link, as it does for a link without a token; the emailed link
  still works for its hour and can be clicked again. Not closed here: the server's own request log
  still sees the token, as it did before — the proxy logs every full URL.
- **A product the shop deleted can no longer be bought (CART-DELETED-PRODUCT; low).** Deleting a
  product hid it from the catalogue but did not take it out of sale. The storefront's add-to-cart
  action takes a product id from the browser and never asked whether that product was deleted; a line
  already in a cart stayed in the cart page's total; and checkout created the order and the Stripe
  payment for it. Anyone holding a deleted product's id — a cart from before the deletion, a product
  page left open in a tab — could still pay for it at the price it had, also when it was deleted
  because that price was wrong. Listed under Security because deleting is how a shop stops a sale, and
  a visitor with no account could get past it. Now adding a deleted product, or an id no product has,
  is refused with the answer the customer chat tool already gave for one (`Product not found: …`; the
  cart action returns `code: "not_found"`), and the add-to-cart button says "No longer available"
  instead of "Added to cart". A deleted line already in a cart drops out of the cart page, the
  checkout summary, the header count, the agent cart tools and the cart-recovery mail. It stays in the
  database, so restoring the product brings it back. Checkout refuses a cart that still holds one
  before it creates the order or contacts Stripe (`code: "PRODUCT_UNAVAILABLE"`), names the product,
  takes the line out of the cart, and the next attempt charges the cart the customer sees; when nothing
  is left, the empty checkout page says the products were removed instead of only "Your cart is
  empty". The stock
  decrement inside the order transaction also requires a live product, so a product deleted in the
  moment between is refused there, still before Stripe, as sold out. ACP checkout completion
  (`ACP_PAYMENT_COMPLETION=1`) checks the session's products before it charges the shared payment
  token and answers `409` `acp_line_item_not_found`; a deletion after that check rolls the order back
  and refunds the payment. Not changed: an order placed before the product was deleted is paid and
  fulfilled as usual, and the Stripe webhook does not check again, because the order was valid when it
  was placed.
- **Customer sign-up is guarded against bots, and its answer no longer says who is a customer
  (AUTH-REG1; low).** `/account/signup` had no rate limit and no bot check, and answered a known
  address with "A user with this email already exists" — so anyone could script accounts or ask the
  form which addresses shop at you. Now a hidden field that only a bot fills gets the normal success
  answer and creates nothing; a form sent less than three seconds after it appeared is refused with a
  message, and the person simply sends it again; and a known address gets exactly the answer a new one
  gets, after the same password-hashing work — both land on the login page. On top, sign-up allows five
  attempts per client IP and then one every five minutes; a typo or a too-quick send does not use one
  up. The IP is the one `trustedClientIp` resolves: on Vercel, or self-hosted with
  `CARTWRIGHT_TRUST_PROXY_IP_HEADERS` set behind a proxy that overwrites the header. Without either the
  client cannot be told apart, and the per-IP limit stays off rather than throttle every customer
  through one shared bucket. The limit is held in memory per server instance, like the contact form's.
  Not closed here: with no email verification, someone can still sign up with an address and try to log
  in with the password they chose — the limit slows that down. The sign-up and login forms also now
  post: a click that landed before the page had finished loading used to submit them natively as
  `GET`, which put the password in the address bar, the browser history and the server's access log.
- **A `CRON_SECRET` of nothing but whitespace no longer counts as set (CRON-AUTH-d; low).** The cron
  gate, the setup guide and the two machine-only admin routes (`/api/admin/run-pending-migrations`,
  `/api/admin/reset-demo-data`) only checked that the variable was not empty. A secret of spaces or
  tabs therefore matched no request — HTTP strips them from the end of a header — so production
  answered every call, Vercel Cron's included, with `401` instead of the `503` that says the secret is
  missing, the jobs never ran, and the admin said "CRON_SECRET is configured". A secret of
  non-breaking spaces (or of U+0085, which `String#trim` leaves) was worse: that character survives
  the wire, so `Bearer` followed by one was a bearer anyone could send — to the cron jobs and to the
  two admin routes, one of which wipes and reseeds the catalogue. The value is now trimmed wherever it
  is read, and a blank one is unset: a production deploy refuses its cron calls with `503` and logs
  why, the two admin routes answer `500` "not configured", and the setup guide lists the secret as
  missing. A real secret with a stray space, tab or newline around it is compared by its trimmed
  value, and so is the token a caller sends after `Bearer `: a job that sends the variable exactly as
  it is set keeps working, and so does one that sends it without the pad. For a secret made with
  `openssl rand -hex 32` the one difference is that whitespace around the token is ignored. The
  token is the caller's own input, read before any auth, so an `Authorization` header longer than
  1,024 characters is refused with `401` without being trimmed or hashed.
- **The forgot-password form no longer says with its response time who is a customer
  (AUTH-FORGOT-TIMING; low).** Its answer was already the same for every address, but it came back
  only after the work: an unknown address straight after the account lookup, a known one after a
  reset token was written and the email was handed to the mail provider — a delay anyone could
  measure. Now the lookup, the token and the email run after the answer has been sent (`after()`), so
  every address is answered once the form is checked and the request limits are counted. A failed
  send is still only logged, as before. The form's per-IP limit keys on the trusted client address,
  as sign-up's does (INQ-IP-TRUST below).
- **The admin chat gives a local or unknown model only the tools its tier allows
  (ADMIN-TIER-ENFORCE; low).** `/admin/integrations` shows each model a capability tier — read-only,
  low-risk writes or all — and says "tools run read-only" for a model id the engine does not know,
  but the chat handed every model all of its admin tools. A small Ollama model or an unknown id was
  offered `products.delete`, settings and every other write. Those that need the plan card still
  waited for your click, but `products.attach_image` needs none, so it attached an image straight
  away. Now the chat offers a model only its tier's tools. A model that asks for an admin tool
  outside its tier anyway is refused before anything runs: no plan card and no handler call, but an
  audit-log row, and the error the model gets back names its tier. If you run a read-only model
  (`gemma4:e2b`, `gemma3:4b`, `llama3.2:3b`) or one the engine does not know, the chat can now only
  look things up: products, categories, pages, orders, discounts, analytics, the audit log and
  settings. A low-risk-writes model (`gemma4:e4b`, `gemma3:12b`, `qwen2.5:7b`) can also create and
  edit categories and pages, toggle a discount, import a Google Doc, and find and attach product
  images; each of those needs your click on the plan card, except finding and attaching an image.
  Everything else — deleting, creating or changing products, order status, shipping and branding,
  the page builder and looks, importing redirects, the migration board's tools (MIGD-3) — now needs
  an all-tier model. The Anthropic models in the dropdown, the Sonnet 4.5 and Opus 4.5 it used to
  offer, and Sonnet 4.6 and Opus 4.7 (which have a capability row too) are all in the all tier, so
  their chat offers exactly the same tools as before.
- **The contact form and password reset no longer take a client's own `X-Forwarded-For` as its
  address (INQ-IP-TRUST; low).** Both read the header's first hop raw. Next.js fills that header with the
  connection's address only when a request has none, so on a self-hosted server without an
  overwriting proxy a script could send a new value with every request, get a fresh limit each time
  and never be stopped. They now use the same trusted client address as sign-up and the request
  limits in `proxy.ts`: Vercel's own forwarded header on Vercel, and self-hosted the proxy's header
  only with `CARTWRIGHT_TRUST_PROXY_IP_HEADERS=true` (or `1`). For the contact form that is every
  route it posts to: the AI answer it asks for before sending (`/api/support/triage`, a paid model
  call), its attachments (`/api/contact/upload`, when they are on) and the message itself
  (`/api/inquiries`, with and without a database). Password reset now checks the address's limit
  only after the visitor's, so a visitor already over its limit can no longer use up the limit of
  other people's addresses. On Vercel nothing changes for a visitor.
  **Self-hosted, this changes the limits for everyone.** Without `CARTWRIGHT_TRUST_PROXY_IP_HEADERS`
  — with or without a proxy in front — the whole shop now shares one limit for each of these: the
  contact form's messages (five, then one a minute), its AI answers (three, then one a minute; past
  that a message goes straight to a person, without an AI answer), its attachments (six, then one
  every two minutes) and password reset (ten, then one every six minutes). A single client can use
  any of them up for everyone. The limits are held in memory per server instance, like sign-up's, so
  with several instances each has its own shared limit. That is the price of closing the hole, and a
  shared limit beats none: the contact form has no other spam brake, and without a database every
  message is a mail to the owner. Behind a reverse proxy that overwrites `X-Forwarded-For`, set the
  variable to `true` (or `1`) when you pull this, and every visitor gets its own limit again. A
  server that clients reach directly has no per-visitor limit that cannot be forged — setting the
  variable there would trust the client's own header — so put a reverse proxy in front (a TLS setup
  normally has one) and then set it. A production server that runs self-hosted without the variable
  logs a warning once per server process, the first time a request takes this path (not under
  `pnpm dev`).
- **A magic link is capped per client as well as per address (MAGICLINK-IP-DEAD; low).** "Email me
  a link" on the login page allowed three links per address every twenty minutes, but any number of
  addresses from one client, so a script could make the shop send login mails to a list of strangers
  from the shop's own mail account. Now one client gets ten links and then one every six minutes,
  keyed on the address `trustedClientIp` resolves, as on sign-up: on Vercel, or self-hosted with
  `CARTWRIGHT_TRUST_PROXY_IP_HEADERS` set. Without either the client cannot be told apart, and this
  limit stays off rather than throttle every customer through one shared bucket. A client over the
  limit is sent nothing, but sees the same "check your inbox" as everyone else, so the page does not
  say the limit was hit — and its requests do not count against the address they name. Each send the
  limit drops is logged as a warning, without the address or the IP, so an operator looking into a
  link that never came can see it. The limit is held in memory per server instance, like the others.

### Upgrading
Run `pnpm install` after pulling (the dependency moves under Changed). The three new migration
tables need `pnpm db:push` before you turn on `migrationDashboard`; with the flag off nothing reads
them, and no other change in this release needs a database step. **If you saved Claude Sonnet 4.5**
in `/admin/integrations` → AI, switch to `claude-sonnet-5-5` before 30 Nov 2026 (TREND28-a).
**Self-hosted behind a reverse proxy** that overwrites `X-Forwarded-For`, set
`CARTWRIGHT_TRUST_PROXY_IP_HEADERS=true` (or `1`) so every visitor gets its own contact-form and
password-reset limit again; without it the whole shop shares one (INQ-IP-TRUST). **Nightly backups
need a private Blob store:** if yours have been failing, add a private store's read-write token as a
Production-only `BACKUP_BLOB_READ_WRITE_TOKEN` and redeploy (`docs/backup-restore.md`); a shop whose
one store is private keeps backing up unchanged (BACKUP-CRON-500). A shop that syncs its products
from Google Sheets or restored a SitePack lists its products without variants under their sku from
the first feed fetch, and Merchant Center reviews them again as new items (FEED-SKU). If Stripe is
connected, look for paid agent-checkout sessions with no order (CW-2026-010);
`/api/commerce/agent-checkout` answers `410` now and is removed in the next release. A stored
permalink now answers at its own address once `urls.permalinks` is on (URL5-b), so the advice to
keep the option off on a live shop no longer holds — though nothing in the engine stores a
permalink yet.

### Added
- **`/admin/migration` lists every check a move from WordPress/WooCommerce has to pass before the
  DNS switch, and counts how many of the required ones are green (MIGD-1a).** Behind the new runtime
  flag `migrationDashboard`, default off: while it is off the page answers 404 and the nav entry is
  gone. The board groups 42 checks — URLs, media, SEO, data, redirects, calculator, payment, mail and
  DNS, adapters, automations, cutover — and marks the 14 required ones. "Ready for DNS switch: n/m"
  counts a required check only while its latest run passed less than 24 hours ago on the current
  URL snapshot and new site (and, for a measured pass, the current deploy — MIGD-3 below); skipped,
  inconclusive and never-run checks stay in the denominator. One check runs today, `url.parity`,
  through the `migration.run_checks` tool, and the checks a machine cannot settle alone are signed
  off through `migration.attest` (both MIGD-3 below); the rest read "not run" until later releases
  add them. Underneath: three new tables (`MigrationProject`, `MigrationUrlMap`,
  `MigrationCheckRun`; hoptify's `MigrationJob` is untouched), and a freeze of the old site's URL
  list that previews without writing and, confirmed, replaces the list in one transaction under one
  audit entry, refusing more than 20,000 URLs. Run `pnpm db:push` before
  turning the flag on; the canaries get `prisma/turso-batches/2026-10-24-batch-migd.sql` after batch A.
- **The migration dashboard's URL check has its engine: a status-first fetcher, a sitemap reader and
  the `url.parity` classifier (MIGD-1b).** The `migration.freeze_sitemap` and `migration.run_checks`
  tools (MIGD-3 below) are their only callers, so with `migrationDashboard` off no site requests
  anything new. `migrationGet` (`lib/migration/fetch.ts`) sends one GET with `redirect: "manual"`,
  only to hosts on its allowlist and through the SSRF guard of `lib/import/safe-fetch.ts`, which now
  exports `assertResolvedAddressesPublic`: a 3xx or 4xx is an answer with no page body, no response,
  a 5xx or a 429 is inconclusive, and an empty 2xx is an error. `crawlSitemap` reads a sitemap index
  and its urlsets with their `image:loc`s, follows child sitemaps and redirects only on the root's
  own origin — scheme, host and port, with an http root's upgrade to https as the one exception; one
  anywhere else is reported and never requested — reads a sitemap whose root or any entry is not
  closed as an error rather than a shorter list, and stops at 20,000 URLs. `classifyUrl` requests
  each frozen path on the new host (a source path that starts with `//` included), follows at most
  three redirects without leaving its origin, and names the result: same, same-modulo-slash (a
  warning), redirect (a pass only where a 301 is expected), chain, missing, gone, error or
  inconclusive. A host that is down never fails a row, and a WooCommerce variation URL
  (`?attribute_pa_…`) is a row of its own.
- **Agents can run the migration board: set it up, freeze the old sitemap, run the URL check and
  sign checks off (MIGD-3).** Five tools behind the runtime flag `migrationDashboard` — while it is
  off, each refuses with "Migration dashboard is disabled" before it reads anything. They take the
  scopes keys already carry. `migration.project_set` (`settings:write`, confirm) stores the old and the
  new site as origins; a new source drops the frozen URL map. `migration.freeze_sitemap`
  (`settings:write`) crawls the old site's sitemap — Yoast's `/sitemap_index.xml` unless you name
  another one — and with `dryRun: true` returns the plan without writing; confirmed, it freezes only
  a crawl that read every sitemap. `migration.run_checks` (`settings:read`) runs `url.parity`: each
  call checks at most 120 URLs, four at a time, in about 45 seconds, and returns a cursor until the
  run is done; until then the run reads inconclusive. A cursor does not carry a run across a new
  freeze, a new target or a deploy — run again. A pass counts only for the URL snapshot and the new
  site it measured: give the project another target and earlier passes and sign-offs stop counting;
  set the first target back and they count again while under 24 hours old. A deploy makes earlier
  measured passes stop counting too, but never a sign-off, which was not measured on a build; where no
  build is known (local development) builds are not compared. Two sign-offs saved at the same moment
  both survive: the later one reads the first back in instead of overwriting it. `migration.status` (`settings:read`) reads the
  board and its "Ready for DNS switch" counter. `migration.attest` (`settings:write`, confirm)
  records the owner's sign-off; `cutover.switched` signed off as a pass is the only thing that sets
  the switch time. Every write is one transaction under one audit entry. The admin assistant can use
  all five on an all-tier model (ADMIN-TIER-ENFORCE), with a confirmation card for the three
  writes and none for a freeze's dry run. The shopper chat and voice cannot reach them.
- **The engine can read a live WooCommerce shop and say what importing its catalogue would do,
  without writing anything (W21-live-1).** `lib/woo/` reads the shop's public Store API and `wp/v2`
  into one snapshot — GET only, through the site import's SSRF guard, retrying a 429 or 5xx three
  times with backoff (or the wait the shop's `Retry-After` names, in seconds or as a date) and
  stopping at any other 4xx or a redirect — maps its categories and products onto the engine's
  fields, and plans the import. Each row comes out as a create, an update, unchanged, a skip (edited
  here since the last run; the edit is kept), a conflict (its slug, sku or permalink belongs to
  another row, such as a CSV import, or both sides changed), an orphan (its parent is not in the
  shop's lists) or blocked (it sits under a new category that conflicts). A shop that prices in
  another currency than this one plans no product at all, and nor does one whose prices nobody has
  said include VAT or not, or whose basis differs from this shop's `pricesIncludeVat` (the public
  Store API does not reliably tell): each product is blocked as a `currencyMismatch`,
  `taxBasisUnknown` or `taxBasisMismatch`, the plan says so, and prices are never converted. Woo's
  own minor unit sets the scale, so a shop priced in whole kroner still lands in øre. A product's
  primary category is the deepest of its categories whose address is a prefix of the product's own;
  a further category that is missing, an orphan or blocked is left off that product, with a warning.
  A plain WordPress address (`?product=x`, `?p=12`, under whatever path WordPress is installed at)
  is left unset, so the slug pattern applies. Names and descriptions arrive as plain text with every
  HTML entity decoded once (`&aelig;`, `&#8211;`, `&#x2013;`). A shop whose `wp/v2` has no product
  route, or closes it to guests, is read without the products' status and Yoast fields, and the plan
  says so; with Yoast switched off only the Yoast fields are missing. Either way each missing field
  keeps the value already stored here rather than being erased. Empty categories are read too, so a
  category is never reported missing for having lost its last product. A row the shop no longer
  lists is reported only when every page was fetched and the count matches the shop's total, and it
  is never deleted. Nothing calls this yet: the run that writes, the script, images, variants, stock
  and the admin tool are the next slices, so no shop behaves differently. It belongs to the webshop
  module, so a scaffold without the shop does not carry it.
- **A parent category lists its subcategories' products, and the breadcrumb shows the whole path
  (WP2-r1′).** A shop with nested categories — a WooCommerce import puts products only in the
  innermost ones — used to show an empty page for every parent. Now a category page lists the
  products of the category and of every category below it, with the count and the product list data
  (`ItemList`) to match, and the breadcrumb on category and product pages — the visible trail and
  the `BreadcrumbList` data — runs Home › All products › each parent › the category (› the product).
  A shop whose categories are not nested renders exactly as before, and neither its product pages
  nor its category pages read the category tree: a category page reads it only for a category that
  has a parent or subcategories (the lookup that finds the category counts them), and only once the
  lookup has found it, so a missing category's 404 never reads it either (WP2-TREE-READ-COST). Over
  a subtree of more than 500 categories the page matches them through the parent chain instead of
  one list of ids, which the database client refuses from about 1,000 values: the same products, in
  one query of the same size however wide the tree. A category whose parents loop back on themselves
  keeps the short trail instead of an endless one. Designs that draw their own product-page trail
  (crema, halo) keep their short visible trail there, while the page's `BreadcrumbList` data carries
  the whole chain. Nothing in the engine sets a parent yet (no admin field, tool, CSV or sitepack
  column); the planned WooCommerce import will.
- **The catalogue's category filter, the agent search and the category counts follow the same tree
  (WP2-r1′-b).** `/produkter?kategori=<parent>` and the `categorySlug` filter of the public agent
  tool `products.search` now match the products of the category and of every category below it —
  the list the category page shows. `products.search` answers with the same fields as before, and
  each product still names its own category. `categories.list` keeps `productCount` as the products
  placed in the category itself and adds `productCountWithDescendants` on a category that has
  subcategories; `includeEmpty: false` no longer drops a parent whose products all sit in its
  subcategories. `/admin/kategorier` shows a parent's count as "direct (total)". A shop whose
  categories are not nested, and that files no product under an extra category (WP2-r2′ below),
  gets the same answers from the same product query as before; what changes are the reads around
  it: a filtered catalogue view reads the category list before its product query instead of beside
  it, a `products.search` call with `categorySlug` reads the category tree first, and both read the
  linked categories (WP2-r2′). Over a subtree of more than 500 categories the filter follows each
  category's parent instead of listing every id, because the database client refuses a query with
  more than 999 values (CATEGORY-IN-LIST-BIND-LIMIT): the same products, in one query of the same
  size however wide the tree.
- **A product filed under more than one category shows up in each of them (WP2-r2′).** The
  `ProductCategory` table from schema batch A files a product under extra categories beside its
  primary one (`Product.categoryId`), as WooCommerce does. Until now nothing read it. A product in
  an extra category is now listed like a primary member there and in every category above it: on
  the category page (with its count and `ItemList`), in `/produkter?kategori=`, and in the
  `categorySlug` filter of `products.search`, once each however many of its categories one page
  covers. `categories.list`'s `productCount` and `productCountWithDescendants` and the counts in
  `/admin/kategorier` count it the same way. The product's URL, its canonical, its breadcrumb and the
  category `products.search` reports for it stay its primary category's. This only changes shops
  that have `ProductCategory` rows: a shop without them sends the same product queries and gets the
  same answers as before. What it costs every shop is one indexed read of the linked categories, on
  each category page beside its other reads and with each filtered catalogue view or
  `products.search` call that names a category. Nothing in the engine writes the rows yet (no admin
  field, tool, CSV or sitepack column); the planned WooCommerce import will.
- **`DESIGN.md` says the engine's pickers stay native `<select>` (TREND23-a).** The variant
  picker, the catalogue filters and the language and currency switchers are native selects; a
  design restyles them with `appearance: base-select` inside `@supports` and never swaps them for
  a div dropdown. Customizable select is not Baseline — Firefox lacks it — so Firefox keeps the OS
  select. The playbook also says scroll anchoring is a browser default no design pack turns off, and
  names Safari 27's `safaridriver --mcp` as an optional WebKit check in the screenshot step.

### Changed
- **The header, the mobile menu and the category page's "Explore more" follow a stored category
  permalink once `urls.permalinks` is on (URL5-a2).** Those three still linked `/category/<slug>`,
  so a migrated category kept a second address in the shop's own navigation. With the option on and a
  permalink stored, they now link the permalink in the language the page is read in; without either,
  nothing changes — not even the props sent to the browser. The catalogue page's WebMCP tool now
  sends a stored permalink only when the option is on, so a shop with stored permalinks and the
  option off no longer sends them to the browser.
- **`/.well-known/ai-catalog.json` validates against the ARD schema (ARD-SCHEMA-1).** Lighthouse's
  `ard-schema` audit scored it 0 on every canary: the schema accepts only `specVersion`, `host` and
  `entries` at the top level and only identity fields in a `trustManifest`, and the file sent more.
  The top-level `name`, `description`, `trustManifest` and the legacy `resources` list are gone (no
  consumer in the engine or cartwright.app read `resources`); the store name stays `host.displayName`,
  the description moves to the `llms.txt` entry, `host` gains `documentationUrl` (the developers
  page) and its own trust manifest, and the privacy, terms, contact and about links move from each
  entry's `trustManifest` to its `metadata`, under the same names. Every entry now has 2–5
  `representativeQueries`. What the audit still lists is Low only: most entries use ordinary media
  types such as `text/html`, which are not on its short list of discovery types.
  The catalog validates for ASCII and internationalised domains alike. Every URL in it is now built
  from the parsed `brand.url`, so a setup-wizard domain such as `smørrebrød.dk` is published
  punycoded (`xn--smrrebrd-64af.dk`), which is what the schema's URI format accepts. A domain with no
  scheme is read as `https://`, the same as the setup wizard's domain field. With a port, the
  `did:web` identity percent-encodes the colon, as did:web requires (`did:web:shop.example%3A8443`),
  and the URN publisher is the host name alone. One case cannot be fixed: when `brand.url` is not
  an address at all (empty, a bare `https://`, a space in the host), there is nothing to publish.
  The catalog still answers, but an empty value or a space fails the schema, and a bare `https://`
  passes it only with links that lead nowhere. An IPv6 address (local development only) fails too,
  because ARD's URN publisher must be a domain name.
- **A stored permalink answers at its own address once `urls.permalinks` is on (URL5-b).** The proxy
  looks the requested path up among the products and categories that store a `permalink` (the
  locale stripped, with or without the trailing slash, percent-decoded) and rewrites it to the page
  that renders the entity, in the request's language and with the query kept — so the address a
  migrated shop already ranks on answers 200 instead of 404. This is the step v0.62.0 said to wait
  for before turning the option on in a live shop. The lookup runs before every other path rule (a
  merchant redirect from the same path loses; asked for without the language prefix it skips the
  older redirects and goes to the language redirect), never for `/api`, `/admin`, `/account`,
  `/oauth`, `/icon` or `/og`, sets the language cookie exactly as next-intl does for the pattern
  address, and reads the database once a minute per server instance, keeping the last list on a
  failed read; a deleted or draft product is not served. The links follow what is served: a permalink the
  proxy cannot answer is linked at the pattern, not at an address that would answer 404 or open
  another page — one under a segment named above, one with a dot in its path (`/x.html`; the proxy
  never runs for a dotted path) or an encoded slash, one that under `localePrefix: "never"` starts
  like a path the proxy's matcher skips (`/hero…`, `/favicon-ico…`), one with no path of its
  own or broken percent-encoding (`/`, `/?p=123`, WooCommerce's plain `/?product=<slug>`), and one
  at an address `next.config.ts` redirects before the proxy runs (`/om-os/` in any letter case,
  which goes to the about page; the helper reads the same list, `lib/config-redirects.ts`). Off —
  the default, every shop today — the list is never read and no request changes. WordPress
  pagination, `?p=<id>` and pages/posts are not served yet (`docs/urls.md`).
- **Dependencies moved to their newest releases inside the current majors, each public for at least
  three days.** `next` 16.4.2 with `eslint-config-next` 16.4.2 (Turbopack and docs backports, no
  advisory), `react` and `react-dom` 19.3.1, `ai` 7.0.143 with `@ai-sdk/anthropic` 4.0.82,
  `@ai-sdk/google` 4.0.99, `@ai-sdk/openai-compatible` 3.0.71 and `@ai-sdk/react` 4.0.147, `prisma`,
  `@prisma/client` and both adapters 7.10.1, `zod` 4.6.7, `dompurify` 3.4.17, `@google/genai` 2.30.0,
  `lucide-react` 1.58.0, `resend` 6.34.1, `@vercel/blob` 2.8.2, `postcss` 8.5.30, `@playwright/test`
  1.64.1 and `@typescript-eslint/parser` 8.71.2. No schema change and no code change: a shop picks
  them up with `pnpm install` after pulling.
  React's own advisory of 2026-10-14 (GHSA-xqc2-xf4c-x3h3, remote code execution in
  `react-server-dom-*` with typed arrays) does not need this bump: the engine installs no
  `react-server-dom-*` package and runs the copy bundled inside `next`, which Next.js fixed the same
  day as GHSA-673q-mjm6-r5xr in 16.4.1 (CW-2026-009).
- **The product feeds list a product without variants under its own sku when that sku can be an id
  (FEED-SKU).** Since v0.59.1 a product page's Product data carries the product's sku, but
  `/feed/google.xml` and `/api/acp/feed` still listed every product without variants under its slug
  — so Google Merchant Center, an ACP agent and the page named the same product two ways. A product
  without variants is now listed under its own sku, unless that sku cannot serve as an id (below).
  **Who sees ids change:** a product has its own sku when the Google Sheets sync (`sheetsSync`)
  wrote it — every sheet row needs a sku, so every product the sync has pulled carries one — or when
  a SitePack restore brought it; the admin edits variant skus only, and the `products.*` tools write
  no sku. So in a shop that syncs its products from Google Sheets, or restored a SitePack, every
  product without variants whose sku is free is listed under a new id from the first feed fetch
  after this update. That is the identity fix itself, not a side effect: Merchant Center sees each
  such product as a new item and the item under its old slug id is gone from the feed, so the
  product goes through review again, its history there (approvals, performance) starts over, and a
  Google Ads product group that picks products by item id has to be pointed at the new id. A shop
  whose products have no sku of their own sees no id change. A product keeps its slug as its id when
  it has no sku or an empty one; when its sku starts or ends with whitespace, because ACP checkout
  trims an `item_id` and would look up a different string; when its sku is longer than 50
  characters, Google's limit for an id (counted strictly, so an emoji counts as two); and when its
  sku is already the slug of another product (a draft included) or a variant's sku — a product's sku
  and slug are each unique but not across each other, so such a sku would name two things. A sku id
  is not reserved: if another product later gets that slug, or a variant that sku, the product moves
  back to its slug id, and an agent still holding the older feed's sku id then orders that other
  product (the line echoes that product's slug and name). A product whose sku is its own slug keeps
  the id it had. A sku keeps its case, and the check for a free sku is case-sensitive like the
  database: a sku `CUP` beside a slug `cup` is listed as two ids, which Merchant Center may read as
  one product, since Google does not treat ids that differ only by case as reliably distinct. A
  product with variants is still listed per variant sku. ACP checkout sessions try a bare
  `id`/`item_id` as a slug, then a variant sku, then the own sku of a product without variants — the
  order that lands on that product every id the feed lists for a product without variants, as long
  as ACP's trim leaves the id unchanged (see the padded slug below) — so the slug an older feed
  handed out still works and a product with variants is never ordered by its own sku; the line item
  echoes the id it was ordered by. An explicit `slug` is now only ever looked up as a slug: one that
  names no product answers `acp_line_item_not_found` instead of falling through to a variant with
  that sku, as it did before. An explicit `sku` is only ever a variant's. Not changed: where the
  feeds say a slug, the page's data still says the product's sku if it has one, else its internal
  database id. Also not changed, and older than this entry: a variant's id is its sku, which is
  unique only within its product, so two products' variants can share one (the admin's default
  variant template `var-{height}x{width}-{color}` makes that likely) and a variant's sku can be
  another product's slug. The feed then lists that id twice, and ACP orders one item for both — the
  product with that slug, else whichever of the variants the database returns first. Also older than
  this entry: a product slug that starts or ends with whitespace, which only a SitePack restore
  wrote (it kept a slug as it was exported until SITEPACK-SLUG-VALIDATE below; the admin, the
  `products.*` tools, the CSV import, the Sheets sync, scrape and hoptify write only `a-z0-9-`
  slugs). The feed lists such a slug as it is and ACP trims it on the way back, so `"cup "` orders
  the product whose slug is `cup`, or nothing; Merchant Center trims ids as well.

### Deprecated
- **`/api/commerce/agent-checkout` is removed in the next release.** Until then it answers
  `410 Gone`; after that the path answers `404`, like any API path the shop does not have. An
  agent or integration that still calls it should move to the ACP checkout
  (`/api/acp/v1/checkout_sessions`), on a shop that has turned on ACP and its payment step
  (`ACP_PAYMENT_COMPLETION=1`).

### Fixed
- **A draft product stays off the storefront everywhere, not only in the sitemap and the feed, and
  cannot be put in a cart or paid for (STOREFRONT-DRAFT-FILTER, CART-DRAFT-FILTER).** A product has
  a `status` (`"active"` or `"draft"`), and the sitemap and the catalogue feed already left drafts
  out — but its product page answered 200, and the homepage's featured products, `/produkter`, the
  category page, the related products on a product page, `/api/products/search`, `/pricing.md`, the
  permalink map and the wishlist all listed it. They now read the same rule as the sitemap: not
  deleted and `status: "active"` (`LIVE_PRODUCT_WHERE` in `lib/product-visibility.ts`), and a
  draft's product page answers 404, as a deleted product's does. A draft filed under a category as
  an extra one (WP2-r2′) is left out there too. The agent tools `products.search`, `products.get`,
  `ui.present_products` and the product counts of `categories.list` (extra-category links included)
  leave drafts out for the shopper chat and voice and for anonymous agents; the admin, the admin
  chat and an API key the owner made still see them, and so does `/admin/produkter`, where the owner
  still edits them. The cart and checkout read the same rule everywhere CART-DELETED-PRODUCT (under
  Security) checks for a deletion: adding a draft — from the storefront button or the customer chat
  tool — is refused with the same `Product not found: …` answer; a draft line already in a cart
  drops out of the cart page, the checkout summary, the header count, the agent cart tools and the
  cart-recovery mail; checkout refuses it by name before it creates the order or contacts Stripe
  (`code: "PRODUCT_UNAVAILABLE"`); the stock decrement refuses a product set to draft in the moment
  between, still before Stripe; and ACP checkout neither opens a session for a draft — by slug, by
  its own sku or by a variant's sku — nor charges for one (`acp_line_item_not_found`). Nothing in
  the engine sets a product to draft yet — not the product form, the tools or the imports — so no
  shop sees a difference today; this makes a draft safe the day one can be made: it is neither shown
  nor sold.
- **`pnpm verify:design` uses the browser `PLAYWRIGHT_EXECUTABLE_PATH` names (ARG6).** The screenshot
  gate launched only the exact browser revision the installed Playwright pins, so after a Playwright
  update it stopped with "Executable doesn't exist" even on a machine that had a working Chromium — on
  ours, Playwright 1.64.1 asked for headless shell 1248 next to an installed 1208. When the variable is
  set, the script now launches that browser and says so on the run; unset or blank, it behaves as
  before. A failed launch without the variable now also names it as the way out, after Playwright's
  own "npx playwright install". The sibling `capture-locales` and `capture-gallery` scripts still
  launch the pinned revision only.
- **A missing product or category now answers 404, not a 200 "not found" page that Google treats
  as a soft 404 (SOFT-404-PDP-PLP).** `/product/<slug>` and `/category/<slug>` showed their loading
  skeleton before looking the slug up, and a page that has started streaming has already sent status
  200 — so an unknown or deleted product came back as 200 with "Product not found" and `noindex`, to
  browsers and to Googlebot alike. A migration's redirect check could not see a broken product
  address. The lookup now runs first and the skeleton covers only what loads after it: a missing
  product or category is a real `404` (the shop's normal not-found page, titled like every other
  404), and with the shop switched off (website mode) both routes now send a real `307` to the
  homepage instead of a 200 page that refreshes there. Existing products and categories render the
  same page as before, with the same JSON-LD. Moving from a product list to a product now shows the
  skeleton once the product is found, a moment later than before. `/produkter` keeps its own loading
  skeleton; it never answers 404, so with the shop switched off it still sends a 200 that refreshes
  to the homepage.
- **A SitePack restore stores slugs the way every other write path does (SITEPACK-SLUG-VALIDATE).**
  The restore kept a pack's slugs exactly as written, as long as they were not empty. A product slug
  `"cup "` was therefore created beside an existing `cup`, listed as `"cup "` in the catalog feed, and
  sent to the wrong product — with the wrong price — by ACP checkout, which trims the id. The admin
  forms, the agent tools, the CSV and Sheets imports and the scrape and hoptify paths only ever write
  lowercase a–z, digits and hyphens. Now the restore plan holds products, categories, pages, services
  and posts to that rule before it resolves collisions. A slug that only needs trimming or lowercasing
  is stored that way. Any other slug is renamed with the engine's shared slugify (`"Kaffe & Bønner"`
  becomes `kaffe-boenner`). A slug with nothing usable left (`"   "`) is skipped. A category is the
  exception, because its products link to it: it takes the slug of its name instead, and only when the
  name has nothing usable either is it skipped, together with its products and their variants and
  gallery links. Renamed and skipped rows are listed in the plan's warnings before you confirm, and the
  plan's counts are what the restore then does. A normalised slug that meets an existing one gets the
  usual `-2` suffix. A slug that already meets the rule is kept exactly as it was, even when the pack
  lists a malformed twin (`"cup "` beside `cup`) first: the twin takes the suffix. SKUs are still
  restored verbatim.
- **The Google Drive image import walks the whole folder instead of the same newest 50 files
  every run (DRIVE-IMPORT-PAGINATION).** `/admin/drive` and the `drive.import_folder` tool listed
  one page of 50 files and never asked Drive for the next one, so a folder with more than 50 images
  kept importing nothing beyond its newest 50 — and every run after the first reported those 50 as
  imported again. The import now follows Drive's pages and passes over files an earlier run already
  imported, counting them as skipped, so running it again continues where the last run stopped. A
  run still downloads at most 50 files (imported or failed); when it stops there with files left,
  the result says `more: true` (a new field in the tool's output) and `/admin/drive` says to run
  the import again. Every run starts again at the newest file and walks at most 20,000 (20 pages
  of 1,000, the largest page Drive returns), so only a folder's 20,000 most recently modified files
  are ever reached. A larger folder ends the run with `more: false` and a `drive-folder-too-large`
  error, and `/admin/drive` says to split the folder instead of to run it again. Not changed: a
  file whose bytes match an image already in the media library is still downloaded on every run,
  because the existing asset does not get its Drive id.
- **The nightly database backup says why it cannot run instead of failing in silence
  (BACKUP-CRON-500).** `/api/cron/backup` answered 500 every night on all three canaries, with no
  line in the function log: two had no Blob token, so the job dumped the whole database and only
  then failed; the third had only its media store's `BLOB_READ_WRITE_TOKEN`, and that store is
  public — a backup holds PII and is uploaded as a private blob, which a public store refuses. A
  backup now has its own variable, `BACKUP_BLOB_READ_WRITE_TOKEN`, the read-write token of a
  **private** Blob store, tried before `BLOB_READ_WRITE_TOKEN` (so a shop whose one store is private
  keeps backing up unchanged). With neither, the job answers `503 "backup storage not configured"`
  before touching the database, and the admin setup guide lists "Database backup storage" as missing
  — or as a warning while backups fall back to the media token — and links the runbook on
  cartwright.app (https://cartwright.app/docs/deployment/backup-restore#scheduled, the same steps as
  `docs/backup-restore.md`, whose copy in a shop's own repo is still the one that matches its engine
  version; BACKUP-RUNBOOK-URL), not Vercel's own procedure, which connects the store. Every real run
  that reaches its end writes one `[cron/backup] {…}` line to the log, never a token: `ok` names the
  variable it uploaded with (`storage`), `not_configured` the one to set (`missing`), and `failed`
  its `stage` (`dump` or `upload`) and `storage`; the `not_configured` line and the hint on a failed
  upload end with the runbook link. A failed dry run writes a `failed` line too (`"stage":"dump"`,
  `"dryRun":true`); a successful dry run and a call the `CRON_SECRET` gate refuses write none, and
  `?dryRun=1` answers with the variable a backup would use. Both operator CLIs,
  `scripts/backup-turso.ts` and now `scripts/restore-turso.ts`, cut the Turso token and any
  `authToken=` value out of the error they print, and the backup CLI cuts the Blob token too. To
  turn backups on: create a private Blob store without connecting it to the project, add its
  read-write token as a Production-only `BACKUP_BLOB_READ_WRITE_TOKEN` and redeploy
  (`docs/backup-restore.md`). If the call that fetches the token fails, the runbook's fallback
  connects the store instead — Production only, under the prefix `BACKUP_BLOB` — and then checks
  that it is connected to this one project and no other (BACKUP-RUNBOOK-FALLBACK). Never connect it
  under the default `BLOB` names, which media uploads authenticate with. An EU shop creates it in an
  EU region (`--region fra1`, say): a backup holds customer data, and a store's region defaults to
  `iad1` and cannot be changed later.
- **A saved Claude Sonnet 4.5 says it retires on 30 Nov 2026, and after that day the error says
  what to pick (TREND28-a).** Anthropic retires `claude-sonnet-4-5` that day and recommends
  `claude-sonnet-5-5`. The model list in `/admin/integrations` → AI stopped offering it, but a shop
  that had saved it kept sending it — from the design, copy and SEO generators whatever the
  provider, and from the chat and the test button unless those run on a local model — with only
  "(saved — not in the current list)" beside it, and on the day every one of them would fail with
  Anthropic's bare "not found". Now the form shows a dated warning under a saved Sonnet 4.5 with a
  button that selects `claude-sonnet-5-5` — with the Local provider too, where the form now shows
  the Anthropic model for that reason; you switch by saving, as before. From 30 Nov, Anthropic's
  "not found" for it (the 404 the engine expects; the deprecations page names no status) reads
  "claude-sonnet-4-5 was retired on 30 Nov 2026 — choose claude-sonnet-5-5 in /admin/integrations →
  AI and save.", in the test button and in the operator chat, where every other error stays masked. Nothing is blocked before the day, the saved model is
  never rewritten, and no other model is swapped in on its own; the default (Haiku 4.5) and the shops
  that never picked Sonnet 4.5 see no change. **If your shop uses Sonnet 4.5, switch before 30 Nov.**
  The date, the successor, the source page and the day it was checked are data in
  `lib/ai/model-retirements.ts`.
- **The category page no longer lists deleted products (CAT-DELETED-FILTER).** Deleting a product
  with the `products.delete` tool (the admin chat or an agent key) marks it deleted, and its product
  page already answered "not found" — but the category page kept showing it in the grid, in the
  product count and in its `ItemList` data. It now leaves deleted products out, as the product page
  does. Only a shop that has deleted products sees a difference.
- **The catalogue no longer lists deleted products either (PLP-DELETED-FILTER).** `/produkter` —
  with or without a filter — kept a deleted product in its grid, its product count and its
  `ItemList` data, and its brand and colour filters offered values that only deleted products had.
  It now reads live products only, like the category page and the product page. Only a shop that has
  deleted products sees a difference.
- **A redirect source written with a `/da` or `/en` prefix is refused, and the CSV import sees one
  that is already saved (RED3).** The proxy looks a request up without its locale first and then as
  written, so a saved `/da/old` caught Danish readers — but neither `/admin/redirects` nor the
  import knew it: `/da/old → /old` was saved and looped (`/da/old` strips to `/old`, finds nothing,
  falls back to `/da/old`), and with `/da/old → /new` saved, an imported `/x,/old` put the chain
  `/da/x → /da/old → /da/new` live. A source is now written without the prefix, like a destination —
  `/old` already answers `/da/old` and `/en/old` — and the import treats a saved prefixed source as
  the hop it is, naming it in the error. Redirects saved that way keep working as before; delete one
  and add it without the prefix to bring it under the rules.
- **`/info` answers with an index of the shop's information pages instead of a 404
  (TELOZ-INFO404).** The route only had `/info/<page>`, so the default "Read the docs" button on the
  website-mode homepage — and every other link to the bare `/info` — led to "page not found". It now
  lists the trust pages the footer links (about, contact, privacy, terms, cookies) and every other
  published page, under the same addresses the sitemap gives them, with a `CollectionPage` JSON-LD.
  A `--profile site` scaffold has no CMS and still prunes the route; that half is tracked
  separately.
- **The test that refuses a second `<main>` on a storefront page no longer skips a plugin page it
  cannot find (NOMAIN-RATCHET, NOMAIN-RATCHET-GAPS).** `tests/unit/no-nested-main.test.ts` follows
  each route file's `@/plugins/…` import to the plugin page and checks that page too. Its route
  files now include `template.tsx`, a parallel route's `default.tsx`, the `forbidden.tsx` /
  `unauthorized.tsx` pages and a `layout.tsx` nested under `app/[locale]`, which render inside the
  layout's `<main>` as well, and each may end in `.ts`, `.jsx` or `.js`, as Next allows — a
  `page.ts` that only re-exported a plugin page was not walked at all. A plugin page written in
  `.jsx` or `.js` is found and checked like a `.tsx`, where it used to be passed over, with its
  extension named or not. An import it could not follow to a `.tsx` file — a
  barrel, a `.ts` module, a path that does not exist — was dropped without a word, and a
  `next/dynamic` or `import()` mount was not looked for at all, so a `<main>` behind either went
  unchecked. It now reads `import(…)` and `require(…)` mounts too, with a quoted or a backtick
  specifier. A mounted `.tsx` that does not define its own default export — an `index.tsx` barrel, a
  page that is only a re-export shim — is followed through what it forwards (`export … from`, or an
  imported name it exports again) to the page behind it, hop by hop, and that page is checked. A
  `.ts` on the way is followed the same way, since a `.ts` barrel can stand in front of a page, but
  is never checked itself; a stylesheet, a CSS module or a JSON file a route imports is passed over.
  Any mount or forward it cannot follow to a file in the repo — a package, a missing path, an
  `import(…)` of a template with `${…}` in it, of a variable or of a `+` with one, unless its
  literal start rules out a plugin (`"@/data/" + locale + ".json"`) — fails the test, naming the
  route and every hop. The test reads imports with the TypeScript parser, and only what exists at
  runtime counts: `import type`, `export type`, an entry marked `type` (`export { type Props } from
  "./types"`) and an import type (`type Props = import("…").Props`) are not followed. A `<main>`
  counts only as a JSX element, so one named in a comment, a string or a regex no longer fails a
  page, and a regex with `//` in it no longer hides a real one. Next renders a route file's default
  export alone, so a route's `export { default, generateMetadata } from …` follows the default, and
  a shim that forwards its default to a page and `generateMetadata` from a `.ts` passes; through a
  named import or an `import()`, which may take any export, every forward is still followed. `export
  default` with the name on the next line, in parentheses or behind `as`, `satisfies` or `!` is
  followed like `export default Name;`, where it was taken for a page and the `<main>` behind it
  went unchecked. So is a shim that exports again a name a module-scope `const X = require(…)` or
  `await import(…)` binds (or a `.default` or `.Name` read off one, or `{ default: X }`), and one
  whose `export default` is such a call; a `const` of the same name inside a function is not taken
  for it. framer-motion's `<motion.main>` and `<m.main>` count as a `<main>` too; another component
  that is merely named `.main`, such as `<icons.main>`, does not. Every route in the engine
  resolves, and nothing a shop renders changes; a shop route that imports a plugin's `.ts` helper,
  styles or data passes, and one that reaches a plugin page through a package sees this test fail
  until the route imports the page file directly.
- **The `GET /api/mcp` introduction points an agent at the server card instead of a dead page
  (MCP-INTRO-MANIFEST).** Its `manifest` field named `/manifest`, which answers 307 → 404 on every
  deploy — the reason it was already taken out of the sitemap. The field is gone, and a new
  `serverCard` field names `/.well-known/mcp.json`, the MCP server card. It sits behind the same
  `mcpPublic` switch as the introduction, so it answers whenever the introduction does.
  `liveChangelog` is unchanged.
- **The local-AI cards in `/admin/integrations` count the admin tools instead of saying 37
  (ADMIN-COPY-37).** The top tier read "All 37 admin tools" while the admin chat had 40 (45 now,
  with the five migration tools of MIGD-3), and the two smaller tiers "~10" and "~15" where they
  hold 10 and 16. All three labels are now counted from the
  allowlist through the same tier lists the admin chat filters its tools with (`lib/ai/admin-tools.ts`,
  applied by ADMIN-TIER-ENFORCE), so a label cannot count a different list than the chat offers, and
  `docs/local-ai.md` names the tiers without numbers.
- **A signed-out customer can open the forgot-password page and the reset link
  (PASSWORD-RESET-GATE).** Ever since the password-reset flow shipped, the proxy sent a signed-out
  visitor from `/account/forgot-password` and from the email's reset link
  (`/account/reset-password?token=…`) to the login page — so nobody who was signed out, the only
  people who need it, could reset a password. Both pages now open, with or without a locale prefix
  and a trailing slash, the token kept. The pages the gate leaves open (login, signup and these two)
  are now matched as a whole path segment, so an address that merely contains one of their names,
  such as `/account/login-history`, is gated like every other account page. Signed in, nothing
  changes.
- **Featured products on the homepage carry their photo in `imageUrl` (ARG5).** The blank-canvas
  guide told a builder that each featured product comes with a computed `imageUrl`, and the
  atelier, northern-coffee, webshop-bold, webshop-editorial and webshop-minimal homepages render
  their product photos from it. Nothing set the field, so those cards always showed no photo. The
  homepage now sets it to the product's first image, from the same resolver the product cards use,
  or to null when the product has none. The database query is unchanged. Only the homepage sets it:
  the field's documentation in `designs/types.ts` says so, and tells a design that renders product
  lists elsewhere to call `resolveProductImageUrls` itself.
- **The Google Drive backup reports its size in bytes (DRIVE-BACKUP-BYTES).** `bytes` in the
  result of the Drive backup — the `/api/cron/drive-backup` answer and the `drive.backup_now` tool
  output — was the JSON string's length, which counts UTF-16 code units, so every æ, ø, å or other
  non-ASCII character in the dump made the number smaller than the file Drive received. It is now
  the UTF-8 byte count, the same bytes the upload sends. The file itself was always uploaded
  correctly; only the reported number was wrong.
- **The product CSV import refuses a file over 1 MB up front and says how to split it, instead of
  failing with nothing saved (PRODUCT-CSV-BODY-LIMIT).** `/admin/produkter/import` sends the whole CSV
  to a Server Action, and Next refuses an action request over 1 MB — the default
  `serverActions.bodySizeLimit`, which `next.config.ts` does not raise — before the action runs, so a
  larger catalogue ended on the error page and no row was imported. The form now measures what it
  would send (a quote or a line break counts twice, as it does on the wire) and refuses an oversized
  file or paste with a message: split it into parts that each start with the header row, and import
  them one after another — rows are upserted by slug, so the parts add up to the whole file. The
  action keeps the same bound, and a call that fails now shows a message instead of the error page.
  The limit itself is unchanged: it covers every Server Action in the app, so raising it is an owner
  decision, not this form's.
- **Snapshot & Restore reads the features the site runs with, and stops when it cannot read them
  (SITEPACK-RUNTIME-FLAGS).** The pack's `featuresRequested` list came from the defaults in
  `brand.config.ts`, so it left out a feature turned on in `/admin/features`. That list is
  informational: nothing reads it on restore, and the pack already carried the stored switches
  themselves in its branding (`featureOverridesJson`). The restore check read the same defaults, so
  a pack whose `featuresRequired` named a feature switched on in `/admin/features` drew a false
  "Required feature … is not enabled" warning. A pack exported by Cartwright cannot draw it — it
  requires `webshop` or nothing, and `webshop` is set in `brand.config.ts` only — so only a
  hand-written or third-party pack could. Both now read the live switches the tools' own `sitePack`
  gate reads. New: when those switches cannot be read (the database is unreachable), export and
  restore stop with a clear message instead of working from the `brand.config.ts` defaults, which
  may hold a feature — `sitePack` among them — that the admin has switched off.
- **The agent rules files start the dev server with `pnpm dev:agent` instead of assuming port
  3000 (TREND5-a).** `AGENTS.md`, `.claude/CLAUDE.md`, `GEMINI.md` and the Cursor, Copilot and
  Windsurf rules said `pnpm dev` and then sent every tool call to `http://localhost:3000` — but
  `next dev` moves on to 3001 when 3000 is taken, so an agent on a machine that already ran a server
  there talked to that other server. All six now carry the same recipe, and it turns on one fact:
  is the `next dev` whose PID `pnpm dev:agent` now writes to `.cartwright/dev-pid` (gitignored,
  removed on exit, beside the URL in `.cartwright/dev-url`) alive? Then it reuses that server — Next
  allows one `next dev` per project — even while its URL does not answer yet. If not (a hard kill
  leaves both files behind, and another app may take the port), it deletes both and starts
  `pnpm dev:agent` in the background. Either way it polls the URL for a 200 with a bound and takes
  `$BASE` from it for every curl example; a server the recipe started is `kill`ed when done.
  `DESIGN.md`'s examples and screenshot step follow it. A unit test runs the recipe against a stub
  `pnpm` and fails if it starts a second server or deletes the files while its `next dev` lives —
  also when that server's URL times out or nothing listens there yet — or reuses a URL whose
  `next dev` PID is gone, stops waiting on an answer that is not a 200, or keeps waiting after the
  server it started has exited; it runs `dev-agent.mjs` against a fake `next` to check that the PID
  file is written before the URL and that a file another server has written since survives the exit,
  reads the six copies with CRLF line endings too, and fails if they drift apart, a hard-coded
  `localhost:3000` comes back, or the after-a-reboot hint goes back to a bare `ps -p` (procps on Linux
  prints only `node` for it, so a live server's files would be deleted; `ps -o args= -p` prints the
  whole command line). No route changes.
- **`next dev` run by an AI agent no longer rewrites `AGENTS.md` (TREND24-a).** When it detects an
  agent, Next 16.4 compares the managed `nextjs-agent-rules` block at the top of `AGENTS.md` with
  the one it generates and rewrites the file when they differ. Ours said `#` where Next writes
  `##`, so an agent's first `next dev` left an uncommitted change in a fresh project. The block is
  now exactly what Next writes, and an engine test asks Next's own check, so a Next upgrade that
  changes the block fails in our dependency update instead of in your working tree.
- **The `cartwright-guidance` skill no longer says a modal closes on a backdrop click by itself
  (TREND27-a).** It said the browser handles "backdrop dismiss" for `<dialog>`. A modal `<dialog>`
  closes on Escape, not on a click outside it, so an agent trusting the skill could build a modal
  that ignores a backdrop click. The skill now says to close it from an `onClick` that checks `e.target === dialog`,
  as the mobile menu and the AI assistant panel do; `closedby="any"` does it declaratively but is
  not supported everywhere yet. Nothing changes in how the site renders.
- **`Foo@x.dk` and `foo@x.dk` are one customer account (REG-EMAIL-CASE).** Sign-up saved the
  address as typed and login looked it up the same way, so one person could end up with two accounts
  just by the capitals they typed. Sign-up now saves the address lowercased — the spelling a magic
  link and a password reset look up — and sign-up and login compare the address case-insensitively
  with the accounts as they are stored. No schema change, and no data is changed. So an account a
  shop already holds as `Ada@Example.com` counts as taken when someone signs up as
  `ada@example.com`, and signs in with the address typed in any case; on SQLite and Turso a capital
  outside ASCII (`JÖRG@…`) still has to be typed the way it was saved. Where one address already has
  more than one account with a password, differing only in case, the spelling typed exactly signs in
  to its own account, as before; a spelling that is none of them is refused like a wrong password
  rather than guessed, and typed the way one of them was saved, it works. A password login passes
  over an account that has no password, so the passwordless lowercased account a magic link may have
  made beside a capitalised one does not stand in its way. Not covered yet: a password reset and a
  magic link still look the address up lowercased only, so for an account saved with capitals a
  reset sends nothing, and a magic link signs in to a separate lowercased account, creating it the
  first time.
- **After signing up, the customer lands on the login page in the language they signed up in
  (REG-LOGIN-LOCALE).** The sign-up form sent everyone to `/account/login` without a language, which
  took an extra redirect and left the language to the proxy's guess, so a customer signing up on
  `/en/` could be shown the login page in the shop's default language. The address is now built by
  `lib/urls.ts`, so it also follows `urls.trailingSlash` and `localePrefix: "never"`.
- **A catalogue search or filter with no results answers in the page's language (ARG4).** The
  empty state of the product grid — "No products match …", the hint below it and "Browse all
  products" — was English on every page, so `/da/produkter?q=…` on a Danish shop answered in English.
  It now reads the page's language; English pages show exactly the words they showed before.
- **The review page a post-purchase email links to, and the customer's wishlist, follow the page's
  language (I18N-REVIEW-WISHLIST).** Both were Danish on every shop — "← Til forsiden", "Min
  ønskeliste", "← Min konto" and the sentences around them — so an English shop's customer met a
  Danish page. Danish pages read exactly as before.
- **"Explore more" on a category page links in the page's language, and its heading is translated
  (CAT-RELATED-LOCALE).** The related-category tiles linked `/category/<slug>` with no language, so
  with the default `localePrefix` every click went through an extra redirect to a language-prefixed
  address. A browser was usually sent back to the language it was reading, by next-intl's language
  cookie or its `Accept-Language`; a client with neither — a crawler, an AI agent — landed in the
  shop's default language instead. The tiles now link the category in the page's language, and the
  heading, English on every page until now, reads "Udforsk mere" on a Danish page; English pages
  read as before.
- **`/admin/audit` names the Stripe webhook, and speaks English (AUDIT-ACTOR-LABEL).** Refund,
  dispute and payment-not-applied rows showed as "Ukendt" (unknown); they now carry a "Stripe
  webhook" badge. In-place copy edits and customer voice sessions get their own badges too, and
  uploads are badged "Admin (web)". The page's Danish labels are now English, like the rest of the
  admin: the "Kunde-chat" badge, the filter form ("Filtrér", "Nulstil", "Alle", "Kun success"), the
  payload viewer ("Vis payload", "Skjul", "Resultat"), the rollback button ("Rul tilbage",
  "Ruller…") and its "Gendannet" confirmation. Its dates are written the British English way
  (`24/10/2026, 12:30`), as `/admin/plus` already does; most other admin pages still write them the
  Danish way. Still open: a signed-in customer's own subscription change is badged "Admin (web)" as
  well, because its row's actor (`user:<id>`) carries no role to tell the two apart.

## v0.62.0 — 2026-10-19

### 🔒 Security
- **`next` 16.4.1 closes two critical and one high upstream advisory (CW-2026-009).** Next.js'
  security release of 2026-10-14 fixes remote code execution in `use cache` functions that return
  typed arrays (GHSA-673q-mjm6-r5xr, critical), remote code execution in Image Optimization when SVG
  files are used (GHSA-2464-fhr4-w9xw, critical) and a denial of service in the App Router through
  Server Actions (GHSA-p3m5-59mp-jv5r, high). The engine itself writes no `use cache` function and
  does not set `images.dangerouslyAllowSVG`, so the two critical ones are not known to be reachable
  in an unchanged shop — but a shop may add either, and the App Router enables Server Actions by
  default, so the denial of service is treated as reaching every Cartwright shop. `next` and
  `eslint-config-next` move to 16.4.1. It was younger than the three-day cooldown when it landed on
  `main`, so its twelve exact versions sat in `minimumReleaseAgeExclude`; 16.4.1 is older than three
  days now, so this release drops that block again and the cooldown applies to every package.
- **A production deploy without `CRON_SECRET` refuses its cron calls (CW-2026-008, CRON-AUTH-b;
  moderate — an insecure default closed).** Until now every route under `/api/cron` ran for any caller while no
  `CRON_SECRET` was set, because Vercel Cron sends its `Authorization` header only once the secret
  exists: anyone who knew a path could start a backup, delete expired tokens and old audit-log
  rows, send cart-recovery mail, refresh FX rates or take the SEO snapshot. v0.60.0 announced the
  change for the next release (Deprecated); v0.61.0 did not carry it. Now `verifyCronRequest`
  (`lib/cron/auth.ts`) answers such a call in production with `503` and
  `{"error":"CRON_SECRET not configured on this deploy"}`, and the job does not run. It is a 503,
  not a 401, because no header could pass: the deploy lacks configuration, and the Vercel Cron log
  should say that rather than look like a wrong secret. Production is what the v0.60.0 warning
  already called it, `VERCEL_ENV=production` or `NODE_ENV=production`: a Vercel production deploy,
  `next start`, a container — and a Vercel preview, which runs as a production build (Vercel Cron
  never calls a preview, so no scheduled job stops there). `next dev` and the test suite still let
  the call through. With the secret set, a wrong or missing bearer is a 401 as before. All eleven
  routes go through the helper, eight in `app/` and three mounted from the reviews and
  google-workspace plugins; the two machine-only admin routes that take the same bearer
  (`/api/admin/run-pending-migrations`, `/api/admin/reset-demo-data`) already refused without it.
  The admin bar on every page and the setup guide's `CRON_SECRET` item now say the jobs are
  refused, and each server instance logs the refusal once. A test calls every handler it finds
  under `app/api/cron` in production and fails unless it answers 503 without the secret and 401
  with a wrong or missing one, before it reaches the database or the network.

### Upgrading
**Set `CRON_SECRET` in your production environment before you deploy this release**, if you have
not: generate one with `openssl rand -hex 32`, add it as `CRON_SECRET` to the production
environment (Vercel → Settings → Environment Variables) and redeploy. Vercel Cron sends
`Authorization: Bearer <CRON_SECRET>` only when that variable exists, so without it every
scheduled job — backup, Stripe reconciliation, token clean-up, audit retention and the rest — is
refused and stops running. A shop on its own server or in a container schedules its crons with the
same header (`docs/self-hosting.md`).

### Fixed
- **Admin-managed redirects work without Upstash Redis (RED1).** Until now the proxy read the
  redirect map from Redis only, so on a shop without `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` — the default scaffold — a redirect saved in `/admin/redirects`, or
  imported from CSV through `redirects.import`, was stored and never served. Now
  `lib/redirects/load.ts` reads the map from Redis when it is configured (unchanged) and otherwise
  from the `Redirect` table, cached for 60 seconds per server instance, so a new or deleted
  redirect takes effect within about a minute. A failing read means no redirect, as before. Nothing
  is built at import. The admin page and the tool description no longer say Redis is required.
- **The review-request mail links to the shop's own language** (URL2-d). It hardcoded `/da/review/…`,
  so on a shop whose base language is not Danish the link led to a route that does not exist. It now
  uses `brand.defaultLocale`, and keeps the language in the address even under
  `localePrefix: "never"` (the signed token has a dot, so only the prefixed address reaches the review
  page). The abandoned-cart mail links `/<defaultLocale>/cart` instead of a bare `/cart` that needed a
  redirect.
- **The last hand-built storefront links go through `lib/urls.ts`** (URL2-d): the four shared chrome
  parts (minimal/centered headers, slim/mega footers), the Flux, Halo, Aerospace and Drive 404 pages,
  Halo's catalogue link on the product page, the blog index cards and its JSON-LD, and the wishlist
  and review pages. With `brand.urls` unset every link is the same string as before; with
  `trailingSlash` or `localePrefix: "never"` they answer without a redirect. The design packs' own
  headers and footers are the next slice.

### Changed
- **Dependencies moved to their newest releases inside the current majors, each public for at least
  three days.** `next` 16.4.0 with `eslint-config-next` 16.4.0, `ai` 7.0.137 with
  `@ai-sdk/anthropic` 4.0.78, `@ai-sdk/google` 4.0.93, `@ai-sdk/openai-compatible` 3.0.67 and
  `@ai-sdk/react` 4.0.140, `@modelcontextprotocol/sdk` 1.32.1, `@google/genai` 2.28.0,
  `@vercel/blob` 2.8.1, `lucide-react` 1.54.0, `resend` 6.32.1, and the dev packages
  `@playwright/test` 1.64.0, `vite` 8.3.4, `postcss` 8.5.29 and `@typescript-eslint/parser` 8.71.1.
  No direct dependency moved a major, and no code changed: nothing in the engine used the
  experimental options Next 16.4 removed (`experimental.appNewScrollHandler`, `unstable_eager`).
  `pnpm audit --prod` reports no known advisory. The one dev-only advisory stays open, because its
  fixed release does not exist on npm yet (`braces` 3.0.3, GHSA-vfj7-8cjw-p6xm, which lists 3.0.4 as
  patched; reached only through `eslint-config-next` at lint time).
- **A product or category stored with a `permalink` is linked at it on every surface once
  `urls.permalinks` is on (URL5-a).** Before, the option changed nothing: every call site handed
  `lib/urls.ts` the slug alone. Now each one hands over the slug and the permalink of the same entity
  — the product and category pages' canonical, language alternates and BreadcrumbList, the sitemap,
  `/pricing.md`, the catalog feed, the product-search API's `url`, the product card (rendered without
  a locale it links the permalink in the locale the page is rendered in), the design packs' homepage and card links,
  the footer, the cart, the review pages and the PLP's WebMCP `url` — and
  `tests/unit/no-raw-product-href.test.ts` fails on a call that passes one without the other, or that
  takes them from two entities where the slug is written `x.slug` (a slug held in a local variable is
  checked by reading the call site). `DesignProduct` and `DesignCategory` gain an optional `permalink`. With the
  option off — the default, every shop today — the stored column is ignored and every link is the
  same string as before. The shop does not serve a permalink yet (URL5-b), so leave the option
  unset on a live shop. Still on the pattern, listed in `docs/urls.md`: the header and mobile-menu
  category navigation, the category page's "Explore more" list, the shopping assistant's product
  cards, the IndexNow ping, the coffee pack's brew-recommendation tool and the agent checkout's
  `cancel_url`.

## v0.61.0 — 2026-10-11

A shop can now run as a Node container on any host: the repo ships a `Dockerfile`, and
`CARTWRIGHT_OUTPUT=standalone pnpm build` writes a standalone server with no `.env` file left in it
(`docs/self-hosting.md`). On a single-language shop that sets `urls.localePrefix: "never"`, the
pages answer without the language in front, and the engine's footer, trust badges, cookie banner,
breadcrumbs and 404s link straight to the address the shop serves with either URL option.
Cancelling an order that was never paid puts its items back in stock exactly once, and an operator
status change that a cancel or a payment beats to the order — landing between the change's read and
its write — is refused instead of overwriting it.

### Upgrading
No schema change: no `pnpm db:push` is needed, no flag was added and no dependency changed. The
URL options stay off unless you set them; `trailingSlash` and `localePrefix` now steer routing,
while a stored `permalink` is still not served at its address, so keep `permalinks` at `false` on a
live shop (`docs/urls.md`). The cron change announced in v0.60.0 — a production deploy without
`CRON_SECRET` refusing its cron calls — is **not** in this release; it is still the next one, so set
`CRON_SECRET` now if you have not.

### ✨ Added
- **A shop can run as a Node container on any host (HOST2-1).** The repo now ships a `Dockerfile`
  (Node 22 as `.nvmrc` names it, pnpm through corepack, a non-root runtime with a health check) and
  a `.dockerignore` that keeps `.env` files, credentials, SQLite databases, `backups/` and
  `.mail-previews/` out of the image at any depth — `prisma/dev.db` and `data/prod.db` included.
  `CARTWRIGHT_OUTPUT=standalone pnpm build` writes `.next/standalone/server.js` and traces the same
  local data out of it. Next itself copies the root `.env` and `.env.production` into that
  directory after tracing, so the build deletes every `.env*` file there as it exits, and the
  server reads its variables from the environment it starts in. Without the variable
  `next.config.ts` has no `output` key and adds no exit step, so a Vercel build is unchanged; any
  other value stops the build. One Dockerfile is written for every profile and never runs Prisma
  itself (an image of a `site` scaffold is untested). `docs/self-hosting.md` covers build
  arguments, runtime variables, Turso or a SQLite file on a volume, and what still needs a Vercel
  service: the cron jobs (a runner is HOST2-2) and Vercel Blob storage (an S3 adapter is HOST2-3).
- `urls.localePrefix: "never"` now steers routing as well as links, on a single-language shop
  that opts in: `/` and `/contact` answer directly (200, no redirect to `/da`), and an address
  with the language in front (`/da/contact`) answers with a permanent redirect (308) to
  `/contact`. next-intl decides the route; the proxy only makes its redirect permanent. The
  proxy's own redirects (trust-page aliases, legacy Danish paths, merchant redirects) and the
  `/om-os` alias land on the unprefixed page in one hop, also with `urls.trailingSlash`. Every
  canonical and `og:url` the engine writes, both sitemaps, the page links in `llms.txt` and the
  JSON-LD addresses of the catalogue, service, blog and breadcrumb data drop the prefix. `/api`,
  `/admin`, `/oauth`, `/icon`, `/og` and files are not touched. A single language alone never
  drops the prefix — the option must be set — and the build now refuses `"never"` with more than
  one locale. The locale patterns in both proxies and in the merchant-redirect matcher are now
  built from `brand.locales` instead of a hardcoded `da|en`, and the cart's WebMCP
  `go_to_checkout` no longer reads `/cart` as a locale. Links the engine still writes by hand
  (`/da/…` in e-mails, for one — the footer, trust badges, cookie banner, breadcrumbs and 404 page
  moved, see Fixed) reach their page through that one 308 until they adopt the helper. With the
  option unset next-intl receives exactly the config it did before (`docs/urls.md`).

### 🛠 Fixed
- **The engine's footer (including the trust badges), cookie banner, announcement bar, breadcrumbs
  and 404s link where the shop answers with `urls.trailingSlash` or
  `urls.localePrefix: "never"` (URL2-c).** Their links were written by hand (`/da/contact`), so on
  a shop with either option every click on one took a 308 to the address the shop serves. They now
  go through `lib/urls.ts` (`localeHref(path, locale)`): the footer in both profiles, the trust
  badges wherever they render (the footer, the product, category and checkout pages, the
  aurora-shop, hoptify and webshop-classic homepages), the cookie banner's policy link on every
  page, the announcement bar's audit-feed link, the visible breadcrumbs and their steps in the
  product, category, catalogue, service and blog-post JSON-LD, and the recovery links on both 404s
  (the not-found page, and the catch-all for an address nothing serves, in markdown and HTML). Each
  is already the address the shop serves (`/contact/`, `/info/terms/`, `/produkter/`). With the
  options unset every link is the same string as before. A design pack that brings its own header
  and footer (`apex`, which Solbrillen runs, is one) shows its own links instead of the engine
  footer's, and those are not converted. Still written by hand on the storefront, so still one 308
  away: every link in the `chrome-parts` headers and footers; the headers and footers of the 17
  packs that bring their own, the packs' own 404 pages, the fixed-route links on pack homepages
  (`/produkter`, `/contact`, `/about`, `/services`, `/info/…` — the default `aurora-shop` and
  Northbound's `crema` among them) and the crema and halo product-page crumb; the catalogue's
  filter links, its empty-grid link and its WebMCP navigation; the AI stylist panel's cart,
  checkout, order and returns links; the login form's forgot-password link; the services index's
  links to each service; the order page's "Continue shopping"; the blog index's post links; the
  wishlist and order-review pages and their sign-in redirects, the wishlist button's sign-in
  redirect and the review page's home link; and links in e-mails. `docs/urls.md` lists the files.
- **Cancelling an order that was never paid puts its items back in stock.** Checkout takes the
  stock when the order is placed, but cancelling an order still awaiting payment never gave it
  back: the admin status form, the bulk action and `orders.update_status` only changed the status,
  and so did Stripe's "payment cancelled" notification — which, since cancelling an order now
  cancels its Stripe payment, arrives for every such cancel. Those items stayed out of stock for
  good. Now the stock comes back exactly once, whichever gets there first — your cancel, Stripe's
  notification, the nightly check, or checkout's own rollback when the payment could not be set
  up — and a variant's stock goes back to that variant. The admin status form, the bulk action and
  `orders.update_status` note "items returned to stock" on the order timeline, and the tool also
  reports `restocked: true` in its result. Stripe's notification no longer
  overwrites an order that has moved on: a paid, flagged, shipped or refunded order stays as it is.
  An order you cancel after it was paid gets no stock back here — a return does that. A cancel
  reads the order's status when it runs: if the customer has paid by then, it is an ordinary cancel
  of a paid order (no stock back), and if Stripe's notification or the nightly check cancelled the
  order first, your cancel is refused. A payment that lands after the cancel read the order but
  before it wrote refuses the cancel too (see RACE-MARKPAID below), and the order stays paid.
- **The agent rules files no longer name CSS the engine does not use (SKILL-INTERPOLATE).** The
  `cartwright-guidance` skill said `<details>` animates with `interpolate-size` and honours reduced
  motion there; no stylesheet has ever used `interpolate-size` or `calc-size()`, so that line is
  gone, and the Cursor, Windsurf and Gemini rules no longer offer them as the engine's CSS
  animation tools (`@starting-style`, which the mobile menu uses, stays). The skill's
  `lib/shipping/` line now says what `.claude/CLAUDE.md` says: zones are stored, but every order
  pays the flat rate. A unit test fails if `AGENTS.md`, its sibling rules files or a project skill
  names passkeys before WebAuthn exists, or `interpolate-size`/`calc-size()` before a stylesheet
  uses it.
- **A status change no longer overwrites a change that landed while it ran (RACE-MARKPAID).**
  Every operator status change — the admin status form, the bulk action and `orders.update_status` —
  read the order and then wrote the new status unconditionally, so a cancel, a payment or another
  operator landing in the moment between that read and the write was overwritten: a "mark paid"
  racing a cancel could leave a paid order whose items had already gone back to stock, so the same
  units could be shipped and sold a second time. Now the write lands only if the order is still in
  the status it was read in; otherwise nothing is written and the change is refused with "it changed
  while it was being updated — reload the order and try again". A change clicked on a page opened
  earlier is still checked against the order's status when it runs, as before (a cancelled order
  refuses "mark paid" as an illegal move). The same holds for the flag Stripe's
  notification and the nightly check set when a payment's amount does not match: an order
  cancelled in the meantime stays cancelled. Refunds and disputes Stripe reports still always
  land, since they record money that moved. `orders.update_status` now also writes the
  order-timeline note the admin status form writes, so a change made through the AI or REST tool
  shows on the order page, and the audit entry of an admin cancel that returned stock records
  `restocked: true`.

## v0.60.0 — 2026-10-10

Two high dependency advisories below `next` close (CW-2026-007: `sharp`, `source-map-js`) —
upgrade. A shop's product and category links now come from one helper with three URL options, all
off by default, and `urls.trailingSlash` steers routing too: a storefront page asked for without its
slash gets a permanent redirect to the slash form, while `/api`, `/admin` and a `POST` are never
redirected; links still written by hand (the footer's contact and info links, for example) take
that one redirect until they move to the helper. `/built-with-cartwright` and `llms.txt` stop
claiming zone shipping (checkout charges the flat rate) and passkeys (there are none), and
`/admin/features` marks zone shipping as not implemented. The root layout's Geist pair, Brutalist's
three fonts and the Space Mono of Editorial Ink and Meridian are self-hosted, so a build no longer
asks Google for them. Every cron route checks `CRON_SECRET` through one constant-time helper, and a
production deploy without the secret now says so — the next release refuses its cron calls (see
Deprecated). Cancelling an unpaid order cancels its Stripe payment, and the nightly Stripe check
gets multi-currency orders and variant restocks right. Every WebMCP browser tool states Chrome's
three annotations, the AI model picker offers Sonnet 5.5 and Opus 5.5, "Translate" on a vibe page
works again, and an unknown chat model says it runs read-only. No schema change: no
`pnpm db:push` is needed (see Upgrading).

### 🔒 Security
- **`sharp` and `source-map-js` move to their patched releases (CW-2026-007).** Two high
  `pnpm audit --prod` advisories, both below `next`: `sharp` 0.35.5 fixes GHSA-wq5f-xc86-pv6w
  (librsvg, the SVG decoder in Next's optional image optimiser) and `source-map-js` 1.2.2 fixes
  GHSA-68fv-2mgg-jv7q (denial of service through indexed source-map sections; reached through
  `postcss` at build time). Neither is known to be reachable from a request in a shipped shop:
  `next.config.ts` does not set `dangerouslyAllowSVG`, and on Vercel image optimisation runs
  outside your functions. A shop that runs `next start` itself (a container or its own server) does
  run `sharp`, so upgrade regardless. Two `overrides` selectors in `pnpm-workspace.yaml` carry the
  fix; `pnpm audit --prod` now reports no known advisory. The twelve `next` 16.3.8 entries leave
  `minimumReleaseAgeExclude`, because that release is now older than the three-day cutoff.
- **Every cron route checks its secret through one helper, in constant time (low — hardening).**
  The eleven scheduled-job handlers under `/api/cron` (eight in `app/`, three mounted from the
  reviews and google-workspace plugins) each carried their own copy of the `CRON_SECRET` check and
  compared the `Authorization` header with `!==`, whose running time depends on how much of a guess
  matches. They now all call `verifyCronRequest` (`lib/cron/auth.ts`), which hashes both sides and
  compares them with `timingSafeEqual`; the two machine-only admin routes that take the same bearer
  (`/api/admin/run-pending-migrations`, `/api/admin/reset-demo-data`) compare through the same
  `cronBearerMatches` it uses. No exploit is known, so there is no advisory id. What stays open:
  **without `CRON_SECRET` these routes answer anyone** — backups, audit-log and token deletion,
  cart-recovery mail, FX refresh, the SEO snapshot. That is unchanged in this release (see
  Deprecated), so set `CRON_SECRET` in your production environment now. A production deploy
  without it now says so on every admin page and in the setup guide (`/admin/integrations`), and
  each server instance logs a warning on its first cron call. A test fails if a route under
  `app/api/cron` does not carry one `verifyCronRequest` guard per handler or reads `CRON_SECRET`
  itself, or if `===`/`!==` compares against a `Bearer ${…}` template literal anywhere in `app/`,
  `lib/`, `plugins/` or `components/` (a bearer built any other way, or held in a variable first,
  is not caught by that scan).

### ✨ Added
- A shop gets one place its public links are built from (`lib/urls.ts`) and three URL
  options in `brand.config.ts` — keep an imported address, end every path in `/`, drop the
  language prefix on a single-language shop — all off by default, so every existing link is
  unchanged; the engine's product and category links and the design packs adopt the helper
  below, and links still written by hand follow in later releases (`docs/urls.md`).
- The engine's product and category links now go through that helper — product page, category
  page, product card, footer, cart, sitemap, catalogue feed, `/pricing.md`, the search API,
  IndexNow and the review pages — so the URL options reach them. With the options unset every
  link is the same string as before; `permalinks` does not reach them yet (they pass the slug
  alone until the release that serves a permalink). A stored permalink is the path without the language prefix,
  and one with a `.` or `..` segment is ignored for the pattern. A test now fails on a
  product or category link built by hand outside the helper.
- The shipped design packs link products and categories through the same helper — every
  homepage's product and category tiles, and the Halo and Crema product cards — and the test
  that refuses a hand-built link now reads `designs/` as well. With the options unset every link
  is the same string as before. The test also refuses a helper call that hands over more than
  the slug (`{ slug, permalink }` or a spread), so a permalink cannot reach one link early.
- `urls.trailingSlash: true` now steers routing as well as links: a storefront page asked for
  without its slash (`GET /da/product/x`) answers with a permanent redirect to `/da/product/x/`,
  the way a migrated WordPress address is written. `proxy.ts` does it rather than Next, whose own
  redirect (`next.config.ts` now sets `skipTrailingSlashRedirect` beside `trailingSlash`) would
  also have sent every `/api` path to its slash form — and Vercel Cron, Stripe's webhooks and an
  OAuth callback do not follow a redirect. So `/api`, `/admin`, `/oauth`, `/icon`, `/og`,
  `/.well-known` and files answer with or without the slash, and nothing registered elsewhere
  has to change; a `POST` is never redirected. Merchant redirects match a source in either form
  and the engine's own redirects (`/da/om-os`, the trust-page aliases, the legacy Danish paths)
  give their destination the slash, so each lands in one hop; the sitemap's entries carry it too,
  the `--profile site` sitemap's included. A slug with a dot (`v1.2-noter`) is linked, redirected
  to and listed without the slash, like a file, because the proxy never sees a dotted path.
  Off — the default — Next receives exactly the config it did before (`docs/urls.md`).

### Changed
- `/built-with-cartwright`, `llms.txt` and `/admin/features` stop promising what the engine does
  not do: shipping zones are marked not implemented and leave the tour, because checkout still
  charges the flat rate (which `/admin/shipping` now says above the zone editor, with the fee every
  order pays), the passkey line is gone, and the logo generator is described by what it does rather
  than by a model id.
- The model picker for the AI assistant (`/admin/integrations` → AI) now offers Claude Sonnet 5.5
  and Claude Opus 5.5 instead of Sonnet 4.5 and Opus 4.5; Haiku 4.5 stays the default. Both new
  models get the full admin tool set and are priced in the usage meter (a model id the engine does
  not know still falls back to read-only tools, so every listed model is now pinned against both
  tables). A shop that saved a model the list no longer offers keeps it, shown as "saved — not in
  the current list" until someone picks a current one and saves.
- **Dependencies moved to their newest releases inside the current majors, each public for at least
  three days.** `ai` 7.0.127 with `@ai-sdk/anthropic` 4.0.71, `@ai-sdk/google` 4.0.87,
  `@ai-sdk/openai-compatible` 3.0.62 and `@ai-sdk/react` 4.0.130, `@modelcontextprotocol/sdk`
  1.32.0, `next-intl` 4.14.9, `@google/genai` 2.27.0, `@upstash/ratelimit` 2.2.0 with
  `@upstash/redis` 1.39.0, `lucide-react` 1.50.0, `resend` 6.32.0, and the dev packages `tsx`
  4.23.15, `vite` 8.3.2 and `@typescript-eslint/parser` 8.71.0. No direct dependency moved a major.
  The lint-time copy of `brace-expansion` 1.x that eslint pulls is pushed to 1.1.21, which the
  three `brace-expansion` advisories now also cover. `pnpm audit --prod` reports no known
  advisory; one dev-only advisory stays open, because no fixed release exists yet (`braces` 3.0.3,
  GHSA-vfj7-8cjw-p6xm, reached only through `eslint-config-next` at lint time).
- **The root layout's Geist and Geist Mono are self-hosted.** They load through `next/font/local`
  from `app/fonts/` instead of `next/font/google`, so a build no longer asks Google for them — that
  fetch failed builds at random (three red builds in one day, each green on retry with the same
  code). Every file Google served is kept: the latin face is preloaded as before, and the other
  subsets (latin-ext, Cyrillic, Vietnamese, symbols — `№`, `ł`, box-drawing) sit in a `faces.css`
  next to it and load only when a page shows one of their characters. The family names stay `Geist`
  and `Geist Mono` (design packs name them in their tokens), and pages render the same — the
  fallback faces carry the metrics `next/font/google` used. Each font directory carries its licence
  and a `fonts.json` with the source URL and a sha256 per file. `node scripts/fonts/fetch.mjs <Font>
  '<options>' <dir> [families]` fetches another family the same way, with Next's own option rules;
  the remaining design packs move over in later releases.
- **Every WebMCP browser tool now states Chrome's three annotations.** Chrome's `registerTool`
  reads `readOnlyHint`, `consequentialHint` (the action is significant, real-world or
  non-reversible, so the browser may ask the human first) and `untrustedContentHint` (the output
  carries text the site does not vouch for). Until now only four tools set any hint, and the three
  tools that change the customer's cart set none. Now `add_current_product_to_cart`,
  `update_cart_item_quantity` and `remove_cart_item` are marked consequential; `search_products`,
  `get_cart`, `list_visible_products` and Crema's `calculate_brew_ratio` are marked read-only;
  `navigate`, `filter_products` and `go_to_checkout`, which only change the page, are marked
  neither. `untrustedContentHint` is `false` everywhere, because no tool returns customer-written
  text such as reviews. No tool name, schema or moat binding changed. A test mounts every WebMCP
  surface and fails if a tool leaves a hint out, if a tool outside the cart-changing set is marked
  consequential, or if a tool registers without going through `registerWebMcpTools`
  (`docs/webmcp.md` → "Tool annotations").

### Deprecated
- **A production deploy without `CRON_SECRET` will refuse cron calls from the next release.**
  Today the routes under `/api/cron` let a call through when no `CRON_SECRET` is set, because
  Vercel Cron sends its `Authorization` header only once the secret exists — so anyone can call
  them. From the next release a production deploy (`VERCEL_ENV=production` or
  `NODE_ENV=production`) without the secret refuses those calls instead, and its scheduled jobs stop
  until it is set. Set it now: generate one with `openssl rand -hex 32`, add it as `CRON_SECRET` to
  the production environment (Vercel → Settings → Environment Variables) and redeploy; Vercel Cron
  then sends it on its own. `next dev` stays open.

### 🛠 Fixed
- **Archivo, Space Grotesk and Space Mono are self-hosted, so a build no longer asks Google for
  them.** Brutalist loads all three from `app/fonts/<family>/` (one `font.ts` per family), and
  Editorial Ink and Meridian load their Space Mono from there too, so those fetches can no longer
  fail a build at random ("Failed to fetch … from Google Fonts"). Measured against the previous
  build on seven homepages (Brutalist, Editorial Ink, Meridian, Nocturne, Engineered, Crema and the
  default design), each page fetches the same font files (same bytes, same count), preloads the same
  set, and the settled page renders the same at 1440 and 390 px. What changes is order: Next lists a
  page's font preloads alphabetically by file name, so Space Grotesk and Space Mono are now requested
  last and Archivo a little later than before, and on a cold first load their text can show its
  size-matched fallback for a moment. Families
  another pack still loads from Google (Fraunces, Hanken Grotesk, Manrope, Plus Jakarta Sans, Sora)
  stay on Google until their last pack moves with them: a self-hosted copy beside a Google one
  would make the browser download the same file twice, and a test now refuses that. Editorial Ink
  and Meridian's mono token reads `--font-space-mono` (was `--font-spacemono` / `--font-mer-mono`);
  a customised copy that reads the old name with its `"Space Mono"` fallback still gets the font.
  A test keeps the files that use `next/font/google` from growing. `scripts/fonts/fetch.mjs` now
  replaces a font directory all or nothing — a failed download leaves the installed files as they
  were, and a complete run removes the previous run's files that nothing names any more — writes a
  variable font's shared file once, and names `format()` after the file type.
- **"Translate" on a vibe page works again.** The admin theme form's translate button
  (`POST /api/admin/vibe/translate`) asked Google for `gemini-1.5-flash`, a model Google shut down
  on 2025-09-29, so it failed for every shop. It now uses `gemini-2.5-flash`, the model the media
  alt-text job already uses; both read it from one constant (`GEMINI_TEXT_MODEL` in
  `lib/ai/gemini.ts`). The route also sent Google the *encrypted* Gemini key when the key was saved
  in `/admin/integrations`; it now reads the key through the same helper as every other Gemini
  call, which decrypts it and falls back to `GOOGLE_GEMINI_API_KEY`. A test now fails if a model id
  Google has shut down (the Gemini 1.0 and 1.5 families, 2.0 Flash, the Live 2.5 preview) appears
  anywhere in the shipped source.
- **An unknown AI model is no longer silent.** A chat model the engine has no capability row for
  runs with read-only tools and an 8k context window — on purpose, so an untested model never gets
  write tools. Until now nothing said so: the chat simply could not change anything. The AI form in
  `/admin/integrations` now says "Not a known model: tools run read-only and the context window is
  limited to 8k tokens." under the Ollama model field and under a saved Anthropic model the list no
  longer offers, and a typed Ollama model shows its real tier instead of always "Read-only". The
  fallback itself is unchanged. The capability table moved to `lib/ai/model-capabilities.ts` (plain
  data the form can read); `lib/ai/client.ts` re-exports it, so existing imports keep working.
- **Cancelling an unpaid order also cancels its Stripe payment.** Until now the payment stayed
  open: a customer still on the payment page could finish 3-D Secure and pay for an order you had
  cancelled, and the money sat in Stripe with only an audit row (`orders.payment_not_applied`) to
  say so. The admin status form, the bulk action and `orders.update_status` now cancel the order's
  PaymentIntent right after the status is written, and the order timeline says what happened. A
  payment the customer already made is never cancelled — the note says to issue a refund from the
  order page instead, since cancelling an order does not return money. If Stripe cannot be reached
  the order is cancelled anyway, and the note says to cancel the payment in the Stripe Dashboard.
  Each attempt is audited as `orders.cancel_payment_intent`; the tool's result carries the outcome
  as `paymentIntent`.
- **The nightly Stripe check no longer flags multi-currency orders that were paid correctly.**
  The reconcile cron (`/api/cron/reconcile-stripe`), which catches payments the webhook missed,
  compared what Stripe charged with the order's base-currency total, so an order charged in EUR
  went to "Needs review" although the customer paid exactly what they were shown. It now checks
  amount and currency against the order's snapshotted rate — the webhook's own check, from one
  shared helper (`expectedStripeCharge` in `lib/money.ts`). Its header comment no longer claims it
  runs every 15 minutes; `vercel.json` runs it once a day at 03:00 UTC.
- **An unpaid order the nightly check cancels gives stock back to the right variant.** When Stripe
  reported the payment cancelled, the cron returned every line's quantity to the product, while
  checkout takes a variant line's stock from the variant — so the variant stayed short and the
  product gained stock it never lost. It now uses the same restock as the rest of the shop, and
  only when it is the one that moves the order from awaiting payment to cancelled, so a second run
  never restocks twice.

### Upgrading
No schema change: no `pnpm db:push` is needed, and no flag was added. Run `pnpm install` so the
`sharp` and `source-map-js` overrides land (CW-2026-007). **Set `CRON_SECRET` in your production
environment before you take the next release** — from then on a production deploy without it
refuses its cron calls and its scheduled jobs stop (see Deprecated). The URL options stay off
unless you set them; of the three, only `trailingSlash` steers routing yet, so keep `permalinks`
and `localePrefix` at their defaults (`false`, `"always"`) on a live shop (`docs/urls.md`). A shop that turned `shippingZones` on
still charges the flat rate at checkout, as it always did; the flag is now marked not implemented.

## v0.59.1 — 2026-10-04

A patch for what search engines and feeds see, and for one admin switch. A product page's
machine-readable data carries the product's own sku when it has one; a sold-out product stays in
the sitemap instead of dropping out and coming back on restock; the product feeds leave out drafts;
and turning on the `sitePack` switch ("SitePack") in `/admin/features` now makes the Snapshot &
Restore page and its export/restore work without a redeploy. No schema change; no new flag.

### 🛠 Fixed
- A product page's machine-readable Product data now carries the product's own article number
  (its sku) when one is set, instead of the shop's internal database id. A product without a sku
  (or with an empty one) keeps the id, so nothing changes for shops that never set one — but a feed, an ERP or a shop
  migrated from WooCommerce can finally match the page to the product it already knows.
- A sold-out product stays in the sitemap. Until now the sitemap dropped every product with no
  stock, so a product that sold out disappeared from the sitemap and came back when restocked —
  the kind of churn search engines punish — while the page itself kept answering. The sitemap, the
  Google Merchant feed and the agent catalogue feed now list every active product (availability is
  stated on the page and in the feed), and a product saved as a draft never appears in any of them.
- The **Snapshot & Restore** page in the admin now follows the `sitePack` switch in
  `/admin/features` the moment you flip it, instead of only the value baked in at deploy time; while
  the feature is off, the page is gone (404) just like its menu entry, rather than showing a
  placeholder. The export and restore it runs (the `sitepack.export` / `sitepack.import` tools)
  follow the same switch, so turning the feature on in the admin makes them work too instead of
  answering "SitePack is disabled".
- The AI usage meter estimated Claude Opus 4.7 at the old Opus price ($15 / $75 per million tokens)
  instead of $5 / $25, so its cost showed three times too high.

## v0.59.0 — 2026-10-03

The migration path gets its tools: redirects can be imported from a CSV with a dry run first, and
the design packs' links and the product feeds keep the reader's locale instead of bouncing through
a redirect. The owner can get an e-mail for every paid order, and the Stripe webhook marks an order
paid only from a status that may become paid. A product page's JSON-LD names every variant, IndexNow
pings sit behind a flag, the marketplace manifest carries `engineFacts`, the account and changelog
pages render one `<main>` landmark, a deleted product's page answers 404, and `stripe` is pinned
exactly. **Run `pnpm db:push` before deploying it: this release adds columns and tables and rebuilds `OrderItem` in place to make `productId` optional — every row and id is kept** (see Upgrading).

### ✨ Added
- A product with variants now tells them apart on the product page's machine-readable surface:
  every variant `Offer` in the Product JSON-LD carries the variant's name (the same values the
  picker shows — "Whole beans, 250 g") next to its sku, price and availability, and the page
  prints each variant's name and stock state as plain text in a collapsed "Availability by
  variant" list under the picker, so a shopper sees what is sold out before choosing and an AI
  crawler that runs no JavaScript reads the same facts as the JSON-LD.
- Search engines that honour IndexNow (Bing, Yandex, Seznam, Naver — Google does not, so the sitemap
  stays the main path) can learn about a product, page or blog post the moment you create, update or
  delete it: turn on **IndexNow ping on publish** (`indexNow`) in `/admin/features` and set
  `INDEXNOW_KEY`. Every locale's URL is sent after the response, fire-and-forget — a failed ping
  never blocks or fails the write — and the key is served at `/.well-known/indexnow-key.txt` (404
  while off). A rename pings the old URL as well as the new one, and unpublishing or deleting pings
  the URL that went away, so engines drop it. Only a production deployment pings: never `pnpm dev`,
  localhost or a preview deploy (a `*.vercel.app` host pings only as the Vercel production
  deployment); neither do site imports, sitepack restores, CSV imports or seeds. Off by default.
- `marketplace-manifest.json` now carries `engineFacts` — how many tools the engine registers, how
  many scopes an API key can carry, how many tools the admin assistant may reach and how many of
  those stop for a confirmation — derived from the engine's own sources on every `pnpm gen:manifest`,
  so cartwright.app states the numbers your shop actually ships instead of retyping them.
- **Import many redirects at once from a CSV (`from,to,status`), with a dry run first** — the migration
  step where the old URLs go in before the DNS switch. `/admin/redirects` gets an "Import CSV" panel
  (paste, preview per-line errors, import) and agents get the `redirects.import` tool (`settings:write`;
  `dryRun: true` previews, `confirm: true` applies). Valid rows are saved in one transaction under one
  audit entry; duplicates, chains and loops are refused with their line number. The single-create form
  shares the rules and is tightened with them: a relative destination written with the `/da` or `/en`
  prefix is refused (the redirect keeps the reader's locale, so `/kontakt → /da/kontakt` would loop into
  `/da/da/kontakt`), and a destination that differs from its source only by a trailing slash or a query
  is refused as the same page.
- The database schema gains the columns the import, order-status and URL work will build on:
  a category tree (`Category.parentId`) and extra categories per product (`ProductCategory`),
  `permalink`, `externalId`/`source` on products, categories, orders and customers, product
  `status`/`metaTitle`/`metaDescription`, `Order.orderNumber`/`termsVersion`/`termsAcceptedAt`, an
  `OrderItem.sku` snapshot, and two empty tables, `OrderStatus` and `NumberSequence`. Nothing reads
  them yet: every page and order renders exactly as before; the `orders.get` and `gdpr.export_user`
  outputs list the new fields (null until something writes them), and an order line's `productId`
  may now be null.
- The owner can get an e-mail for every paid order: turn on **Owner order e-mail**
  (`ownerOrderEmail`) in `/admin/features`, and the shop's admin address receives the order
  reference, the customer, the lines, the total and a link to the order in admin — from the Stripe
  webhook, the reconcile cron, mock checkout and agent (ACP) checkout alike, once per order, and
  always after the customer's receipt. A failed owner mail never fails the payment. An order you
  mark paid by hand in admin sends none. Off by default.

### Changed
- `OrderItem.productId` is now optional, so an order line can outlive its product (an imported
  historic order may name one the shop no longer has). Review pages and the review-prompt email
  skip such a line; restocking it gives nothing back. Deleting a product that has orders still
  fails, as before.

### 🛠 Fixed
- `gdpr.export_user` no longer fails for a customer who has sent an inquiry: its output schema lacked
  the `source` and `data` fields `Lead` gained in v0.58.0, and the MCP route validates every result
  against it. The same schema fix keeps `orders.get` working with the new order columns.
- The account pages (`/account`, login, signup, orders, settings, subscriptions, forgot/reset
  password, wishlist, order review), `/changelog`, the blog index and post pages and the
  post-purchase review page no longer render a second `<main>` landmark inside the one the layout
  already provides, so landmark navigation (a screen reader's rotor) finds one main region per
  page; the pages look exactly as before. A test now refuses any storefront route file — and any
  plugin page a route mounts — that opens its own `<main>`.
- `stripe` is pinned to exactly `22.5.0` in `package.json` (no caret). The SDK types the
  `apiVersion` option as the literal each release ships, so a `pnpm update` — or an install
  without a lockfile — could pull 22.6+ and fail `tsc` on `lib/stripe.ts`. Bumping stripe
  is now a deliberate two-file change (the pin and the `apiVersion` in `lib/stripe.ts`), and a
  unit test keeps the two in step.
- A deleted product's page now answers 404 instead of still rendering; before, `products.delete`
  (and the admin's delete) only hid the product from listings, and its URL — including its title
  and the related-products strip on sibling pages — kept answering 200, so a search engine told
  to drop it would have found it still there.
- The setup wizard's owner e-mail field is saved now; before, saving the brand step erased the
  address the domain step had stored, and the shop fell back to the `brand.config.ts` default.
- The Stripe webhook and the reconcile cron can no longer both mark one order paid and both send
  its receipt: each only flips an order whose status is still the one it read.
- A payment that succeeds for an order no longer awaiting payment (cancelled, already processing
  or shipped) is logged for manual review and no longer flips the order back to paid.
- The order page's status form (the default view, with `orderWorkspace` off) now goes through the
  order state machine like every other status change: it offers only the moves that are allowed,
  writes an order note and is audited. Before, it wrote the status directly from a fixed list of
  four — a refunded order could be set back to paid, and nothing recorded who did it. A final
  status (cancelled, refunded) now shows a sentence instead of a dropdown. The form and the rest
  of that order page (customer, addresses, items, totals) are now in English, like the admin around them.
- After a status change, both status controls (the plain form and the workspace timeline) now submit
  the option they show. They used to keep the previous pick, so the next click was refused, and the
  Update button now stays disabled while a change is in flight.
- "Revenue" on the admin dashboard and in `analytics.summary` reads one shared rule instead of two
  copies of it. The numbers are unchanged.
- Links in the design packs now keep the reader's language. Product and category cards on the
  webshop homepages (atelier, webshop-bold/-classic/-editorial/-minimal, hoptify), halo's product card
  and PDP crumb, and the CTAs, service cards and newsletter form of apex, fable, stillwater, stack,
  saas-dark and corporate-baseline
  linked to `/product/…`, `/contact` and friends without a locale, so a reader on `/en` of a Danish
  shop was redirected to the Danish page. The product feeds (`/feed/google.xml`, `/api/acp/feed`)
  now link `/<default locale>/product/…` directly instead of a URL that answers 307. A test now scans
  every design pack for the same mistake written as a literal link. Not yet covered: links a pack
  takes from `brand.config.ts` (the `website.*Href` CTAs on aurora-site, studio and jungle) and the
  studio section defaults — those are fixed where they render, in a later release.
- The site no longer points at three addresses of its own that did not answer. `/manifest` is gone
  from the sitemap (the route is locale-shadowed and answered 404 on every canary); `/favicon.ico`,
  which answered with an HTML page, now redirects permanently (308) to the generated `/icon`; and
  the Danish alias `/<locale>/om-os`, which answered 404, redirects permanently to `/<locale>/about`
  for the configured locales. `/<locale>/info/om-os` and `/changelog` are unchanged.

### Upgrading
Run `pnpm db:push`. It adds the new columns and tables and rebuilds the `OrderItem` table in place
(SQLite cannot make a column optional any other way); every row and id is kept. The two new flags,
`ownerOrderEmail` and `indexNow`, are runtime flags and off by default: turn them on in
`/admin/features` when you want them (`indexNow` also needs `INDEXNOW_KEY` in env to send anything).

## v0.58.2 — 2026-10-01

A security release outside the usual cadence. `next` 16.3.8 closes a high server-side request
forgery advisory in Image Optimization (CW-2026-006), which every shop that serves `/_next/image`
carries, and pnpm overrides close the transitive advisories in CW-2026-005. Upgrade. The admin order
page also now says, like the agent tool, that a refund status moves no money. No schema change: no
`pnpm db:push` is needed.

### 🔒 Security
- **`next` 16.3.8 closes a high server-side request forgery advisory in Image Optimization
  (GHSA-cjq9-62q9-8jv4, CW-2026-006).** The engine's `next.config.ts` sets `images.remotePatterns`,
  so a shop serves `/_next/image` unless it removed that block. The same release fixes five medium advisories
  (GHSA-f87g-xv8r-7p7x, GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p, GHSA-3w37-wq28-93x7,
  GHSA-h694-7cp9-m8p3) and one low one in the development server (GHSA-39w2-rjm5-chcv). Upgrade.
  `eslint-config-next` moves with it. 16.3.8 was published on 2026-09-30, inside the three-day
  release-age cutoff, so its twelve exact versions replace the 16.3.6 ones in
  `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. To fix it in your own shop now, see the
  advisory index.
- **Transitive dependency advisories closed (CW-2026-005).** `pnpm audit --prod` went from zero to
  five high, twelve moderate and five low findings, all in packages below our direct dependencies:
  `undici` 7.x under `jsdom` (ten advisories, among them GHSA-rfgv-xxqx-mfg5 and the TLS-validation
  bypass GHSA-w293-vg96-wgc3) and `undici` 6.x under `@vercel/blob` (three: two WebSocket advisories
  and one in the retry interceptor), `ip-address` under `@modelcontextprotocol/sdk`, `fast-uri` under
  `ajv` (below the MCP SDK and the Prisma CLI that `@prisma/client` installs), and `brace-expansion` under `@sentry/nextjs`'s build
  plugin. The `overrides` in `pnpm-workspace.yaml`
  now force each onto its patched line. The direct `dompurify` moves to ^3.4.16 (GHSA-p98j-92pf-mc4p,
  low). None of them is reachable from a request in a shipped shop as far as we can measure: `jsdom`
  is only a blank window for DOMPurify and loads nothing over the network, `@vercel/blob` uses
  neither WebSockets nor undici's retry interceptor, the MCP SDK's `express-rate-limit` is not mounted by any Next route, the
  `brace-expansion` copy runs at build time, and the DOMPurify finding needs the `IN_PLACE` option,
  which Cartwright never passes. Upgrade regardless. Every override target is older than the three-day
  release-age cutoff, so none of them needed an exception (unlike `next` above). `pnpm audit --prod` reports no known advisory.

### Changed
- **The admin order page now says what the agent tool says: a refund status moves no money.** Setting
  `refunded` or `partial_refund` with the status form on the order page still works, because an operator
  may need to record a refund made outside the shop. The timeline note
  now reads "Manual registration — no money moved: Status: …", the audit entry carries
  `manual: true` and `moneyMoved: false`, and the form labels both options "(manual — no money moved)".
  The bulk-status server action, whose menu offers no refund status, writes the same note if one reaches
  it. The admin chat's plan card for `orders.update_status` says the same before you confirm. A card refund
  is still made with the order page's **Issue refund** button. Every other status move writes exactly
  what it wrote before.
- **Correction to v0.58.1:** "every other status move over REST or MCP behaves as before" was too wide.
  `orders.update_status` now validates its new optional fields on every move, so a `confirm` or `manual`
  that is not a boolean, or a `refundDkk` sent with any status other than `partial_refund`, is refused
  instead of being ignored. A call that sends none of the three is unchanged.

## v0.58.1 — 2026-09-24

A security release outside the usual cadence. `next` 16.3.6 closes a critical remote-code-execution
advisory in `next/og` (CW-2026-004), which every shop since v0.17.0 carries. Upgrade. It also stops
an agent from marking an order refunded when no money moved. No schema change: no `pnpm db:push`
is needed.

### 🔒 Security
- **`next` 16.3.6 closes a critical remote-code-execution advisory in `next/og`
  (GHSA-vcvr-r3jv-pc5j, CW-2026-004).** The Node.js `ImageResponse` is affected when attacker-controlled
  values reach the SVG it renders. Every Cartwright shop since v0.17.0 ships `app/og/route.tsx`, which
  renders the public `?title=` and `?description=` query values with it, in every profile,
  `--profile site` included. The route places them as text, not as SVG markup, so exploitability is not
  proven. Upgrade regardless. `eslint-config-next` moves with it. 16.3.6 was published on 2026-09-22,
  inside the three-day release-age cutoff, so its twelve exact versions are listed in
  `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`, with the advisory next to them. To fix it in
  your own shop now, see the advisory index.

### Changed
- **`orders.update_status` no longer lets an agent mark an order refunded when no money moved.**
  Until now any `orders:write` key could set `refunded` or `partial_refund` over REST or MCP without a
  confirmation, and no refund reached the customer. A card refund made on the admin order page or in
  Stripe already moves the status itself, through the `charge.refunded` webhook. Both targets are now refused with `refund_requires_payment_path`, unless the caller is
  recording a refund made outside the shop (invoice, bank transfer) and sends `manual: true` and
  `confirm: true`, plus `refundDkk` in øre for `partial_refund`. Such a registration writes a system
  note on the order, "Manual registration — no money moved", and answers `moneyMoved: false`.
  Every other status move over REST or MCP behaves as before. The status form on the admin order
  page is unchanged and can still set `refunded` without moving money; a card refund is made with
  that page's **Issue refund** button.
- **Dependencies moved to their newest releases inside the current majors, each public for at least
  three days.** `ai` 7.0.107 with `@ai-sdk/anthropic` 4.0.58, `@ai-sdk/google` 4.0.76,
  `@ai-sdk/openai-compatible` 3.0.53 and `@ai-sdk/react` 4.0.110, `@sentry/nextjs` 10.75.0,
  `next-intl` 4.14.5, `zod` 4.6.5, `@google/genai` 2.23.0, `@upstash/ratelimit` 2.1.0,
  `lucide-react` 1.47.0, `tailwind-merge` 3.7.0, `resend` 6.28.1, and the dev packages `fast-check`
  4.10.2 and `@types/node` 24.13.6. No direct dependency moved a major. `stripe` stays on 22.5.0 for
  the reason given in v0.58.0, and `@libsql/client` 0.18 and `three` 0.186 wait, because a `0.x`
  minor may break. `pnpm audit --prod` reports no known advisory.

## v0.58.0 — 2026-09-22

A custom form can now tell the owner which form it was and what the visitor configured, the
dependencies moved to their newest releases inside the current majors, and pnpm refuses a
package version younger than three days. `pnpm audit --prod` reports no known advisory.
**This release adds two `Lead` columns: run `pnpm db:push` before deploying it** (see Notes).

### ✨ Added

- **Leads can record WHICH form they came from and WHAT the visitor configured.**
  `Lead` gains `source` (a short label — `"hegnsberegner"`, `"quote-wizard"`) and `data`
  (a JSON object of the form's own fields). Previously the model was agency-shaped
  (`projectType`/`budget`) and `/api/inquiries` stripped everything else, so a calculator
  POSTing its whole result set stored a name and an email — silently, behind a `200`.
  Both are accepted by the DB route and by the no-DB site-profile variant (which folds
  them into the owner mail), and both render in `/admin/leads`.
  Bounded at the wire because the endpoint is public and unauthenticated: `source` ≤ 64
  chars, `data` an object with ≤ 50 keys and ≤ 4 KB serialised; over a cap is a `400`
  naming WHICH cap (`source_too_long` / `data_too_many_keys` / `data_too_large`), never
  a silent truncation. Both routes build these two fields from the SAME schema
  objects in `lib/inquiry-errors.ts` (their sibling fields are still their own),
  so this pair's enforcement cannot drift apart — sharing only the constants left
  the two `.refine()` predicates free to disagree while the numbers matched. Reserved-key
  handling now covers the whole blob rather than its first row of keys: a nested
  `__proto__` is stripped at any depth, and an object or array under
  `constructor`/`prototype` — which covers the pollution shape that survives stripping
  `__proto__`, measured — is refused with `data_reserved_key`. A string, number, boolean
  or `null` under those names is an ordinary field ("a construction firm called
  constructor") and is still kept.
  `data` may also nest at most 32 deep (`data_too_deep`). That cap is not tidiness:
  `JSON.parse` accepts structures `JSON.stringify` cannot walk, and the byte check has
  to serialise in order to measure — so a 6 KB body of nested arrays threw `RangeError`
  out of the refinement, which is not a `ZodError`, and the public route answered
  `500` with a stack trace in the log where the docs promise a `400`.
  Finally, an empty, blank or `null` `source` (an untouched hidden input, or a client
  writing `source: state.source || null`) now counts as ABSENT rather than costing the
  visitor the whole enquiry with an `invalid_input` that named no field.
- Lead capture is now documented in all five agent-rules files, the `cartwright-guidance`
  skill and `designs/blank/` — its absence there is why an AI building a custom site
  concluded the subsystem did not exist and set out to rebuild it.

### Changed
- **Dependencies moved to their newest releases inside the current majors.** `next` and
  `eslint-config-next` 16.3.5, `react` and `react-dom` 19.3.0, `ai` 7.0.98 with the four `@ai-sdk/*`
  packages, `next-intl` 4.14.4, `zod` 4.6.2, `@sentry/nextjs` 10.74.0, and fourteen smaller packages.
  Each version had been public for at least three days. No major version moved. `stripe` stays on
  22.5.0: 22.6 changes the Stripe API version the SDK is typed for, and `lib/stripe.ts` pins
  `2026-07-29.dahlia`, so moving it is a payment-path change of its own.
- **pnpm refuses a package version that is less than three days old** (`minimumReleaseAge: 4320` in
  `pnpm-workspace.yaml`). pnpm 11 checks it when it resolves a version (`pnpm add`, `pnpm update`)
  and when it installs from the lockfile, so an install whose lockfile names a younger version
  fails. A lockfile that passed once keeps passing, because its entries only get older. A security
  fix that cannot wait three days goes in `minimumReleaseAgeExclude`.
- **`DESIGN.md` says what an AI must not invent, what generic looks like, and which command
  checks it.** Three new taste rules in §3: never invent the owner's facts (testimonials,
  names, counts; what a pack states on its own goes in `facts.ts`, one field per fact with
  its source in a comment, and an owner-given fact nobody could confirm is marked
  `UNVERIFIED` there, never on the page), a template-tells check for the default AI look, and
  `tokens.palette.accent` is the UI accent, not a brand colour. §4 names `pnpm verify:design`
  and says where it does not apply (it needs a running dev server and is not in `--profile
  site` scaffolds). The `cartwright-premium-design` skill mirrors all four. Docs only.
- `docs/simple-site.md`'s measured cold run is re-copied from the gate run on the published
  v0.57.0 pair (create-cartwright 2.9.6). It cited v0.56.2, so a v0.58.0 scaffold would have
  shipped a receipt two releases old. The receipt itself stays in that one file.

### 🛠 Fixed
- **Vitest no longer installs `vite` 8.0.14** (one high and one moderate advisory, development only).
  The root now declares `vite` `^8.3.0`, the dependency Vitest resolves its peer from; `pnpm audit`
  reports nothing for production or development dependencies.

### 📝 Notes

- **⚠️ Migration (required, not optional): `Lead` gains `source` + `data`. Run
  `pnpm db:push` BEFORE deploying this code.** Unlike a flag-gated column, these sit on
  the always-on contact path and there is no escape hatch. Prisma emits
  `INSERT … RETURNING` naming every column, so on an unmigrated database the failure is
  **unconditional and hits writes as well as reads** — omitting both fields from the
  submission does not help: `POST /api/inquiries` returns 500 on every submission,
  `/admin/leads` crashes, and the DSAR export throws. Verified against a pre-migration
  table (`no such column: source`).
  Turso/libSQL databases (the canaries) cannot take `db push` from the Prisma 7 CLI
  (`P1013`) — use the `migrate diff` → `turso db shell` route for those.

## v0.57.0 — 2026-09-14

**The line between the customer's site and Cartwright's own repository, drawn in code — and a new
scaffold's production dependencies have no known advisory.** This release draws the line between what belongs to the site you scaffold and what belongs to
Cartwright's own repository, and adds a zone of guards that ships into every scaffold, so the
defects that only a scaffold can show can be caught where they happen. It also closes all
fourteen advisories `pnpm audit --prod` reported on v0.56.2 (CW-2026-003), and fixes six places
where a page, a guide or an agent surface spoke the wrong language or promised something it did
not do.

### 🔒 Security
- **Fourteen advisories closed (8 high, 6 moderate) — `pnpm audit --prod` now reports none.**
  Thirteen sat below packages the engine depends on, so they are pinned with `overrides` in
  `pnpm-workspace.yaml`, each selector scoped to the line the package is on (its major; for
  pre-1.0 `sharp`, its 0.35 minor): `fast-uri` ≥ 3.1.6 (four GHSAs on URI parsing, under `ajv` —
  reached from `@modelcontextprotocol/sdk` and from the Prisma CLI's `@prisma/dev`), `sharp` ≥ 0.35.4
  (libheif, Next's image optimiser), `qs` ≥ 6.16.0 and `hono` ≥ 4.13.5 (the SDK's Express/Node HTTP
  stack — the engine's `/api/mcp` uses the web-standard transport, so these are installed but not
  loaded by engine code), `mysql2` ≥ 3.23.1 (the Prisma CLI pins 3.15.3 exactly and uses it only
  against a MySQL database) and `deepmerge-ts` 8 (`@prisma/config` pins 7.1.5 exactly; the one step
  across a major, because 8.x is the only patched line — `@prisma/config` loads it with a dynamic
  `import()` when it reads `prisma.config.ts`, and `prisma validate` loads that config and passes). The fourteenth is the direct dependency
  `js-yaml`, which moves to `^4.3.2`; a separate override closes the copy ESLint installs. Tracked as
  **CW-2026-003**. Left for the next Vitest bump: `vite` 8.0.14 under Vitest (dev-only, a peer an
  override cannot move) (#583).

### ✨ Added
- **An ownership ledger for the scaffold** (`scaffold/engine-only.ts`). A module claim could only
  say which profiles *exclude* a file, so everything unclaimed shipped everywhere — which is how
  Cartwright's own `/cartwright` and `/changelog` answered 200 on a customer's domain, under her
  navigation, with `llms.txt` advertising the changelog. The manifest now has two words it
  lacked: `ENGINE_ONLY` (ours, to be removed from a customer's scaffold) and `SHIPS_EVERYWHERE` (the
  customer's, unclaimed on purpose), and an inversion test treats "unclaimed" as an error. Every
  link into an engine-only route is gated on `profileCapabilities.engineMarketing`, which is false
  today only in the site profile — so a site scaffold is the only one whose engine-only routes can
  be deleted without leaving dead links (`scaffold/manifest.json` → `engineOnlyGate` lists the
  profiles still pending). This release ships that engine half; `create-cartwright` 2.9.5 does not
  read the ledger yet, so a scaffold cut today still carries the routes (#575).
- **A guard zone that runs inside every materialized scaffold.** `tests/unit/` does not travel to a
  site scaffold, but every defect found on the way here was invisible in the engine and visible in
  a scaffold. Eight new guards live in a zone that ships into every scaffold. Six are static and
  run in the scaffold's own `pnpm test` — dead `fetch("/api/…")` literals, dead script paths, our
  identity left in `brand.config.ts`, the profile marker, the guards' own portability, and a
  ratchet on the engine-only routes that arms once a `create-cartwright` release claims the
  ledger. Two are live and run when `GUARD_BASE_URL` points at a running site: the homepage's
  links, icon, `og:image` and JSON-LD `logo` answer 2xx, and the sitemap resolves and lists every
  served locale's homepage (#577).

### 🛠 Fixed
- **A site scaffold's own header linked routes the profile had removed** — `/services` and
  `/account` 404'd from a `--profile site` header and drawer. Marketing entries can now declare the
  capability they require; database-backed profiles render byte-identically (#572).
- **The product page spoke the shop's language only in part.** Twelve PDP strings were hardcoded —
  eleven in English on a page whose default locale is Danish, one in Danish that English readers
  got instead. They now read a `Product` namespace in `messages/{da,en}.json` (#580).
- **The trust badges linked outside the reader's locale.** The shipping, returns and FAQ badges
  used locale-less `/info/*` paths, so every click cost a redirect and an English reader without a
  cookie landed on the default locale. The locale-link gate now also scans object properties, the
  form that let this slip through (#582).
- **`llms.txt` called the sitemap "the complete index of all public pages".** It was not, measured
  three ways on three live sites. The line now says what the sitemap advertises (#578).
- **WebMCP form tools say which field is required.** `site_search` and `newsletter_signup` are
  declarative tools whose schema the browser derives from the form; `required` comes only from the
  attribute, and the attribute was missing. The page still answers every submit itself (#581).
- **`docs/simple-site.md`'s receipt named an older release than the one it shipped in** — v0.56.2
  carried the v0.56.1 run. It now cites the measured v0.56.2 run, and a test keeps the receipt a
  released version at most one release behind the engine's CHANGELOG (#573).

### Changed
- **Engine-private notes no longer reach the public template mirror** — overnight reports and
  internal drafts outside `internal-docs/` are excluded, and the exclusion is pinned (#574).

### Upgrading
Copy the `overrides` block from `pnpm-workspace.yaml` into yours, set `"js-yaml": "^4.3.2"`, run
`pnpm install` and confirm with `pnpm audit --prod` (see CW-2026-003 for shops still on `next`
16.2.x). That is the only step for an existing shop; the rest reaches new scaffolds. Do not copy
engine files into a `--profile site` scaffold: its `components/Header.tsx`, `components/Footer.tsx`
and `lib/profile-capabilities.ts` are materialized static variants. The engine's `Header.tsx` and
`Footer.tsx` import modules that profile does not have, and the engine's `lib/profile-capabilities.ts`
advertises routes the profile removed.

## v0.56.2 — 2026-09-06

**The plain-website door, inside the scaffold an AI actually reads.** A
`--profile site` scaffold shipped a README whose lede promised "database and
backend", whose first command block put the site profile third, and whose
deploy section asked for three Turso environment variables — and, worse, the
two files a coding agent loads before any of that (`.claude/CLAUDE.md` and
`AGENTS.md`) opened with `pnpm db:setup` and an admin login. An agent that
scaffolded the database-free profile was told, by the profile itself, that it
needed a database.

- **The door, at the top** (#570): the README lede is qualified ("a real site
  with design — and, when you want them, database and backend"), the site
  command comes first in the first command block, and a new
  "Just a website? (`--profile site`)" section says what ships and what does
  not. A pointer names the profile marker: *"Reading this README inside a
  scaffold? `.cartwright/profile.json` says which profile you have"* — and
  which sections do not apply to it.
- **The briefings agents load first**: one callout at the first-run step of
  `AGENTS.md`, `.claude/CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`,
  `.cursor/rules/cartwright.mdc` and `.windsurfrules` (the six files
  `AGENTS.md` requires to stay consistent), plus `DEPLOY.md`: no database,
  admin or login here — `pnpm dev` is the whole first run, `pnpm build` the
  whole production gate, and deploying needs no environment variables.
- **`docs/simple-site.md`** gains "What you edit" (the `brand.config.ts`
  fields, `designSlug`, the blank canvas, adding a route), "Measured"
  (the measured cold run, copied from the release scaffold gate's
  `timings-site.json` and never typed — the guide carries the figures and the
  run id, so a re-measurement updates one file)
  and "Honest limits".
- **`llms.txt`**: the "Built with Cartwright" block names the database-free
  profile, and the product sentence is qualified in both variants.
- `tests/unit/readme-site-door.test.ts` (engine-only) pins all of it: the
  command order, the section, the pointer, the env-var scope, the guide's
  sections and provenance shape, the badge in both variants, and the callout
  in every briefing.

### Upgrading

Nothing to do — documentation only, and no runtime file changed. A scaffold
cut from v0.56.0 or v0.56.1 can copy the new `README.md`, `docs/simple-site.md`
and agent-briefing callouts across, or simply ignore the database sections its
profile does not have.

## v0.56.1 — 2026-09-06

**A light or full scaffold's own test suite is green again.** The v0.56.0
release scaffold gate caught it before any customer did: `tests/unit/
site-font-safe.test.ts` (new in #564) enumerated files with `git ls-files`,
and a scaffold is not a git repository — three tests failed in every light and
full scaffold cut from v0.56.0 (site was unaffected: it prunes `tests/unit`).
The published CLI was still pinned to v0.55.0 while this was found, so no
scaffold in the wild ran the red suite.

- **site-font-safe pins the engine, not a scaffold** (#568): files are walked
  from disk (no git), and the suite runs only in the engine checkout — it pins
  the engine's manifest against the engine's design packs, which a light
  scaffold has already pruned — using the same probe as `repo-hygiene.test.ts`.
  Proven three ways: engine → 4 pass; a `git archive` copy with no `.git` →
  4 pass; the same copy without the mirror exclude list (scaffold-like) → 4
  skipped; and a real `create-cartwright@2.9.2 --profile light --ref v0.56.0`
  scaffold's suite red before / green after.

### Upgrading

Nothing to do. A light/full scaffold cut from v0.56.0 can copy the new
`tests/unit/site-font-safe.test.ts` over its own, or delete that file.

## v0.56.0 — 2026-09-06

**A `--profile site` scaffold is now what its own README says it is — a plain
website with no database.** It boots and builds with Google's CDN unreachable,
ships no crons into routes it does not have, installs no Postgres driver,
serves its share cards and favicon, and its contact form reaches its owner.
Five defects, each one an AI scaffolding a "just a page" site could not have
fixed itself; four of them were found by review falsifiers on a real
`create-cartwright@2.9.2 --profile site` scaffold.

- **No crons for a scaffold without cron routes, no Postgres driver without a
  database** (#563): `vercel.json` became a seam owned by the `db` module. A
  site scaffold receives `vercel.static.json` (`$schema` + `framework` only)
  instead of the ten cron entries whose routes the materializer deletes —
  every site deploy used to 404 on all of them, daily, forever. The orphan
  `pg` + `@types/pg` left the engine root; `@prisma/adapter-pg` carries both
  for the profiles that have a database. `repo-hygiene.test.ts` pins the twin
  as `vercel.json` minus `crons`.

- **Font-safe boot** (#564): the nine design packs whose display faces are
  fetched from Google Fonts at build time (aerospace, brutalist, drive,
  editorial-ink, fable, flux, meridian, nocturne, stillwater) and the root
  layout's Geist pair moved into a new `google-fonts` module, present from
  managed-site upward. A site scaffold gets `app/layout.static.tsx` — the
  system font stack behind the same `--font-geist-*` variables — and the eight
  self-contained packs (aurora-site, saas-dark, studio, corporate-baseline,
  stack, jungle, agentic-showcase, blank). Measured with Google blackholed:
  the engine's own `next build` dies on `Space Mono` through the
  `designs/index.ts` barrel; the materialized site builds (23 routes),
  `next start` serves `/en` 200, and the FIRST `next dev` compile answers 200
  — the `GET /en 500` that Turbopack cached until `rm -rf .next` is gone.
  `site-font-safe.test.ts` walks the site's included file set and forbids
  `next/font/google`; the engine, light and full output are byte-identical
  (`app/layout.tsx` untouched).

- **The contact form reaches the owner** (#565): `SmartContactForm` asked the
  admin-owned `/api/support/triage` before `/api/inquiries` — unconditionally.
  In a site scaffold that route does not exist, the POST hit the catch-all
  (405, empty body), `response.json()` threw, and every visitor saw "Could not
  connect to the server" while `/api/inquiries` itself worked. The import
  walker cannot see a `fetch` URL, which is how a profile documented as "no
  AI triage" shipped a form that could not submit. `profileCapabilities.
  supportTriage` (true; false in the static twin) now gates it and the site
  form goes straight to the human path. Database-backed profiles render
  byte-identical.

- **Share cards and favicon are not dead links** (#566): `proxy.static.ts`,
  the middleware a site scaffold runs, exempted only `/api` from the locale
  rewrite, so `/og?title=…` — the URL every page's `og:image` carries — and
  `/icon` were 307'd into `/en/og` → 404 in `next dev` and `next start`
  alike. The twin now routes them by the same `isAssetExempt` the db variant
  uses; a wiring test drives the static proxy directly and is mutation-proved.

### Upgrading

No schema change and no migration. A site scaffold cut from an earlier tag has
no in-place update path: re-scaffold, or apply the fixes by hand — delete the
`crons` block from `vercel.json`, drop `pg`/`@types/pg` from `package.json`,
update `SmartContactForm` to read `profileCapabilities.supportTriage` (or pass
`triageEnabled={false}`), add `|| isAssetExempt(pathname)` to the `/api` early
return in `proxy.ts`, and (for the font trap) replace the `next/font/google`
block in `app/layout.tsx` with a system stack. Light and
full scaffolds are unaffected.

## v0.55.0 — 2026-09-05

**A product specification may finally be a number, a boolean or a list — and every
surface agrees on what that means.** The engine's own coffee seed
(`roast: 2`, `notes: ["bergamot","jasmine","lemon"]`) could not be written
through the admin the engine ships, and was silently absent from the product
page on the way out. Three write paths disagreed about what a spec may hold, and
the one an AI agent uses was the narrowest of them.

- **The value rule, in one place** (#557): `string | number | boolean` or a list
  of those; nested objects and `__proto__`/`constructor`/`prototype` refused.
  `lib/product-attributes.ts:normalizeAttributeMap` is the single definition, and
  both the admin form (`lib/validation.ts`) and the agent surface
  (`lib/tools/products.ts`) call it. `products.update` inherits it through
  `createShape.partial()`.

  The agent surface previously declared `attributes: z.record(z.string(),
  z.string())` with no reserved-key guard — so `products.create` was the only
  write path that could not store the shop's own seed, and the only one that
  would take a reserved key. Two measured details shaped the fix: `z.record`
  rebuilds its object by assignment, so `"__proto__"` set the prototype instead
  of creating an own key and vanished before any guard saw it (the prototype is
  never polluted, but the caller was told the write succeeded); and `z.custom`,
  which does see the raw object, is unrepresentable in JSON Schema — through the
  soft-failing converter it publishes an EMPTY attributes contract to
  `/api/v1/tools?schema=true`, MCP `tools/list` and the admin-chat tool table.
  The schema is `z.preprocess` over a `z.record` with an explicit value union, so
  an agent is told exactly what it may send.

- **The product page renders them** (#560): the PDP spec table formats numbers
  and joins lists instead of filtering `typeof v === "string"`, and the PDP's
  WebMCP descriptor carries the same flattened specs the ACP/Google catalog feed
  publishes — the on-page agent no longer knows less about the product than
  Gemini shopping does. WebMCP tool names, schema keys and moat bindings are
  untouched.

- **`DesignPack.webshop.ownsAttributes`** (#560, additive): the attributes a
  design's own `pdpLayout` draws, which the shared spec table then skips — the
  `ownsBreadcrumb` idea applied to `Product.attributes`. It is a **function of
  the product**, not a key list, because a blanket list is only sound for a
  layout that draws unconditionally: `crema` shows a roast band only for values
  its parser accepts, so a declared-but-undrawn key would hide a fact that
  printed before. It also hands pack size to the variant picker once a product
  has variants. Unset → every attribute renders, byte-identical to before.

- **`pnpm verify:design` can see below the fold** (#555): `--full-page` captures
  the whole scroll length and `--selector <css>` captures one component. The
  `--selector` mode announces that it skipped the page-level checks — an
  unannounced skip is indistinguishable from a pass. `--full-page` emulates
  `prefers-reduced-motion: reduce`, because this engine's scroll-driven reveals
  live inside `(prefers-reduced-motion: no-preference)` and a full-page capture
  does not scroll.

### Upgrading

No schema change and no migration. A shop that stores attribute values the
repeater cannot represent (nested objects, lists whose items carry commas)
continues to edit them through the raw-JSON field, as before.

## v0.54.0 — 2026-09-03

**The judge's first minute. A cold `npx create-cartwright myshop --template coffee`
now scaffolds the same store the live demo runs — nine products, real variants —
and the README finally says so first.**

The WebMCP surface shipped in v0.50–v0.51, but the scaffold undersold it: the
coffee template seeded 3 products and zero `ProductVariant` rows, so the
variant-aware half of `add_current_product_to_cart` (the `variant` enum, the
natural-language labels, the per-variant stock lines) had nothing to show on a
fresh shop. And the README never named the one command that produces an
agent-testable store — the no-args default is a website profile with `webMcp`
off.

- **Seed variants** (#549): `SeedProduct` grows an optional `variants` field —
  one attribute key per PDP dropdown, agent-facing labels derived from
  attribute *values* ("Whole beans, 250 g") — and `prisma/seed.ts` creates the
  rows. The coffee template now seeds the live Northbound catalogue: 4 beans,
  1 espresso and a new **gear** category (4 products carrying plain string
  attributes, deliberately outside the coffee vocabulary), with Colombia
  Supremo wearing the demo's three grind/size variants and everything else
  variant-less on purpose — an agent must handle both shapes.
- **README: "Try the agent tools in 60 seconds"** (#549): the exact command, a
  prompt the seed data can satisfy, and the boundary that is the point —
  there is no order-placing tool; the checkout form is deliberately
  unannotated.
- **Agent reads answer with URLs the shop serves** (#544): `site.list_pages` /
  `site.get_page` now clamp the locale and canonicalise legacy CMS slugs
  through the same helper `llms.txt` and the sitemap use, so every published
  URL routes and `get_page` resolves the alias set the storefront resolves.
- **Flag-gated routes are 404 on every verb** (#548): `OPTIONS` no longer
  admits a gated surface exists when its flag is off.
- **The shared storefront follows the reader's locale** (#545): seven
  shared-chrome links that dropped the `/{locale}` prefix now carry it, with
  labels to match.
- **The header and its mobile drawer are one navigation again** (#546): the
  drawer renders the same page/category set as the desktop header instead of
  its own hardcoded list.
- **Smoke telemetry tells "unreachable" from "wrong"** (#547):
  `scripts/smoke-canaries.sh` separates a dead read from a failed content
  assertion on every live-read path.
- **Scaffold-context typecheck fix** (#550, caught by the release gate): on a
  single-locale scaffold `brand.locales.find(...)` narrows to plain
  `undefined`, so a test's `as string` cast could not compile — the fourth
  literal-type scaffold failure; the declaration now carries a load-bearing
  `string | undefined` annotation.

## v0.53.1 — 2026-08-29

**Scaffold-correctness patch. `brand.defaultLocale === "da"` compiles on the
engine and cannot compile in your shop.**

`release-scaffold-gate` vs `v0.53.0`: site ✅ · full ❌ · light ❌ — `TS2367`,
a comparison between types with no overlap.

`defaultLocale` is a literal type, not `string`. The engine's is `"da"`, and
`npx create-cartwright` patches yours to `"en"`, where `=== "da"` is provably
false and TypeScript refuses it. Three sites added in v0.53.0 — the two HTML
pages served outside `app/[locale]`, and the test asserting their shape — now
widen the comparison explicitly, each with a note saying the cast is
load-bearing rather than noise.

Nothing about the behaviour changes: the pages still serve Danish only when
your `defaultLocale` says so.


## v0.53.0 — 2026-08-29

**The language sweep, and five feature toggles that did nothing.** An audit of
every string literal in the shipped tree, plus a trace of every runtime-tier
flag. Most of what was found was legitimate; what was not is below.

### Danish strings an English shop's customers and owners actually saw

The engine grew out of a Danish shop, and prose written for it reached shops
that do not read Danish. Each of these had a traced render path:

- **The contact form.** `/api/inquiries` answered in Danish prose, and the
  form's own `t("errorGeneric")` could never run — a truthy server string never
  falls through `||`. Mistyping an email showed `Ugyldig email-adresse`. The
  endpoint now answers with a machine code the form translates.
- **The AI assistant** (`aiStylist`, default-on) rendered three Danish strings
  to every visitor who added to cart through it.
- **Two complete HTML pages** — the newsletter unsubscribe page and the
  supplier's mark-as-shipped page — were served with `lang="da"` hardcoded.
  They follow `brand.defaultLocale` now, with Danish as the special case.
- **Password reset**, a public route, passed the server's Danish through a page
  that already translated its other messages.
- **Values written into your database**: a redaction marker (`[slettet]`), a
  lead's `budget` default (`Ukendt`), and a review byline (`Anonym`). No later
  locale switch can reach those once written.
- **The admin**: the setup runbook, upload errors, the GDPR processor registry,
  and the boot error printed when `DATABASE_URL` is wrong.
- **Section defaults**: adding a Hero in the Visual Builder wrote
  `"Din overskrift her"` into your page. 67 strings across the studio sections
  and the section registry are English now.

### Five runtime-tier flags were read from the compile-time config

`/admin/features` writes a database override; these surfaces ignored it:

- **The weekly SEO cron** answered `200 {"ok":true}` and collected nothing on
  every shop that had activated Plus — `/admin/plus` activates by writing an
  override and never edits `brand.config.ts`, so the compile-time value stayed
  `false` permanently. If you run Plus, your GEO history restarts from here.
- **`/blog/feed.xml`** 404'd on a blog whose pages rendered and whose posts were
  listed in `sitemap.xml`.
- **The wishlist**: the product page showed the heart, `/account/wishlist` 404'd.
- **`/api/registry`** 404'd, so install counts never recorded.
- **Cart recovery** answered 200 and sent nothing.

### Changed behaviour worth knowing about

- **`messages/{da,en}.json` gained a `Chrome` namespace.** If you maintain your
  own message files, add it — a missing key renders the key itself as an
  aria-label. Keys: `navExplore`, `navInformation`, `navFooter`, `navPrimary`,
  `emailPlaceholder`, `ctaFallback`, `newsletterHeading`, `newsletterBlurb`,
  `emailLabel`, `newsletterSubmit`. The `Login` namespace gained ten
  `magic*` keys and `Account` gained two `resetActions_*` keys.
- **`/api/inquiries`, `/api/contact/upload`, `/api/live/token` and the review
  endpoint answer with a `code` field.** `error` is still there and is now
  always English, for scripts and logs. If you render `error` directly, map
  `code` instead.
- **A refused anonymous MCP batch is now a JSON-RPC error** (`-32600`) rather
  than a problem document. The refusal itself is unchanged.
- **The GDPR redaction marker is `[redacted]`.** Rows erased before this
  release keep `[slettet]`.
- **A lead's `budget` defaults to `""`** rather than `Ukendt`, so the admin
  badge is omitted when the form did not ask.
- **`contactAttachments` is resolved lazily** in `/api/inquiries` — only when a
  request actually carries attachments.

### Guards

Seven new or widened test guards, each proven by breaking what it protects:
storefront endpoints must answer in codes; admin-facing modules must be
English; section defaults and design packs are scanned for Danish; shared
components must resolve every key they name in every locale file; and a
runtime-tier flag must never be *gated* on the static config — a static read
stays legal as a default parameter or `??` fallback, which is how several
flags are correctly wired.


## v0.52.2 — 2026-08-29

**Second scaffold-correctness patch. Three assertions failed a customer for
choosing the `light` profile — for doing exactly what the profile promises.**

`release-scaffold-gate` vs `v0.52.1`: site ✅ · full ✅ · light ❌.

A pruned profile removes design packs and dev-only scripts. Three tests asserted
the ENGINE's full file set and therefore went red in a scaffold that had pruned
correctly:

- `site-pruned-scripts` required every listed script to exist —
  `light` prunes `scripts/publish-agent-card.ts`, which is the list's own job.
- `design-copy-language` read `designs/hoptify/homepage.tsx` — pruned.
- `marketplace-manifest` compared the rebuilt catalogue to the committed one —
  a pruned scaffold legitimately has fewer designs and chromes.

All three are engine-only assertions, and they say so now, gated on
`.cartwright/profile.json` — a file that exists in every scaffold and never in
this repo. They keep their teeth where drift can actually be introduced: the
engine, where CI runs.

The manifest one was **not** new to v0.52.x; it was latent in the shipped
artefact and only surfaced when the gate was pointed at a fresh tag.

Verified: `light` scaffold from the tag — tsc 0, 3379 passed + 23 skipped.
Engine — tsc 0, 3776 tests, lint 0.

## v0.52.1 — 2026-08-29

**Scaffold-correctness patch — found by the release gate against v0.52.0, the
same way v0.51.1 was found.**

- `tests/unit/agentic-endpoint-4xx.test.ts` destructured `routing.locales` by
  index. On the single-locale `["en"]` shop a scaffold produces, that tuple's
  TYPE is `readonly ["en"]`, so index 1 is `TS2493` — a compile error, and the
  light and full profiles would not typecheck
  (`release-scaffold-gate` vs `v0.52.0`: light ❌ · full ❌ · site ✅).
  Indexed access + `find` instead.
- Why the fork simulation missed it: it ran `vitest` against the scaffold shapes
  and never `tsc`. A type-level fork-hostility is invisible to a passing test
  suite. Both are now run against all three shapes before a release.


## v0.52.0 — 2026-08-29

**The money-and-language release. A shop can now say its own words, and charge
its own currency, in the language of the page it is on — and the tests can be
run by a shop that is not Danish.**

The trigger was one screenshot: `DKK 149.00` on `demo.cartwright.app/en`. What
that turned out to be resting on took four review rounds and forty-odd measured
defects to reach the bottom of.

### Language — the page a reader actually sees

- **`<Price>` had a `locale` prop and not one of its four call sites passed it**,
  so every storefront price rendered in the CURRENCY's language: 23 occurrences
  of `kr.` measured on the live English PLP. It reads the page's locale itself
  now, so a fifth caller cannot reintroduce the bug by forgetting a prop.
- The `<meta name="description">` on a secondary locale was the source
  language — the one piece of copy on the page written FOR crawlers and agents.
  The root layout sits above `[locale]` and cannot know; the locale layout and
  the homepage's own builder now localise it.
- `llms.txt` and the public `site.*` tools took a locale, used it for their URLs,
  and then published the base column's words. Extracted `translatedField`, which
  also fixed two latent faults: a `translations` column that arrived from raw SQL
  as TEXT never applied at all, and an own-property read now stops a key like
  `constructor` standing in for real copy.
- A shop's OWN words became translatable (`brand.copyTranslations`) — engine i18n
  cannot reach a tagline that lives in `brand.config`. An explicit per-locale
  translation outranks the locale-blind Resolvable Genome, by specificity.
- **A language-parity gate** (`scripts/smoke-canaries.sh`): a Danish string on an
  `/en` route now fails the canary run, with a 28-case self-test so the heuristic
  itself is measured rather than trusted.

### Money — what the customer is charged

- **The pay button showed one amount and Stripe charged another** whenever
  `multiCurrency` was on. Two independent derivations of one number; there is one
  now, computed once and handed to both.
- **A partial refund in a non-base currency refunded the wrong magnitude** —
  Stripe reads the amount in the PaymentIntent's currency, so 149 sent against a
  €19.97 charge requested €149. Converted with the order's own snapshotted rate.
- The agent surface quoted the base currency by documented design — correct while
  the flag was off, and self-contradictory the moment it was on: the page showed
  the presentment amount, Stripe charged it, and only the agent said otherwise.
- Multi-currency is **config-sovereign**: the charge currency cannot be flipped by
  a DB row.
- Shipping copy is interpolated from the configured rate, so the prose and the
  charge cannot drift. (The coffee demo promised 39 kr while its JSON-LD published
  `6.00` — a leftover from a spell as a USD store.)

### Search — three doors, one rule

The storefront, the agent API and the semantic ranker each searched differently.
Measured against the live catalogue before the fix: `press` returned three
products on the storefront and **zero** through the agent API; `кофе` returned
the ENTIRE catalogue as matches. They share one matcher now — substring, the same
rule Prisma's `contains` applies — with the asymmetries that remain (folding,
case, JSON attributes) written down rather than claimed away.

### Fork-safety — the engine is not a Danish shop

`tests/unit/` ships to every scaffold, and a dozen of its assertions named `da`,
`DKK` or `"en"-as-secondary` as if the engine's own configuration were universal.
**Measured: a default single-locale `["en"]` scaffold failed 5 assertions; a
USD scaffold failed 25.** Both are zero now. Guards that must name an
engine-internal path live in `tests/engine/`, which is mirror-excluded.

### Also

- `calculate_brew_ratio` resolves its recipe to a real, buyable product —
  read-only, and it prefers something the shop sells by weight so an embedded
  catalogue cannot answer "buy 1 × Paper Filters" to a coffee question.
- A negative smoke assertion that cannot read the page is now **inconclusive, not
  clean**: `does_not_contain` piped `curl` into grep, so a dead origin printed a
  green tick while asserting nothing.
- `?q=` with 250+ words threw `P2029` before reaching the database — an
  input-length cliff on a public GET, now deduped and capped.

**Migration:** none required. `multiCurrency` and `currencySwitcher` remain
default-off; `Order.currency`/`fxRate` have existed since v0.15.0.

## v0.51.1 — 2026-08-27

**Scaffold-correctness patch — found by running the release gate against the
tagged release itself.**

- `tests/unit/feature-flags.test.ts` hardcoded `brand.features.webMcp === false`.
  Since create-cartwright 2.8.0, webshop templates scaffold with the flag ON, so
  the assertion failed in exactly the scaffolds that are configured correctly
  (`release-scaffold-gate` vs `v0.51.0`: light ✅ · site ✅ · full ❌). The test now
  asserts the invariant that holds in every deployment — WebMCP only where
  `ecommerceEnabled` is true, the flag's declared precondition — mirroring the
  `firstRunWelcome` precedent in the same file. Gate re-run: **light/site/full 3/3**.
- Release coherence restored: `package.json` (which still read 0.50.0 at the
  v0.51.0 tag) and the marketplace manifest now track the CHANGELOG heading.

## v0.51.0 — 2026-08-27

**The agent-experience sweep: spec-current WebMCP, honest discovery, an
intent-first showcase — and webshop scaffolds go WebMCP-native.**

- **WebMCP tool correctness** (audited against the late-August draft, Chrome's
  best-practices doc and the reference commerce implementation):
  `search_products` returns reduced, bounded rows — checkout endpoints and
  internal fields never enter the browser surface (test-pinned);
  `add_current_product_to_cart` takes a natural-language `variant` (enum of
  option names) instead of an internal id, and omits the property entirely for
  variant-less products; `update_cart_item_quantity` is single-function (1–99;
  removal belongs to `remove_cart_item`) and both cart tools enumerate the
  live line ids in their schemas; ambiguous mid-request failures say so and
  route the agent through `get_cart` before any retry; descriptions lose their
  negative phrasing without losing the moat semantics.
- **Declarative forms, both audiences**: `toolparamdescription` types onto
  `<textarea>`/`<select>` and the contact form's five controls carry English
  parameter descriptions; newsletter agent outcomes are stable English while
  the human keeps the localized message; `:tool-form-active` /
  `:tool-submit-active` styling makes agent activity on a form visible
  (engine-neutral outline + a copper glow in crema). The crema letter form —
  previously a urlencoded POST at a JSON-only endpoint — is a real client
  form with inline outcomes.
- **`/webmcp-check` is an intent-first explorer**: "I want to…" chips map
  outcomes to tools with copyable example inputs; the page loads the Chrome
  team's WebMCP polyfill (Apache-2.0, vendored) as a page-scoped fallback so
  it demonstrates in any browser, and the live panel discloses polyfill vs
  native. Copy names the architecture: per-route registration is progressive
  disclosure.
- **Discovery conformance** (fresh-scanner + streamable-HTTP client trace):
  `/.well-known/ai-catalog.json` emits the ARD manifest shape (specVersion +
  host + urn:air entries with per-entry trust manifests) while keeping the
  legacy `resources` view; the A2A agent card carries top-level
  name/description/version (and deliberately NO `url` — a conforming client
  would treat it as a JSON-RPC endpoint); `/api/mcp` answers explicit-SSE GETs
  with the spec's 405 and unknown `tools/call` with a JSON-RPC `-32602`
  protocol error; `pricing.md` gains a real per-product price table that tells
  the buyable truth for variant products; `llms.txt` links the live
  `/webmcp-check` inventory when the flag is on.
- **Eval-run fixes** (GoogleChromeLabs webmcp-evals, 12/12 smoke steps green
  against the live demo — and three genuine findings): the cart page's
  locale-less links 307'd through the i18n middleware and next/link prefetch
  retried the redirect in a loop (~5 req/s from one idle empty-cart visitor) —
  all four links now carry the route locale; agent-facing URLs are canonical;
  `filter_products` speaks English parameters (`category`/`minPrice`/
  `maxPrice`/`sort: newest|price-asc|price-desc`) mapped to the route's query
  params, Danish input accepted leniently.
- **Lifecycle proofs**: the e2e fake `modelContext` now REJECTS duplicate
  names and pre-aborted signals (current-spec semantics), and a new
  soft-navigation spec clicks an App Router link inside one document so the
  AbortSignal teardown is genuinely proven.
- **WebMCP-native scaffolds** (create-cartwright 2.8.0): webshop templates
  (`--template coffee | sunglasses | generic`) scaffold with
  `brand.features.webMcp: true` — the store registers its tools the moment an
  agent-capable browser opens it; website-mode scaffolds keep the surface
  dormant behind the flag.

## v0.50.1 — 2026-08-27

**Scaffold-profile correctness patch** — the four unit tests that assumed the
full two-locale engine tree now derive their expectations from the scaffold's
actual shape (`hreflang` alternates from `brand.locales`, the Crema keying pin
applies only to registered packs, white-label checks skip pruned files), so
`create-cartwright` scaffolds run the whole suite green out of the box. Also
threads the route locale explicitly through dynamic translations — ambient
`getLocale()` loses it in production rendering (#492).

## v0.50.0 — 2026-08-27

**WebMCP-native storefronts: the whole in-browser agent surface behind one flag — plus Crema site-wide, and a catalogue page the design finally owns.**

- **WebMCP foundation hardened** (experimental, `webMcp` flag, default-off): tool
  registration is now awaited per the draft spec and degrades per-tool; detection
  is shared through the new zero-import `lib/model-context.ts` (used by the
  registrar and the `/webmcp-check` diagnostics page, which now updates its tool
  list live via `toolchange`). Tool results carry verification data: `get_cart`
  and `add_to_cart` return the full agent-facing cart summary — line handles
  (`cartItemId`/`productId`/`slug`), stock ceilings, and money as
  `{amountMinor, currency, formatted}` instead of a currency-hardcoded
  `subtotalDkk`. Cart mutation actions return discriminated results
  (`{ok:false, code:"not_found"}` instead of a silent no-op on foreign ids);
  infrastructure errors still throw, so UI behavior with the flag off is
  unchanged.
- **WebMCP tools are now contextual** (experimental, `webMcp` flag, default-off): the
  PDP registers `add_current_product_to_cart` for the product on the page (variants
  enumerated with ids, prices and stock in the description — and REQUIRED when the
  product has variants, so an agent cannot create the base-price line the human UI
  cannot create), and the cart page registers
  `update_cart_item_quantity` (0 removes), `remove_cart_item` and `go_to_checkout` —
  which only OPENS checkout for the human; no order-placing tool exists in the browser.
  The global registrar slims to search/get_cart/navigate. Per-page mounts gate
  server-side (null when off — byte-identical), carry their own AbortController so
  PDP→PDP navigation swaps tools cleanly, and re-register on RSC refresh so line ids
  stay fresh. The moat test now spans all three tool surfaces and requires globally
  unique names.
- **WebMCP declarative forms** (experimental, `webMcp` flag, default-off): the site
  search, contact and newsletter forms carry `toolname`/`tooldescription` when the flag
  is on — WebMCP-enabled browsers surface them as agent tools, every other browser
  ignores the attributes, and flag-off HTML is byte-identical. Agent-invoked submits
  are answered through `event.respondWith` with the actual outcome (navigation target,
  triage answer/escalation, subscription result). Autosubmit only on search (read-only);
  contact and newsletter ask the human to confirm; the checkout form is deliberately
  unannotated (financial). Typed in `types/webmcp-dom.d.ts`.
- **Cart lines now display the price checkout charges.** Every cart-line display read
  `product.priceDkk` even for variant lines, while checkout bills
  `variant?.priceDkk ?? product.priceDkk` — so a variant priced above its product showed
  one total and charged another. Fixed on the cart page (both render branches), the
  checkout review (both branches), the assistant's pre-purchase PlanCard total, the MCP
  `cart.get_summary`/`discounts.try_apply` tools, and the abandoned-cart email (whose
  query now loads the variant it prices by). The cart page's quantity ceiling is
  variant-aware too. A parity test scans the display surfaces so a bare
  `product.priceDkk` cart-line read cannot come back.
- **Dependency currency, within-major** — notably **Next.js 16.3.0 → 16.3.3, which includes
  the August 2026 security release** (unauthenticated RCE via AVIF image optimization in
  sharp/libheif, plus a Windows-only mixed-router issue). This engine's default config does
  not enable AVIF optimization, so no shipped shop was exploitable through it — the bump
  closes the class. Also Prisma 7.10.0 (CLI + client + adapters), AI SDK 7.0.79 +
  providers, Stripe 22.5.0, Sentry 10.71.0, next-intl 4.13.7 and friends. One source
  change: the AI chat model handle is typed as the common `LanguageModel` contract instead
  of a provider-derived type.
- **The catalogue page teaches the agent its own filters** (experimental, `webMcp`
  flag, default-off): the PLP registers `list_visible_products` — zero-network,
  returning exactly the server-narrowed list the human sees plus the active filter
  state — and `filter_products`, whose schema is SERVER-DERIVED (live category slugs
  as an enum, the sort whitelist, price bounds) and validated before navigating.
  After the RSC re-render the read tool re-registers with the new visible set. The
  moat gains the PLP surface; `filter_products` joins the navigation-only class.
- **Design packs can ship their own WebMCP tools**: new optional
  `DesignPack.webMcpToolBindings`, aggregated by the moat test across every
  registered pack via the design registry — global name uniqueness and the
  cart/catalogue families now hold across packs, and a pack pruned by a CLI profile
  drops out of the aggregation automatically. First pack tool: crema's
  `calculate_brew_ratio` — the homepage brew calculator's math (extracted to
  `brew-math.ts`) typed for agents, same module as the human's widget, under the
  new review-gated `PURE_COMPUTE` class.
- **/webmcp-check is now the agent-tools showcase**: the full tool inventory grouped
  by registering surface, built from the SAME binding constants the moat test
  verifies (a render test pins the loop closed), the safety-moat explanation in
  plain language, and setup steps for ChatGPT's built-in browser / the Chrome flag /
  the WebMCP Inspector — plus the live registration panel. `built-with-cartwright`'s
  WebMCP blurb now describes the real architecture, and proof links render only when
  the feature is ON for the shop (a proof that 404s is the opposite of proof).
- **WebMCP e2e harness**: a Playwright spec installs a faithful fake
  `document.modelContext` before any page script and walks home → catalogue → PDP →
  cart → checkout — contextual tool sets appear and disappear per route, one real
  add-to-cart round-trip mutates the dev DB, and checkout is asserted tool-free.
  Public architecture doc: `docs/webmcp.md`.
- **Crema covers the whole site**: `applyPaletteAsTheme` + a site-wide `CremaShell`
  (`.crema-site` scope with sol pins, dark color-scheme and compensation for
  hardcoded light utilities) close the dark/light seam — cart, checkout, account,
  info pages and the PLP now follow the roast. The PLP gets an editorial crema frame
  ("The shelf") via a refined `webshop.plpLayout` contract that hands the whole page
  frame to the design. Every stylesheet is now parse-checked in CI (a prose comment
  once terminated itself and took down every page at PostCSS time).
- **Shared chrome stops speaking for the brand**: the footer newsletter strip renders
  the brand's own copy on every chrome (the dark-chrome branch hardcoded Danish SaaS
  marketing), catalogue filters are value-driven (no empty eyewear dropdowns on
  non-eyewear shops) and fully localized, the mobile drawer is no longer the desktop
  nav's monolingual twin, and the AI assistant's inline product cards follow the
  visitor's locale with locale-prefixed links.
- **Engine self-promotion off the merchant's presentation path**: new
  `brand.website.showAuditFeed` (default on) coherently gates the engine-changelog
  surfaces (footer link, announcement-bar link, the `/changelog` route, the sitemap
  entry); `/cartwright` (the engine marketing page) is website-mode-only; the
  capability manifest speaks English on `llms.txt`, `/built-with-cartwright` and
  `/admin/features`; the content-negotiated 404 page styles itself.
- **Coffee template feeds the pack it ships with**: seed products now carry
  `Product.attributes` (origin/process/roast/notes/weight), threaded through both
  seed paths — crema's roast dots, origin badges and per-kg pricing light up from
  first seed.

- **New design pack `crema`** — a cinematic, dark-chrome premium DesignPack, i18n from birth,
  with its own webshop overrides: an attribute-driven product card (roast dots, origin badge,
  process subtitle, tasting-note chips, an honest ≈ kr/kg only when the weight parses), its own
  PDP frame with a scoped token bridge, and a brew calculator. Its homepage bar reads product
  imagery through the media shim, plays a product's `videoUrl` as a card loop (hidden under
  `prefers-reduced-motion`), and can show a live agent-readiness score fetched server-side at
  render — never a stored number. It is module-claimed for the webshop profile and keyed by an
  invariant so no pack can be mis-keyed again.
- **Attribute-driven merchandising, generalised.** `DesignProduct.attributes` reaches the design
  layer, and `lib/product-attributes.ts` merges `translations.<locale>.attributes` over the base
  so a spec table speaks the reader's language. Never guesses: an attribute that does not parse
  is not rendered.
- **A storefront that stays in its locale.** A config default can no longer pick the language for
  a locale-routed storefront; the story-first pack's links carry locales and follow the canonical
  routes; and the shared footer — chrome on every page of every scaffold that does not replace it
  — now prefixes every locale-routed link it emits and reads its remaining labels, including the
  ones only screen readers hear, from the message catalogue. A source-scanning invariant, with its
  exemption predicate derived from `lib/locale-exempt.ts`, keeps it that way.
- **Dark chrome paints its own text.** The first dark-chrome webshop exposed that the shared
  header's webshop leg had no dark variant: category links and cart/account icons rendered
  `sol-ink` on a black bar. Locked-dark packs do not bridge the palette, so dark chrome now paints
  explicitly — `MobileMenu` takes an optional `darkChrome`, default false. Light shops render
  **visually unchanged**, not byte-identically: the webshop nav's labels are now wrapped in a
  `<span>` that carries the dark classes only when the chrome is dark, so a light shop emits a
  wrapper span it did not before. Anything selecting those labels by DOM position should be checked.
- **The `site`-profile footer stopped rendering an empty copyright line.** `brand.footer.disclaimer`
  now defaults to `""` and the db footer falls back to a localized `<storeName> · All rights
  reserved`; its `site`-profile twin did not, and rendered the blank raw. Both twins are now held
  together by an invariant.
- **The default webshop homepage reads its section copy from the catalogue.** `aurora-shop` (the
  webshop-mode default) and `webshop-classic` moved "Most popular" / "View all" to the `Storefront`
  namespace — so a non-English shop's default homepage changes text where it previously showed
  English. `TrustBadges` gained a localized fallback too, but only for shops that empty
  `brand.uiLabels.trustBadgesPrimary`; the shipped default is non-empty, so a default shop is
  unaffected by that half.
- **Sunglasses-era card leftovers retired** from the shared storefront card — every shop wore them.
  No markup or class names were removed: the hardcoded `Summer Edition` featured badge and English
  `Sold out` now come from the `ProductCard` message namespace, and the Dannebrog origin pill
  renders only when `brand.uiLabels.productCardOriginBadge` is non-empty. **Upgrade note:** a shop
  that leaves that label empty stops rendering the pill (it used to render a flag with no text);
  set your own text to keep it, and note the English badge text itself changed from
  `Summer Edition` to `Featured`. `AnnouncementBar`'s hardcoded English link is localized too.

> **Upgrade note — message catalogues.** This release adds **108 keys** to `messages/en.json` and
> `messages/da.json`. Most are pack-scoped (`Crema.*`, `NorthernCoffee.*`), but a set is read by
> **shared, non-pack** components and required for a clean render: the whole new `Catalog.*`
> namespace (PLP filters, sort options, product count), `Footer.newsletterKicker`,
> `Footer.allRightsReserved` · `Footer.homeAria` · `Footer.shop` · `ProductCard.featured` ·
> `ProductCard.soldOut` · `Storefront.mostPopular` · `Storefront.viewAll` · `TrustBadges.primary` ·
> `AnnouncementBar.aiLink`. A fork that maintains its own catalogues instead of taking ours will
> render raw keys for those until it adds them. No schema change ships in this release — no
> `pnpm db:push` is needed.


## v0.49.0 — 2026-08-24

**Honest-ergonomics round 2: an accept-lenient MCP handshake and more places to find the agent view.**

- The MCP POST handshake widens JSON-implying Accept shapes (json-alone, wildcard, absent) to
  the canonical pair instead of answering the SDK's 406 — leniency, not indifference: a client
  asking for text/html still gets the 406.
- `/auth.md` opens with a leading heading (canonical + freshness in a footer line);
  `?mode=agent` on the homepage serves the agent view; `/{locale}/llms.txt` is the
  section-level index (real 404 on unknown locales); llms.txt links are all resolvable
  locale-canonical URLs.
- The ai-catalog carries a trustManifest (real trust routes) at top level and per entry, and
  OpenAPI's bearerAuth declares named per-scope grants with descriptions in a spec-legal
  extension.

## v0.48.0 — 2026-08-24

**Tiered MCP origin policy, the well-known agent card, and the card-publish flow.**

- The MCP origin guard gains a deployment-aware tier: local/intranet keeps the strict
  allowlist (the DNS-rebinding posture), while a genuinely public https deployment accepts
  well-formed foreign https origins — the cookie-less anonymous surface has no CSRF to
  protect, no CORS headers are sent, and TLS makes the rebinding case unreachable. Opaque
  origins still require their explicit `opaque:` entry everywhere.
- `/.well-known/agent-card.json` serves the A2A agent card at the ecosystem's canonical
  discovery path (same gate and honest 503-until-published as `/api/agent-card`).
- `scripts/publish-agent-card.ts` is the publish flow the card libraries never had:
  brand + live-catalogue payload, ephemeral ed25519 signing (no stored private key),
  transactional rotation. Site profile prunes it (db-coupled), mirrored in the CLI.

## v0.47.0 — 2026-08-24

**The honest-ergonomics round: markdown everywhere it helps, problem+json edge to edge.**

- Unknown `/api/*` paths (and `/api` itself) answer RFC 9457 problem+json with a `service-desc`
  Link instead of the HTML 404 page.
- `/auth.md` documents the real auth model (Bearer keys, named scopes, the anonymous five-tool
  surface, rate limits) — and says explicitly that no OAuth flow is offered. `/pricing.md`
  (webshop-only) publishes currency, VAT treatment and the live price range.
- `/index.md` is a URL-suffix fallback for the markdown homepage; Accept-negotiated homepage
  markdown opens with YAML frontmatter while bare `/llms.txt` stays byte-identical. Homepage
  responses carry markdown-alternate/sitemap/describedby Link headers.
- `/.well-known/ai-catalog.json` indexes the agent surface (profile-aware); the RFC 9727
  api-catalog gains `item` entries; OpenAPI states a `default` problem response; MCP tool
  failures carry structured `{code, status, message}`.
- `products.search` gains `offset` pagination; `categories.list` gains a real input schema
  (`includeEmpty`). New agent-surface routes are module-claimed so the `site` profile stays
  import-closed.

## v0.46.0 — 2026-08-24

**The agent-ready public surface: anonymous typed reads, OpenAPI 3.1, trust routes and honest discovery.**

### 🤖 Agent-readiness

- Anonymous, rate-limited access is restricted to five public read-only tools: product search/get,
  category list, and published-page list/get. Private reads and every write still require a scoped
  Bearer key; drafts, customers, orders and administration stay outside the anonymous boundary.
- MCP now publishes concrete input/output schemas and public resources, while generated OpenAPI
  3.1 exposes one typed operation per tool. The legacy `{ "args": { ... } }` MCP input shape remains
  accepted for one compatibility release.
- Agent-facing errors use Problem Details, public and pre-auth requests have separate rate limits,
  client IPs are trusted only through configured ingress, and anonymous MCP batches are rejected.
- Runtime, locale-aware canonical/hreflang and social metadata now agree across HTML, `llms.txt`,
  sitemap, trust pages and structured data. Markdown negotiation and recoverable 404 guidance are
  covered by contract tests.

### 📚 Adoption and release hygiene

- README quick start now distinguishes `site`, `light` and `full`, links directly to docs, demos,
  Issues, support and contribution guidance, and includes a production-build check.
- GitHub issue forms, support routing and the published stable/main distinction are documented.
- Root and marketplace versions now track the newest stable release as a coherence check;
  missing `v0.43.0`–`v0.45.0` public release summaries are restored below.

## v0.45.0 — 2026-08-22

**Agent-surface and public-route hardening, an English admin, and the vermilion identity.**

- Closed framework-level `OPTIONS` bypasses across MCP, ACP, UCP, A2A and merchant-feed surfaces;
  the shipped guidance and profile-safe tests now preserve those route guards.
- Fixed locale-less route shadowing, login `callbackUrl` handling, canary asset/domain validation,
  and light-profile test assumptions.
- Added bounded attribution for UCP OAuth client registration and one explicit opaque MCP origin
  for operators that need it.
- Translated the admin panel to English and moved the engine identity from purple to vermilion.

## v0.44.1 — 2026-08-08

**MCP preflight guard patch.** `OPTIONS` now passes through the same public-feature and Origin
policy as the other MCP verbs instead of being answered by Next.js before the guard.

## v0.44.0 — 2026-08-07

**MCP Origin validation, Next.js 16.3, and stronger canary/profile contracts.**

- Added the Streamable HTTP Origin validation required to prevent DNS-rebinding attacks.
- Upgraded Next.js to 16.3.0 and NextAuth to the security-patched beta.32.
- Hardened canary timeouts and customer-domain detection, normalised discount lookup at the
  schema boundary, and made mixer/chrome errors identify the rejecting side.
- Removed shipped pointers to private-only files and made locked-design fixtures derive from the
  active profile rather than one named design.

## v0.43.0 — 2026-08-01

**Identity ownership and destructive-seed safety.**

- Made `brand.config.ts` the default identity authority and applied the same invariant to the
  Solbrillen canary.
- Refused to seed over a database that already contains customer work, while adding a safe path to
  create an operator on an existing production database.
- Fixed required lead fields receiving empty strings, discount length checks before trimming, and
  mixer chrome compatibility so the active design pack owns the decision.

## 🔒 Security advisories

| ID | Affected versions | Fixed in | Severity | Action |
|----|-------------------|----------|----------|--------|
| CW-2026-001 | ≤ v0.39.1 | v0.40.0 | Moderate | Upgrade — or backport the `mcpPublic` route gate + the API-key `expiresAt` check (#367) |
| CW-2026-002 | ≤ v0.40.0 | v0.41.0 | High (upstream) | **Dependency advisory — Next.js.** Every shop scaffolded at v0.40.0 or earlier ships a `next` version below `16.2.11` (`16.2.10` at v0.39.1–v0.40.0, `16.2.9` at v0.38.0–v0.39.0, `16.2.6` at v0.37.1 and earlier) — **every 16.2.x below 16.2.11 is affected**, so check the number in your own `package.json`, not just your engine tag. Next.js' July 2026 security release patches 9 CVEs (4 high); two reach every Cartwright shop regardless of profile because every profile ships Server Actions: a Server-Action DoS (CVE-2026-64641) and unauthenticated disclosure of internal Server Function endpoint IDs (CVE-2026-64643). **You do not have to wait for a Cartwright release** — fix it in your own shop today: `pnpm add next@16.2.11 && pnpm add -D eslint-config-next@16.2.11` (exact pins, matching the scaffold's dependency style) (#395) |
| CW-2026-003 | ≤ v0.56.2 | v0.57.0 | High (upstream) | **Dependency advisories.** Fourteen `pnpm audit --prod` findings: thirteen below `@modelcontextprotocol/sdk`, `next` and the Prisma CLI (`fast-uri`, `sharp`, `qs`, `hono`, `mysql2`, `deepmerge-ts`) plus the direct `js-yaml`. Upgrade — or fix it in your own shop today: copy the `overrides` block from this repo's `pnpm-workspace.yaml` into yours, set `"js-yaml": "^4.3.2"`, run `pnpm install`, and confirm with `pnpm audit --prod` that none of these fourteen remains (an older shop may still show earlier advisories — see CW-2026-002). **If your `next` is still 16.2.x** (engine ≤ v0.43.x), you lock `sharp` 0.34.5: no 0.34 release is patched and the `sharp` selector does not touch it, so move to `next` ≥ 16.3.3 first — `pnpm add next@16.3.3 && pnpm add -D eslint-config-next@16.3.3`, the scaffold's exact-pin style — and then copy the block (#583) |
| CW-2026-004 | v0.17.0 – v0.58.0 | v0.58.1 | Critical (upstream) | **Dependency advisory — Next.js.** GHSA-vcvr-r3jv-pc5j: remote code execution in the Node.js `ImageResponse` from `next/og` when attacker-controlled values reach the SVG it renders. Every `next` from 16.2.0 to 16.3.5 is affected, and every shop since v0.17.0 shipped one of them. Check the number in your own `package.json`. Every shop since v0.17.0 also ships `app/og/route.tsx`, in every profile. It renders the public `?title=` and `?description=` values with that `ImageResponse`. It places them as text rather than SVG markup, so exploitability is not proven — upgrade regardless. **You do not have to wait for a Cartwright release.** (1) On v0.58.0 or newer, `pnpm-workspace.yaml` has `minimumReleaseAge`, which refuses 16.3.6 until 2026-09-25 16:22 UTC. Either wait until then, or first copy the `minimumReleaseAgeExclude` block (twelve exact `16.3.6` versions) from `pnpm-workspace.yaml` on the template's `next` branch into yours. (2) Then run `pnpm add -E next@16.3.6 && pnpm add -D -E eslint-config-next@16.3.6`. If you cannot upgrade today, delete the `app/og/` directory. The pages that point their share image at `/og` (`pageOg` in `lib/og.ts`) then unfurl without an image. Four shipped tests expect it and stay red until you restore it: `tests/unit/locale-exempt-routes.test.ts` (two), `tests/unit/modules.test.ts` and `tests/unit/scaffold-manifest.test.ts` |
| CW-2026-005 | ≤ v0.58.1 | v0.58.2 | High (upstream) | **Dependency advisories.** `pnpm audit --prod` findings in transitive `undici` (below `jsdom` and `@vercel/blob`), `ip-address` (below `@modelcontextprotocol/sdk`), `fast-uri` (below `ajv`, under the MCP SDK and the Prisma CLI) and `brace-expansion` (below `@sentry/nextjs`), plus the direct `dompurify` (low; needs `IN_PLACE`, which Cartwright never passes). None is known to be reachable from a request in a shipped shop. Upgrade — or fix it in your own shop today: copy the `overrides` block from this repo's `pnpm-workspace.yaml` into yours, set `dompurify` to `^3.4.16` in `package.json`, and run `pnpm install`. Move `next` to 16.3.8 as well (CW-2026-006); `pnpm audit --prod` may not list that advisory yet, so a clean audit alone does not prove you are done. |
| CW-2026-006 | ≤ v0.58.1 | v0.58.2 | High (upstream) | **Dependency advisory — Next.js.** GHSA-cjq9-62q9-8jv4: server-side request forgery in Image Optimization, plus five medium advisories (cache poisoning of SSG/ISR pages, metadata image routes, `use cache` leaks) and one low one in the development server, all fixed in `next` 16.3.8. The engine's `next.config.ts` sets `images.remotePatterns`, so a shop serves `/_next/image` unless it removed that block. The exact affected range is on the advisory page; every `next` below 16.3.8 that Cartwright has shipped should be treated as affected. Check the number in your own `package.json`. **You do not have to wait for a Cartwright release.** (1) On v0.58.0 or newer, `pnpm-workspace.yaml` has `minimumReleaseAge`, which refuses 16.3.8 until 2026-10-03 16:08 UTC. Either wait until then, or first copy the `minimumReleaseAgeExclude` block (twelve exact `16.3.8` versions) from `pnpm-workspace.yaml` on the template's `next` branch into yours. (2) Then run `pnpm add -E next@16.3.8 && pnpm add -D -E eslint-config-next@16.3.8`. |
| CW-2026-007 | ≤ v0.59.1 | v0.60.0 | High (upstream) | **Dependency advisories.** `sharp` below 0.35.5 (GHSA-wq5f-xc86-pv6w, librsvg) and `source-map-js` below 1.2.2 (GHSA-68fv-2mgg-jv7q, build time), both below `next`. Not known to be reachable from a request: the engine does not set `images.dangerouslyAllowSVG`, and on Vercel image optimisation does not run in your functions — but a shop that serves itself with `next start` runs `sharp`. Fix it in your own shop today: copy the `overrides` block from this repo's `pnpm-workspace.yaml` into yours, run `pnpm install`, and confirm with `pnpm audit --prod`. |
| CW-2026-008 | ≤ v0.61.0 | v0.62.0 | Moderate | **Insecure default — cron routes without `CRON_SECRET`.** Every route under `/api/cron` ran for any caller while `CRON_SECRET` was unset, because Vercel Cron sends its `Authorization` header only once the secret exists: anyone who knew a path could start a backup, delete expired tokens and old audit-log rows, send cart-recovery mail, refresh FX rates or take the SEO snapshot. v0.62.0 refuses such a call in production with `503`. Upgrade and set `CRON_SECRET` first (see v0.62.0 → Upgrading) — or fix it in your own shop today: generate a secret with `openssl rand -hex 32`, set it as `CRON_SECRET` in your production environment and redeploy; with the secret set, v0.61.0 and earlier already answer a wrong or missing bearer with `401`. |
| CW-2026-009 | ≤ v0.61.0 | v0.62.0 | Critical (upstream) | **Dependency advisories — Next.js.** GHSA-673q-mjm6-r5xr (critical: remote code execution in `use cache` functions returning typed arrays), GHSA-2464-fhr4-w9xw (critical: remote code execution in Image Optimization when SVG files are used) and GHSA-p3m5-59mp-jv5r (high: denial of service in the App Router via Server Actions), all fixed in `next` 16.4.1 (and 15.5.28 on the 15 line). The engine writes no `use cache` function and does not set `images.dangerouslyAllowSVG`, so the two critical advisories are not known to be reachable unless your shop added either; the App Router enables Server Actions by default, so treat the denial of service as reaching every shop. Check the number in your own `package.json`. Upgrade — or fix it in your own shop today: run `pnpm add -E next@16.4.1 && pnpm add -D -E eslint-config-next@16.4.1` (on v0.58.0 or newer, `minimumReleaseAge` refused 16.4.1 until 2026-10-17 17:44 UTC; it installs normally now). |
| CW-2026-010 | ≤ v0.62.0 | v0.63.0 | Moderate | **Agent checkout took payments without an order.** `/api/commerce/agent-checkout` — public, behind no flag, and named as `checkoutEndpoint` on every `/api/products/search` row — opened a Stripe payment page for a product and created no order: the buyer could pay, the Stripe webhook skipped the payment because no order was attached to it, and the shop recorded nothing. v0.63.0 answers every request with `410 Gone` before it reads the product or contacts Stripe, and the search rows no longer name the route. Upgrade — or fix it in your own shop today: copy `app/api/commerce/agent-checkout/route.ts` from v0.63.0 over yours (it imports only `brand.config.ts` and `lib/api-problem.ts`, both unchanged since v0.62.0; your copy of `tests/unit/agentic-endpoint-4xx.test.ts` then fails on the route's old input checks — delete those). Either way, if your shop has Stripe connected, look in the Stripe dashboard for Checkout Sessions whose metadata has `source: agentic_commerce` and a `productId`: each paid one is a payment with no order in the shop. |
| CW-2026-011 | ≤ v0.62.0 | v0.63.0 | Moderate | **Password-reset token in the page address, sent to Google Analytics.** The emailed reset link opened `/account/reset-password?token=…` and the page ran with the token in its URL, where every script on the page can read it; with `analyticsGa4` on, GA4's page view sent the whole URL to Google — Consent Mode's cookieless ping too, when the visitor had refused analytics. The token sets a new password on any account, an admin's included, for an hour. Up to v0.62.0 the page ran only in a browser signed in to the shop: a signed-out visitor was sent to the login page without the token. v0.63.0 moves the token into an httpOnly cookie through a server-side redirect before any HTML exists; emailed links keep working. Upgrade — or, until you can, set `analyticsGa4` to `false` in `brand.config.ts` (a compile-time flag) and redeploy; that stops GA4 from sending the token, but it stays in the address bar and the browser history until you upgrade. |
| CW-2026-012 | ≤ v0.65.0 | v0.65.1 | Critical (upstream) | **Dependency advisories.** `@sentry/nextjs` below 10.75.2 (GHSA-mchm-gjx6-7h55, critical: middleware bypass under the `tunnelRoute` path; affects webpack builds only, and the engine sets `tunnelRoute: "/monitoring"` but builds with Turbopack), plus transitive `undici` below 6.29.1 / 7.30.1 (four high, four moderate), `body-parser` below 2.4.0 and `qs` up to 6.16.0 (under the MCP SDK's `express`), `zod` below 4.6.6 (inside `@vercel/cli-config`), `fast-uri` below 3.1.9 (two moderate, two low) and `ip-address` up to 10.7.3. None is known to be reachable from a request in a shipped shop built with `pnpm build`. Upgrade, or fix it in your own shop today: `pnpm add @sentry/nextjs@^10.76.2`, copy the `overrides` block from this repo's `pnpm-workspace.yaml` into yours, run `pnpm install`, and confirm with `pnpm audit --prod`. If you build with `next build --webpack`, do this now. |

## v0.42.0 — 2026-07-25

**Hardening release II: the visitor's path, and the difference between a deploy that works and one that reports success.**
Ten changes from the second and third rounds of findings by the same downstream product — this time
from ordinary operation after go-live, and from setting production up. Round one's pattern was *one
value, many encodings*. These two add: **failures designed not to be noticed** (the data is rescued
so nobody feels the error; a correct configuration reads as empty) and **a default setup that looks
right without being it** (a deploy reports `● Ready` while serving nothing; a CI file sits in the
repo without ever running).

### ✨ Added
- **`pnpm verify:deploy <url>`** (`scripts/verify-deploy.sh`) — the check a green deploy cannot
  perform for you. A Vercel project whose Framework Preset is "Other" — what an empty CLI-created
  project gets — sets, per Vercel's docs, "the output directory as `public` if it exists". Cartwright
  *has* a `public/`, so the platform skips `next build` and serves your logos: every route 404s, the
  build log is empty, nothing errors, and the dashboard says Ready. The script asks for three routes
  the **app generates** (`/robots.txt`, `/sitemap.xml`, `/llms.txt`) — none exists as a file in
  `public/`, so a 200 proves the framework ran. Which routes is the whole design: `public/mcp.json`
  answers 200 in exactly the broken state, so a check aimed at any static file passes straight
  through the failure it exists to catch (#412).
- **`brand.identitySovereignty: "auto" | "config" | "db"`** — who owns `storeName` and
  `ecommerceEnabled`, stated instead of assumed. `"auto"` (default) reproduces today's behaviour
  expression-for-expression, so it is byte-identical by construction; `"config"` makes
  `brand.config.ts` sovereign in every mode, which is what a code-configured fork needs; `"db"` is
  the deliberate multi-tenant escape hatch. Top-level rather than a `features.*` flag on purpose:
  `FeatureKey` parity would break forks on their own config, and a protection a contaminated
  database can switch off is not a protection (#408).
- **`features.leadAiTriage`** (default **off**) — gates the AI triage on the contact form. Off is
  the honest default because `ANTHROPIC_API_KEY` is documented as optional; a surface that needs an
  optional key in order not to log an error per submission should not be on by default (#403).

### 🛠 Fixed
- **The visitor waited on — and funded — an LLM.** `/api/inquiries` awaited an Anthropic call
  *before* `prisma.lead.create`, so every enquiry paid the round-trip in latency and, without a key,
  logged an error per submission while still saving. Triage now runs in `after()` from `next/server`
  after the row is written (the pattern `lib/registry-stats.ts` already used), gated on
  `anthropicConfigured` — not `isAiConfigured()`, which is true when *either* provider is set while
  the `"vibe"` model requires Anthropic specifically. Separately, `/api/support/triage` — a second,
  unauthenticated LLM call the same form makes — had no per-IP rate limit (#403).
- **A contact form required agency fields.** `projectType` was `z.string().min(1)` with a hardcoded
  Danish message, so a plain enquiry from a hand-written form or a direct POST was rejected as the
  visitor's mistake. The shipped form hid this by always sending a value (#404).
- **`defaultLocale` fell back to a literal `"da"`** in the data-source seam, so an English fork
  served `/en/…` while `llms.txt` announced Danish. It now derives from `brand.config` — proven on a
  *different* input than the current value, because a test comparing to today's value also passes
  against a hardcoded one (#405).
- **The admin under-reported production.** `getResendStatus()` read only the database row while
  `lib/mailer/resend.ts` happily used `RESEND_API_KEY` from the environment — so a correctly
  configured fork saw "not set" on the one screen it was told to trust. Now matches the
  `envFallback` shape its two sibling status readers already had (#406).
- **Identity could be read around its own lock.** The Phase H guard was correct and well tested, and
  a fork's site renamed itself anyway: `Header`, `Footer`, `llms.txt`, the sitepack exporter and the
  composition exporter read the raw `BrandingSettings` row rather than the guarded merge. The policy
  now normalises **at the seam**, and `tests/unit/identity-bypass-invariant.test.ts` fails the build
  if any file queries the row and reads a sovereign field off it — because the readers that matter
  are the ones nobody has written yet (#408, #409).
- **The admin stored values it would never render.** Under `"config"`, the settings form, the setup
  wizard and `settings.update_branding` now drop the sovereign fields from the write and say which
  ones, instead of accepting input, reporting "Settings saved!" and changing nothing. The fields
  render as locked, and when the stored and effective values differ the form says so in as many
  words (#411).
- **`DEPLOY.md` contained a false instruction.** §9 read "Vercel auto-deploys from main" directly
  under a §1 recommending `vercel link` — but linking a *folder* to a project is not connecting the
  *project* to a repository, and pushes deploy nothing until `vercel git connect`, which itself
  requires a remote. §1 now leads with the repo; §9 states what `vercel --prod` actually does:
  uploads the working tree, **including uncommitted changes**, with no commit attribution and no
  rollback to a known state. Also documents the `vercel env pull` traps — it overwrites rather than
  merges, and sensitive values come back **empty**, so empty ≠ missing (#407, #412).

### 🧹 Housekeeping
- **`scripts/smoke-canaries.sh` no longer ships to scaffolds.** It hardcodes three Teloz canary URLs
  and asserts their brand names, themes and database state; a fork running it learned nothing about
  its own site. `scripts/verify-deploy.sh` is the customer-facing equivalent — any URL, no prior
  knowledge — and the two shipped files that told the reader to run the canary script now point
  there instead (#412).
- **Root `package.json` version** rejoins `CHANGELOG.md` and the marketplace manifest at 0.42.0; the
  v0.41.0 release bumped the other two and left it at 0.40.0.

## v0.41.0 — 2026-07-25

**Hardening release: import-time side effects, identity ownership, and the Next.js July security patch.**
Eleven changes driven by findings from a downstream product's first production deployment
(a code-configured fork — `brand.config.ts` in git, admin used only for operations). That usage
is exactly what Cartwright markets itself for, and it exposed a systematic assumption: the engine
treated the admin database as the source of truth, so wherever code and database disagreed, the
database won **silently**.

### 🔒 Security
- **Next.js 16.2.10 → 16.2.11** — the July 2026 security release, 9 CVEs (4 high). Two reach every
  Cartwright shop regardless of profile because every profile ships Server Actions: a Server-Action
  DoS (CVE-2026-64641) and unauthenticated disclosure of internal Server Function endpoint IDs
  (CVE-2026-64643). Tracked as **CW-2026-002**; `eslint-config-next` moves in lockstep. Per-CVE
  applicability was verified against this repo rather than assumed — the other six need
  `config.i18n.locales`, `rewrites()`/`redirects()`, a custom server, the edge runtime, or a
  `fetch(new Request(init), otherInit)` shape, none of which the engine uses (#395).
- **`.gitignore` now covers `.admin-credentials*`** — the bare name matched only that exact file, so
  a sibling like `.admin-credentials.prod` (what a production-admin bootstrap writes) was
  commit-eligible. A `!.admin-credentials.example` negation keeps the convention's stub committable (#399).

### ⚠️ Breaking
- **`sanitizeUserHtml()` is now async** (`lib/v0/transform/sanitize-strict.ts`), and with it
  `parseSitePackContent`, `sanitizeContentRow`, `sanitizePageRow` and `sanitizeLayoutJson`
  (`lib/sitepack/import-parse.ts`). If your fork calls any of them directly, add `await`; every
  in-engine call site was already async. The reason is not cosmetic: jsdom is now **loaded** on
  first use rather than imported at module scope, and a dynamic import cannot be synchronous. See
  below (#397).

### 🛠 Fixed
- **A feature toggle could rename a live site.** Nineteen `BrandingSettings` `create:` branches
  across fourteen files hardcoded `storeName: "Cartwright"` (and `"My store"` / `"Min shop"` in the
  wizard's own writers). That branch runs only when the row does not exist — the normal state of a
  fork configured in code — so the first arbitrary admin action stamped the engine's name onto the
  product: header, footer, and `llms.txt`, the file AI crawlers read. All nineteen now read
  `brand.storeName` through `brandingCreateDefaults()` (#398).
- **Importing the HTML sanitizer loaded jsdom.** `sanitize-strict.ts` imported and constructed jsdom
  at module scope, and it is reachable from `lib/tools/registry.ts` — a barrel that statically
  imports ~20 tool modules and is imported by 14 files, including `/admin/audit`, which wants only
  `getTool()`. jsdom's CJS entry requires `html-encoding-sniffer`, which depends on the ESM-only
  `@exodus/bytes`; under some bundler/runtime combinations that boundary throws `ERR_REQUIRE_ESM` at
  module load and takes the whole page down, a subsystem away from anything to do with HTML (#397).
- **Every page view loaded 29 design packs to bust a cache.** `lib/theme.ts` imports `@/designs`
  (29 static pack imports, ~1.4 MB, unshakeable because `ALL_DESIGNS` references each one), and 31
  files import `lib/theme` — including `app/[locale]/layout.tsx`, the storefront root layout. Eight
  writers imported it purely for the three-line `invalidateThemeCache`, and a plugin purely for the
  two-line `isValidHex`. Both now live in leaf modules (`lib/theme-cache.ts`, `lib/color.ts`) that
  `lib/theme.ts` re-exports, so the documented plugin contract is unchanged. This also explains two
  tests long written off as "flaky under load": audit-revert 2.58 s → 284 ms, design-import
  2.00 s → 240 ms (#401).
- **`vercel.json` pins `"framework": "nextjs"`.** A project created through the Vercel CLI defaults
  to preset "Other", which serves `public/` statically — every route 404s and the build takes 0 ms,
  with nothing that looks wrong (#399).

### ✨ Added
- **A lint rule against import-time side effects** — `no-module-scope-heavy-construction` forbids
  constructing jsdom/Prisma/Redis/OpenAI/Anthropic/Resend/Stripe/S3 clients at module scope, where a
  barrel turns one module's cost into every importer's problem. The rule is written into `AGENTS.md`,
  so scaffolds inherit it (#400).
- **Module/profile dependency inventories** — import-grounded per-module dependency sets and derived
  prune sets, with five invariants (#391).

### 🧪 Tests
- New invariants that fail the build rather than relying on discipline: no writer may hardcode a
  store name (source scan, quote-agnostic, with a reasoned allowlist and a spread-precedence check),
  jsdom must not be loaded at import, leaf modules must stay leaves, credential globs are asserted
  through `git check-ignore` itself, and every `vercel.json` cron must resolve to a real route (#398,
  #397, #401, #399).
- The `/api/mcp` tool bridge is locked: 1:1 tool registration with no scope pre-filtering, `isError`
  on failed calls, scope delegation, audit context, and the stateless-JSON transport (#396).
- Write-tool coverage for `lib/tools/discounts.ts` and `lib/tools/marketing.ts` (#392, #393).

### 📚 Docs
- The `section-vocabulary` skill mirrors all 27 registry section keys (was 20) (#394).

## v0.40.0 — 2026-07-19

**The site profile — a real site with no database — plus Plus activation and the public-surface lockdown.**
The engine now describes itself as modules (`cartwright-module-v1`), proves the site file-set
import-closed, and scaffolds a static `--profile site` variant; Cartwright Plus activates via
Ed25519-signed keys; and the public MCP/tool surface finally honors its own flag.

### 🔒 Security
- **`mcpPublic` is now enforced on the public tool surface** — `/api/mcp` and `/api/v1/tools`
  previously answered even with the flag off; they now return 404, indistinguishable from a site
  without the surface. **`ApiKey.expiresAt` is now enforced** — expired keys were previously still
  accepted; they now get 401 (#367, follow-up #377). Tracked as **CW-2026-001** in the advisory
  index. The flag defaults on (and is on in every shipped config), so only shops that explicitly
  disabled `mcpPublic` and/or relied on API-key expiry are affected. Upgrade, or backport
  `lib/tools/public-gate.ts` + the `lib/api-auth.ts` expiry check.

### ✨ Added
- **The module/profile architecture (site-profile B-phase)** — the `cartwright-module-v1` spec +
  module/profile registry with graph tests (#374), per-module file inventories + the agent-core
  node + a `knownDeviations` ledger (#381), and the B3 engine slice: static design-layer variants,
  18 import seams and `scaffold/manifest.json`, proving the site file-set import-closed so
  `create-cartwright --profile site` cuts a no-DB static site (#382, #383, #384, #385).
- **Cartwright Plus activation v1** — Ed25519 license-key verification + `/admin/plus`, env-only
  and schema-free (#380).
- **Adaptive-admin slice** — the four always-rendered AI admin pages are now flag-gated (#375).
- **The mixer preview surfaces non-mixable Skin×Voice combos** instead of silently degrading (#388).

### 🛠 Fixed
- `/api/acp/feed` gates on `ecommerceEnabled` — website-mode parity with the other feeds (#370).
- Regenerated the drifted migration baseline so `prisma migrate deploy` works, guarded by a new
  `db:verify` CI gate (#379).
- Version coherence restored — CHANGELOG entries for v0.38.0–v0.39.1 + `package.json`/manifest
  version alignment (#378).
- The site-audit walker falls back to an fs-walk when the tree has no git repo (#386).

### 🛡 Hardened
- Tool suites locked: the feature-flag read/write tools (#387), the taxonomy upsert/delete/list
  tools (#366), the ACP session→Order money path (#365) and the settings singleton write tools
  (#389).

### 📚 Docs & launch
- Tool map regenerated (86 tools / 35 domains) + drift gate + the simple-site runbook (#371);
  launch-content fact-refresh (#376); the "Choose Cartwright when" decision matrix + shadcn
  try-one-component (#372); the README terminal cast (#373); community badges, issue/PR templates
  + Code of Conduct (#368); the 2026-07 radar delta (#369).

## v0.39.1 — 2026-07-12

**Hardening patch — the protect-live test wave + dependency currency.**

### 🛡 Hardened
- **Moat + money-path regression tests**: the ACP delegated-payment completion route (#358),
  the Guardian adjudication core (fail-closed, replay, short-circuit order — #359), the escrow
  fund-release route (#362) and the audited order-status tool + operator state-machine (#363)
  are now all pinned by non-vacuous unit suites (source-mutation-verified).

### 🛠 Maintenance
- Within-range dependency currency batch + `postcss` security override (#361).
- Non-blocking native typecheck script (`typecheck:native`, tsgo trial) (#360).
- Byte-identical a11y recipes added to the cartwright-guidance skill (#364).

## v0.39.0 — 2026-07-07

**AI-crawler policy, declarative design layout, and honest agentic error handling.**

### ✨ Added
- **AI-crawler taxonomy in the SEO controls** — Search/Agent/Training crawler categories with a
  new "block training only" policy option (#355).
- **`DesignPack.layout`** — design packs declaratively control the shared `<main>` wrapper
  (`mainClassName` / `ownsMain`) instead of fighting it (#351).

### 🛠 Fixed
- Agentic endpoints (ACP/A2A/tools) return proper 4xx for client errors — never a masking 500 (#352).
- Ember chrome reads the `isEcommerce` predicate; `Button` has a visible focus ring (#353).

### 🛡 Hardened
- Discovery route handlers pinned by tests: `/api/agent-card` (#348), `/.well-known/mcp.json`
  (#349), both product-feed routes (#350) and `POST /api/negotiate` (#357).

## v0.38.0 — 2026-07-03

**Agentic discovery goes spec-true, the checkout speaks your language, and the stack gets a
currency pass.**

### ✨ Added
- **ACP product feed pinned to the official OpenAI schema** — discovery-ready field mapping
  (`item_id`, price strings, availability enums, seller/policy URLs) (#340).
- **Google Merchant `g:product_detail` conversational attributes** in the Merchant feed (#342).
- **Speculation Rules prefetch** behind a new default-off `speculationRules` flag (#341).
- 2026-07 feature radar (agentic commerce, Next 16.x, web platform) as the roadmap driver (#339).

### 🌍 i18n
- The entire cart + checkout flow routed through next-intl: payment panel, trust badges,
  field-validation errors and order-placement errors (via error codes) (#337, #338, #344, #345).

### 🛠 Fixed
- Tool/section JSON-Schemas now emit real schemas via Zod v4 `z.toJSONSchema` (#324).
- Fresh-scaffold DX hardening from the v0.37.1 cold-run audit (#323).

### 🛡 Hardened
- Dependency currency + `undici` security override (#332); AI SDK v7 migration (#336).
- +49 regression cases across shipping/pricing/FX/genome-resolve (#333); catalog-feed builder
  + UCP capability-profile invariants pinned (#346, #347).
- Product-aware accessible names for cart/add-to-cart/wishlist controls (#322, #334, #335).

## v0.37.1 — 2026-06-16

**Cleanup patch — three finished, gated-green PRs that missed the v0.37.0 cut.**

### 🔒 Security
- **Optional shared-secret guard on the Phone.inc webhook** (`plugins/phone-widget`) — the
  click-to-call webhook can now require a shared secret, so a shop running the phone widget can
  reject unauthenticated webhook calls. Opt-in (set the secret) and the plugin is default-off,
  so this is hardening rather than a forced critical fix — no advisory-index row.

### ✨ Added
- **Flag-gated Preview link on the Design picker cards** (`/admin/designs`) — each design card
  can surface a Preview link to see the look before applying it (default-off).

### 🛠 Fixed
- **PLP empty-results heading** now echoes the searched term, so a no-results search reads as
  a search for «that term» instead of a generic empty state.

## v0.37.0 — 2026-06-15

**SitePack portability, content-import, the purple rebrand — and a new-customer hardening wave.**
A whole site is now exportable and restorable as a `.cartpack`, an AI can rebuild a real site
from a scraped URL, the engine wears its own Cartwright-purple identity, and the cold-scaffold
first hour was audited end-to-end (4 personas + Codex/Gemini) with the breaks fixed at the source.

### ✨ Added
- **SitePack** (`sitepack.export` / `sitepack.import` + the `/admin/sitepacks` Snapshot & Restore
  wizard) — snapshot a whole site to a hardened, integrity-checked `.cartpack` (sha256 + merkle,
  red-teamed in-memory tar codec, content-safety + compat gate on import) and restore it onto a
  newer engine. The code-vs-data boundary that makes a site portable.
- **Content-import** — scrape a URL → rebuild it as Cartwright pages/services as **drafts**
  (`draft|published` status on Page + Service), with a page classifier, dry-run import planner,
  SSRF-guarded remote-image import, and the `runImport` orchestrator. Flag-gated (`siteImport`).
- **Blog + services + image tool surface** — `posts.create/update/publish/list`,
  `services.create`, and `images.import_from_url` over the typed REST tools.
- **Cartwright purple rebrand** — the glassmorphic purple first-run canvas, a matching
  `built-with-cartwright`, and the engine identity surfaces repointed to the `--cw-brand` token
  (customer palettes untouched).
- **Annotate** — the in-place "edit on the live storefront" experience (glass panel, anchored
  popover) with edit-hooks in the flagship designs + direct field (price) editing.
- **Ember** premium design pack + **dentist / restaurant / fitness** voice presets.
- **Storefront SEO** — visible breadcrumbs (category / PLP / services / blog, flag-gated) plus
  Blog / Service / BreadcrumbList JSON-LD.

### 🛠 Fixed — the new-customer hardening wave
- **Website-mode rendered as a webshop** — a website-corporate scaffold seeded
  `BrandingSettings.ecommerceEnabled = true` (the schema default), so the corporate site shipped a
  cart, product search, shipping badges and a demo banner. The seed now persists
  `brand.ecommerceEnabled`, `getBrand()` forces website-mode false at render (#285), and the
  AI-bootstrap write path no longer hardcodes shop-on (#317).
- **First-login redirect loop** between `/admin/setup` and `/admin/konto` (#276).
- **Footer linked about/faq to slugs the template never seeded** → 404s (#277).
- **Danish leaks** in the seed banner, first-run post-splash, and account UI on English
  scaffolds (#278 / #284 / #281); `og:locale` now derived from the route locale (#274).
- **Single-locale shops shipped a broken language switcher** — a `locales:["en"]` site rendered a
  🇩🇰 DA toggle that routed `/da` → 404; the switcher now hides at one locale and maps options
  from `brand.locales` (#317).
- **Duplicate industry options** in the setup wizard, from the legacy `saas`/`eyewear` alias
  slugs (#317).
- **AI tool surface** — error bodies now carry `ok:false` across every shape, `features.set` error
  copy is English, and `llms.txt` reports the actual locale rather than the country code (#317).
- **a11y** — the first-run copy button no longer puts `aria-live` on the interactive control (#317).

## v0.36.3 — 2026-06-12

**The AI-agent hardening release.** Three external AIs (Claude, Codex, Gemini) each built a
site on the engine and surfaced real gaps; a full parity/security audit surfaced more. All
fixed at the source — the scaffold is now self-prompting, AI-build-friendly, and the
critical security drift is closed.

### 🔒 Security
- **Auth-gated three admin AI endpoints** (`/api/admin/translate`, `/api/admin/generate-logo`,
  the phone plugin handler) that were internet-reachable with no session check — an open,
  billed LLM proxy on every deployed shop. New shared `requireAdminApi()` (401 for APIs) +
  a regression test that walks every `app/api/admin/**` route and asserts a guard, so the
  class can't recur (25 routes covered).
- **Security headers** in `next.config.ts`: nosniff, X-Frame-Options, Referrer-Policy, HSTS,
  Permissions-Policy; CSP shipped Report-Only.
- **Login brute-force throttle** (`lib/auth/login-throttle.ts`): per-IP + per-email
  token-bucket before any bcrypt work, timing-oracle-safe.

### ✨ Added
- **DESIGN.md** — the self-prompting design playbook every agent file points to: the three
  build paths, the built-ins inventory (ThreeHero + 9 scenes, svg-items, the verified GSAP
  recipe), 8 taste rules, the screenshot self-verification rule, and the engine-overlay
  design hooks. GEMINI.md upgraded from pointers to full content.
- **Blank Canvas motion examples** (`designs/blank/examples/*.example`) + stable
  `data-cw-*` design hooks on every floating engine overlay (AI assistant, phone, voice,
  consent, welcome, sticky-ATC).

### 🛠 Fixed
- `pnpm typecheck` script the docs promised; `threeD.scene` typed as `SceneId` (no more
  stale 4-scene union); ThreeHero `className` merges with the full-bleed default instead of
  replacing it; any next/font name resolves in tests; an ESLint rule catches event handlers
  in Server Components before runtime.

## v0.36.2 — 2026-06-11

**Patch: en-only scaffolds typecheck.**

### 🛠 Fixed
- `proxy.ts` hardcoded a `"da" | "en"` locale cast, so the English-only scaffolds that
  `create-cartwright` now produces failed `tsc` out of the box (found live by a
  customer's AI, which had to patch the template before building). The cast is now
  derived from the configured `routing.locales`.

## v0.36.1 — 2026-06-11

**Patch+: the Blank Canvas and the mockup-first flow.**

### ✨ Added
- **Blank Canvas** (`designs/blank/`) — a registered, deliberately bare design made to be
  rewritten: ask your AI to "build a completely new design — header, footer, every page,
  totally unique" by editing one folder, while cart, checkout, admin and the AI tools keep
  working underneath. The documented path lives in AGENTS.md + the project briefing.
- **Mockup-first flow** — `mockup.set` / `mockup.clear` tools: an AI generates a raw HTML
  mockup in seconds and publishes it as the homepage takeover for instant customer
  approval, then implements it for real (Blank Canvas or governed sections) and clears
  the scaffold. Reuses the vibe sanitize policy; confirm-gated + audited.
- AGENTS.md now mirrors "Your first 10 minutes" + "Motion & animation" so Codex/Gemini/
  Copilot agents find the fast paths, not only Claude.

### 🛠 Fixed
- The first-run welcome canvas now also retires when a design is chosen via
  `brand.designSlug` in config (the documented Blank Canvas activation).

## v0.36.0 — 2026-06-11

**The first impression: a welcome canvas + English-first scaffolds.** A fresh scaffold's
very first render is now a designed moment instead of leftover template copy.

### ✨ Added
- **First-run Welcome Canvas** (flag `firstRunWelcome`, default off — scaffolds enable it):
  an untouched site greets you with "Your site was just born." over a palette-adaptive
  aurora (3D Live Canvas when enabled) and three paths — a copy-paste AI quick-start
  prompt, the guided `/admin/setup` wizard, and a signature-motif gallery of the design
  catalogue. It vanishes permanently the moment the site becomes yours (setup completed,
  a look chosen, copy applied, a vibe page published or a product created).
- **Config-driven footer owner line** — the "owned and operated by" line now reads
  `legalName` + `footer.ownerUrl`/`githubUrl` from brand config (translatable via
  `Footer.ownedBy`) instead of a hardcoded string.

### 🛠 Fixed
- Paired `create-cartwright` release scaffolds **English-first** (`/en`, en-only locales),
  replaces the leftover studio hero copy with "Welcome to {your store}", and seeds
  `setupComplete: false` so the first admin login actually opens the setup wizard.

## v0.35.1 — 2026-06-11

**Patch: dark mode fixed completely.** A fresh scaffold no longer half-flips when the
visitor's OS is in dark mode.

### 🛠 Fixed
- **Dark-mode split-brain** — Tailwind's `dark:` utilities followed the OS media query
  while the theme-token overrides followed the `.dark` class, so OS-dark rendered a
  broken half-flip (dark chrome/backgrounds on a light design). One switch now: a
  `@custom-variant dark` ties every `dark:` utility to the same `.dark` class
  (guard-tested). The admin is decoupled and ALWAYS the light Polaris skin — the theme
  toggle no longer lives in the admin top bar, and toggling can never restyle the
  storefront from the backend. Storefront dark returns later as a per-design opt-in.
- **Phone widget palette** — the floating call bubble was hardcoded blue; it now follows
  the shop's accent like every other storefront element.
- `package.json` now declares the MIT license (matches the LICENSE file from v0.35.0).

## v0.35.0 — 2026-06-11

**The Light release: the build engine AIs reach for.** Cartwright is now told — and built —
around one sentence: *a real site with design, database and backend, live in minutes.*
`create-cartwright` defaults to a lean **light** profile (website-mode, 8 curated designs,
pruned agent-marketplace/UCP/WebMCP/hoptify; `--profile full` keeps everything), heavy
modules are packaged as **plugins** under a new `cartwright-plugin-v1` contract, the Mixer
became a complete composition system (chrome parts, downloadable/installable compositions,
streamed magic builds, design-adaptive store pages), and the AI onboarding path is measured:
a cold agent goes scaffold → designed, verified homepage in **99 seconds**. Everything
additive or flag-gated — canaries byte-identical throughout.

### ✨ Added
- **Mixer 2.0** — the complete composition system:
  - **Chrome registry** (`lib/builder/chrome-registry.tsx` + client-safe catalogue):
    headers/footers are selectable parts — 14 design chromes + 4 neutral cw-* parts,
    two-sided mixability, persisted in `BrandingSettings.chromeJson` (run `pnpm db:push`).
  - **Compositions** (`cartwright-composition-v1`, `lib/compositions/`) — a whole look
    (skin + palette + voice + chrome + scene + homepage layout) as a downloadable,
    uploadable artifact: admin export/import with dry-run preview, atomic
    `composition.apply` tool, every Look in the manifest ships its installable composition.
  - **Magic speed** — section generation parallelized (~5× faster), SSE-streamed
    progressive build UI, and an instant 0-LLM preset path (`lib/magic/presets.ts`).
  - **`designSurfaces`** (default-off) — cart, checkout, account, blog, services and more
    adopt the active design's tokens, display font and chrome; flag-off byte-identical.
- **Plugin system** (`cartwright-plugin-v1`, `lib/plugins/spec.ts` + `plugins/`) — optional
  engine modules as manifest-declared in-repo plugins with install state and an admin API
  (`/api/admin/plugins`). First five extracted with zero-breakage re-export shims:
  **phone-widget, wishlist, blog, reviews, three-scenes** (the entire Live Canvas 3D
  system — the engine's heaviest client dep — is now optional). Manifest v3 carries the
  plugin catalogue.
- **Scaffold profiles** — `npx create-cartwright --profile light|full` with **light as the
  default** (pairs with the `create-cartwright` release that bumps to this tag); the
  scaffolder records its profile in `.cartwright/profile.json`.
- **AI onboarding, measured** — the scaffold briefing leads with **"Your first 10
  minutes"**: a verified terminal-only path (boot → agent API key → `magic.compose_look`
  via `POST /api/v1/tools` → curl-verify) measured at 99 s cold. Plus a **"Motion &
  animation"** section: native motion presets, three.js scenes, and a live-verified GSAP
  recipe (SSR-safe, reduced-motion-guarded; gsap stays out of engine deps).
- **Agentic discovery in `llms.txt`** — flag-gated links to `/api/acp/feed` + ACP checkout
  sessions (`features.acp`), `/api/agent-card` (`features.a2a`), and the always-on
  `/.well-known/mcp.json`; new byte-identity test pins flag-off output.
- **Service + BreadcrumbList JSON-LD** on website-mode service pages.
- **LICENSE** — the engine is now formally **MIT-licensed**.

### 🛠 Fixed
- **Light scaffolds boot** — the chrome registry kept a parallel static import list of
  design chrome modules, so a pruned (light) scaffold 500'd on every page with "Module not
  found". Both catalogue and registry now derive from the design registry
  (`getDesign(slug).siteChrome`), and a new deep-import guard test makes the regression
  class impossible to reintroduce.
- Docs truth pass — removed false `webVitals`/`passkeys` claims (features that never
  existed) and several phantom file references from every agent-rules file and the
  cartwright-guidance skill; docs now lead with the product sentence.
- Removed two proven-orphan dependencies (`@ai-sdk/openai`, `ts-node`).

## v0.34.0 — 2026-06-10

**The metamorphosis release: FABLE, Stillwater & the unified design language.** Built the
day Claude Fable 5 launched — and largely *by* it. Two new flagship designs, a library of
hand-crafted (and animated) SVG items that doubles as the cross-design ornament language,
unique signature-motif chrome for every premium pack, a public Skin × Voice **Mixer**, and
the infrastructure that makes catalog growth ~free: one manifest as the single source of
truth for every catalog, plus a committed capture pipeline for previews. Additive and
default-off end to end (canaries byte-identical).

### ✨ Added
- **FABLE** (`designs/fable/`) — the website-mode flagship: an instanced 3D **butterflies**
  Live-Canvas scene (procedural wings, GPU-only motion, pointer scatter, reading-clearing),
  Fraunces display hero, scroll-cinema metamorphosis timeline, safeguards story, own chrome.
  Ships with a matching `fable` Voice preset.
- **Stillwater** (`designs/stillwater/`) — calm-enterprise flagship: generative layered SVG
  ridgelines across four times of day, the palette-reactive `waves` scene as hero water,
  oversized metrics, night panel with incident timeline, own ridgeline chrome.
- **SVG item library** (`components/svg-items/`) — 21 hand-authored palette-adaptive pieces
  (marks · dividers · illustrations), **9 of them CSS-animated** (reduced-motion safe),
  all installable via the public component registry (`svg-<slug>`).
- **Unified design language** (`docs/design-language.md`) — the three shared languages
  (tokens · signature motifs · motion) + `DESIGN_MOTIFS`: every premium pack now carries a
  signature SVG motif used in its chrome, dividers and gallery badge.
- **Own chrome for all premium packs** — apex, studio, engineered, nocturne, meridian,
  editorial-ink, brutalist and jungle join halo/flux/drive/aerospace/fable/stillwater with
  design-matched signature-motif headers/footers via `DesignPack.siteChrome` (webshop packs
  keep cart/account nav).
- **marketplace-manifest v2** — the manifest now carries *every* catalog (designs incl.
  motif + chrome flags, voices, scenes, svg-items **with server-rendered markup**, elements,
  looks); cartwright.app derives all its galleries from it, so drift is impossible.
- **Gallery capture pipeline** (`pnpm capture:gallery`) — deterministic preview jpg/video
  capture for any design (error-page detection, video trim, self-managed dev server).
- **`registryStats`** (flag, default-off) — anonymous per-item install counting on the
  component registry + `/admin/registry-stats` readout (run `pnpm db:push` before enabling).
- **Admin Page Mixer studio** (`/admin/mixer`, behind `mixerPreviewEnabled`) — read-only
  Skin × Voice preview. The public Mixer lives on cartwright.app/mixer.

### 🛠 Fixed
- `getActiveDesign()` now honours the `brand.designSlug` **config** override (config > DB >
  inference) — design-owned chrome previously didn't engage for config-selected designs.
- Registry-wide tool-scope invariants + website-mode identity-lock + Stripe subscription
  sync state-machine regression tests (suite now 1127 tests).
- `picsum.photos` added to image remotePatterns (dev seed data uses it).

## v0.33.0 — 2026-06-09

**The Page Mixer + the super-pro flagship.** Content and design are orthogonal in
Cartwright, so this release lets a shop mix a vertical **Voice** (børnehave, tømrer, café…)
with any palette-adaptive **Skin** and compose the page from swappable **Parts** — plus a
much deeper premium-design layer: a design now owns *every* page (not just the homepage),
four breakthrough Pro elements, per-design webshop overrides, and **Apex**, a flagship
super-pro storefront that composes all of it on one palette-adaptive page. Additive and
default-off end to end (canaries byte-identical).

### ✨ Added

- **Voice layer (genome).** The homepage hero + section copy now resolves through the
  Resolvable Genome (`readField`), so a Voice can re-tone the page; `studio` + three website
  skins are Voice-aware, and the value-prop **and** feature *cards* are voiceable via genome
  list fields. Gated by `genomeResolve`; every anchor **is** the current `brand.website.*`
  value, so flag-off ⇒ byte-identical.
- **Vertical / Voice presets.** A new `verticals/` registry where a Voice carries the full
  Vibe — identity anchors + genome copy overrides + palette + 3D scene (+ optional seed/
  layout) — applied idempotently from `/admin/verticals`. Flag `verticalPresets` (default-off).
- **The Page Mixer (`mixer-preview`).** A gated route that renders any **Skin × Voice**
  composition in the real storefront layout — resolved ephemerally in-memory (no DB write),
  always `noindex`, double-gated behind `mixerPreviewEnabled` (default-off ⇒ canaries 404 it).
- **Parts catalog.** Three premium Page-Mixer parts + a `mixable` flag on `DesignPack` so the
  mixer greys out Parts on non-palette-adaptive skins.
- **3D scenes.** Three new palette-reactive Live-Canvas scenes (`waves`, `orb`, `gridflow`) +
  a scene-preview surface (all inherit WebGL2 / reduced-motion / save-data gating).
- **Premium designs.** Four recognizable-aesthetic packs — `aerospace` (cinematic deep-tech),
  `halo` (minimal product luxury), `flux` (vibrant gradient SaaS), `drive` (full-bleed
  automotive) — plus `jungle`, a friendly organic palette-adaptive website skin.
- **Shell model — a design owns every page.** `DesignPack.siteChrome` (Shell/Header/Footer) +
  `pages` (contact / info / 404) seams let a premium design span the whole site, not just the
  homepage; `halo`/`flux`/`drive` converted, with info (FAQ/legal) + 404 templates for all four.
  Default-safe: an undefined seam falls back to the shared chrome / default body.
- **Pro Parts (breakthrough elements).** A "Build your own" **configurator** (live preview +
  live price, pure `:has(:checked)`, no JS), a **scroll-cinema** story (`animation-timeline:
  view()`), a 3D **product showroom**, and a before/after **compare slider** — surfaced as
  builder Parts, gated by `cartwrightPlus` (honor-system).
- **Webshop overrides.** `DesignPack.webshop` = a bespoke `productCard` + `pdpLayout` per
  design (threaded via `ProductGrid card?` and a PDP wrapper); `halo` ships both.
- **Apex — the flagship super-pro design.** One palette-adaptive webshop homepage that composes
  every breakthrough above (3D aurora hero, 3D showroom, value props, configurator, featured
  grid, scroll-cinema, CTA). Via `applyPaletteAsTheme`, every section **and** every Pro element
  re-skins to the brand palette — a $100k-feeling storefront the day it ships.

### 🛡️ Safety

- Everything is additive and default-off: the new flags (`verticalPresets`,
  `mixerPreviewEnabled`) default false, every new design is registered but **active nowhere**,
  and genome anchors equal the existing copy — so `scripts/smoke-canaries.sh` stays 3/3
  byte-identical. CSS-only Pro elements sit behind `@supports` + `prefers-reduced-motion`;
  the 3D scenes self-gate on WebGL2 / reduced-motion / save-data.

## v0.32.0 — 2026-06-07

**Design Slaraffenland.** The premium-design marketplace foundation: a growing catalogue of
code-built `DesignPack`s, reusable three.js, design.md import **and** export/share, an
agent-buildable design path, and a companion `/designs` marketplace on cartwright.app.

### ✨ Added

- **Five new code-built premium designs** — `engineered` (dark-luxe agency, three.js GLSL
  aurora hero) as the flagship, plus `editorial-ink`, `brutalist`, `nocturne` (+3D) and
  `meridian`. Each a real `designs/<slug>/` pack, English-first, locked theme, three.js opt-in.
- **Reusable three.js aurora scene + `DesignHero`** — the `engineered` GLSL hero registered as
  a shared Live-Canvas scene so any pack gets a palette-driven 3D hero (inherits WebGL2 /
  reduced-motion / save-data gating).
- **design.md export / download + share** — the missing half of design import: a serializer
  + `GET /api/admin/designs/<slug>/export` + a download button, so a shop can share a design.
- **Prompt → design pipeline** (AI, admin + key-gated) and a **`cartwright-premium-design`
  skill** teaching agents to hand-build bespoke premium packs.
- **cartwright.app `/designs` marketplace** — a Figma-Community-style gallery (search + filter,
  per-design detail pages, build prompts, a prompt library).

### 🐛 Fixed

- **Design selection + identity + layout precedence.** Website-mode now respects
  `settings.designSlug`; a shared `resolveStoreIdentity()` keeps the homepage and the admin
  design picker in agreement; `info` pages prefer `layoutJson` over stale `vibeHtml`.

## v0.31.0 — 2026-06-07

**Motion & effects — pages that feel alive.** A flag-gated layer of modern CSS
scroll-driven animations (compositor-thread, no JS jank), an animated palette-adaptive
aurora gradient + glassmorphism, and an optional per-section motion vocabulary the Magic
Builder can assign. Default-off and canary-safe end to end.

### ✨ Added

- **Motion foundation.** New `motionEffects` flag (default-off) + a `motionPreset` block in
  `brand.config.ts` (`subtle` | `bold` | `off`). `lib/motion.ts` resolves a `data-motion`
  attribute on `<html>`; `themes/motion.css` holds the preset CSS-vars, scroll-driven reveal
  classes, the animated aurora gradient (`.motion-aurora-bg`) and a glassmorphism utility.
  Off ⇒ `data-motion="off"` ⇒ no rule matches ⇒ byte-identical render.
- **Per-section effect vocabulary.** A governed `z.enum` (`lib/builder/effects.ts`):
  `fade-up | fade | zoom-in | slide-left | slide-right | parallax | none`. Carried on the
  section node (replaces the unused `variant` field); `PageSections` wraps a section in the
  matching `.motion-*` class only when set. The Magic Builder planner can now assign a
  tasteful, whitelisted effect per section.
- **Animated Aurora hero.** `aurora-site` wraps its hero in `.motion-aurora-bg` and mounts
  the existing `<ThreeHero>` (self-gating WebGL) behind it as an opt-in behind the `threeD`
  flag; the gradient is the guaranteed fallback. `aurora-shop` keeps `HeroVideo` unchanged.

### 🛡️ Safety

- Every animation is on the compositor (transform/opacity only), inside
  `@media (prefers-reduced-motion: no-preference)`, and scroll-driven effects sit behind
  `@supports ((animation-timeline: view()) and (animation-range: entry))` — no polyfill;
  unsupported browsers stay static. All effect rules scoped to `:root[data-motion=…]` so the
  default-off state is byte-identical (`scripts/smoke-canaries.sh` unaffected).

## v0.30.0 — 2026-06-07

**Agent-optimized design.** The design system (Aurora + Magic Builder + the section
catalogue) is now optimised for AI agents end to end: they can **read** it (registry +
schemas), **build** with it (the Magic Builder tools), and **cite** it (Schema.org JSON-LD).

### ✨ Added

- **Section JSON-LD.** Pages built from `Page.layoutJson` (Magic Builder / Aurora) now emit
  Schema.org structured data server-side so AI search engines (ChatGPT, Perplexity, Google AI
  Overviews) can cite them: `faq` → FAQPage, `howItWorks` → HowTo, `galleryGrid` → ImageGallery,
  `testimonials` → Review, `pricingTable` → ItemList (`lib/builder/section-jsonld.ts`, via the
  injection-safe `JsonLd` component). Honest by construction — **no fabricated ratings or
  prices**. Additive; only emitted on pages that have a section layout.
- **Installable component registry.** With `componentRegistryShipsSource` on, `/api/registry`
  serves real, MIT-licensed, `npx shadcn add`-able TSX for a curated, self-contained subset of
  section atoms (source embedded at build time via `pnpm build:registry`). The always-on
  `componentRegistryPublic` continues to serve the prop JSON-Schema contract for every section.
- **Section-vocabulary skill** (`.claude/skills/section-vocabulary/SKILL.md`): teaches external
  AI agents the 20 whitelisted section types + the data-not-code doctrine *before* they generate,
  so their output is valid and on-brand (ships to scaffolded shops).

### 🎨 Changed

- **Discovery surfaces** advertise the new capabilities: `llms.txt` gains a component-registry +
  "agentic design" (Magic Builder) block, and `/.well-known/mcp.json` points agents at the
  registry — both flag-gated so nothing links a disabled endpoint.

## v0.29.0 — 2026-06-07

**Agentic design.** Two big additions: a prompt-driven page builder, and a new flagship default
design system — built on one shared set of section atoms, so the two are the same components.

### ✨ Added

- **Magic Builder** (`magicBuilder`, default-off, admin-only). Describe a page in plain language
  and it builds itself — section by section, live in the Visual Builder preview. The inverse of
  code-generators: the prompt can only emit a *plan of whitelisted section keys*, each filled by
  AI with **Zod-validated props** (the model never picks a tag, colour or font). Output lives as
  governed **data** — audited and one-click revertible via `pages.set_layout` — never code on disk.
  A free-form v0 "bespoke section" path is an admin-only, quota-limited escape hatch, hardened with
  a real allowlist HTML sanitizer (DOMPurify) at ingest.
- **~20-section curated catalogue** (`designs/studio/sections/*`): hero/media-hero/split-hero,
  value-props, feature-grid/-split, how-it-works, stat-band, testimonials, quote, pricing-table,
  FAQ (native `<details>`), logo-cloud, gallery, banner-CTA, newsletter — client-safe, a11y, and
  shared by both the builder and the new default design.
- **Public component registry** (`componentRegistryPublic`, default-off): a read-only,
  shadcn-compatible `/api/registry` exposing each section's prop JSON-Schema so external AI agents
  and IDEs can target Cartwright sections. Plus `magic.plan_page` / `magic.generate_page` MCP tools
  (read-only; publishing stays on the confirm-gated `pages.set_layout`).
- **Aurora — the new flagship default design** for both website (`aurora-site`) and webshop
  (`aurora-shop`), composed from the section catalogue. **Palette-adaptive:** one design renders
  every brand in its own colours (`applyPaletteAsTheme` maps your `themeJson` palette onto both the
  chrome and the section tokens at runtime), which also retires the old "every webshop looks the
  same" default. Free; the previous packs (saas-dark, studio, webshop-classic, …) remain selectable.

### 🎨 Changed

- **Design chrome** (light vs dark header/footer) now follows the active design's `chrome` hint
  (`getActiveDesign().chrome`), not the old `industryTemplate === "saas"` heuristic — so the light
  Aurora default gets light chrome. Default shops infer Aurora via `inferDesignFromIndustry`.
- **Identity flags consolidated:** `mode` is the single source of truth; `ecommerceEnabled` /
  `features.webshop` derive from it, read through new `lib/mode.ts` predicates with an invariant
  test. Behaviour-preserving (the website-mode `ecommerceEnabled=false` guard is untouched).

### 📚 Docs

- `docs/design-system.md`: the authoritative site-vs-shop / palette / chrome reference.

> **Heads-up for existing shops:** Aurora is the new *default* design. A scaffolded shop that
> didn't pin a `designSlug` will adopt Aurora (in its own palette) on regenerate/upgrade. Pin a
> specific design in the setup wizard to keep the previous look.

## v0.28.0 — 2026-06-07

**A modern admin.** The `/admin` backend is re-skinned to a clean, light Shopify-Polaris look
— white cards, fine borders, dense tables, a sticky top bar with global search and an account
menu — while keeping the Cartwright-navy accent. The storefront and all canaries are untouched;
the new look is fully scoped to the admin.

### 🎨 Changed

- **Light admin theme.** New `themes/admin.css` applies a scoped `[data-admin-skin]` token
  override (light + dark) so every admin surface re-skins to the Polaris palette **without
  renaming a single `--color-sol-*` token** and with zero storefront impact. The scope lives on
  the admin layout root only — the storefront never carries it.
- **Admin UI primitives.** New `components/admin/ui/` (`AdminButton`, `AdminCard`, `AdminBadge`,
  `AdminPageHeader`, the `AdminTable` set, the `AdminField` set, `EmptyState`) is the single
  import source for admin pages. All ~58 admin pages were migrated to them.
- **New top bar + light sidebar.** Sticky admin top bar with a global ⌘K search launcher, an
  account menu, and a mobile slide-in nav drawer (native Popover API). The sidebar is now light
  with a navy active state; `AdminTabs` became Polaris underline tabs.

### Notes

- Admin-internal change: the storefront and the 3 canaries render identically. No new env var or
  feature flag — the redesign is wholesale and default-on for the admin only.

## v0.27.1 — 2026-06-07

**First-run DB setup, corrected.** Patches two issues in v0.27.0's `db:setup` so the primary path
actually works and the libSQL fallback is a true safety net rather than the default.

### 🐛 Fixed

- **Removed `prisma db push --skip-generate`.** Prisma 7.8's `db push` rejects that flag (`unknown or
  unexpected option`), so v0.27.0's primary path failed on the bad flag on *every* install and the libSQL
  fallback ran unconditionally — masking the mistake. With the flag gone, `prisma db push` succeeds on the
  happy path and the fallback engages only when the genuine, **intermittent** schema-engine error actually
  hits. `db:setup` now also **fails loudly** on a usage / unknown-flag error instead of hiding it behind
  the fallback, so this class of bug can't slip through again.
- **`db:setup` is now Postgres-aware.** The libSQL fallback is SQLite/Turso-only. For a Postgres target
  (`DATABASE_DRIVER=postgres` or a `postgres://` URL), `db:setup` runs `prisma db push` and surfaces its
  error directly (no libSQL fallback), then seeds a fresh DB via the pg adapter. The SQLite/Turso path is
  unchanged.
- **New `pnpm admin:reset` — recover a lost or drifted admin password.** Resets **only** the admin
  password (keeps all data — products, orders, settings) and rewrites `.admin-credentials` so the file
  always matches the DB. Use it (never a raw `UPDATE User SET passwordHash …`) when you're locked out: a
  raw DB edit leaves `.admin-credentials` stale and makes a perfectly working login look broken. Honors
  `ADMIN_PASSWORD` for a chosen password, else generates a strong one. Works on SQLite/Turso/Postgres.

## v0.27.0 — 2026-06-07

**Bulletproof first-run database setup.** A flaky Prisma 7.8 schema-engine error could block a brand-new
shop before its first login — and "just run it again" did not reliably help. First-run is now
deterministic: it routes around the flake so onboarding can't get stuck. Engine-only; no schema, flag, or
storefront change.

### 🐛 Fixed

- **First-run `Schema engine error:` no longer blocks onboarding.** On some machines (seen on macOS arm64 +
  Node 24) `prisma db push` intermittently dies with a **blank `Schema engine error:`** during its
  connect-and-apply step — repeatedly, not "transiently", so re-running could keep failing (no schema → no
  seed → no `.admin-credentials` → no admin login). New **`pnpm db:setup`** tries `prisma db push`, and on
  failure falls back to generating the schema SQL via `migrate diff --from-empty` (which never opens a DB
  connection, so it stays reliable) and applying it with the **libSQL client** directly — bypassing the
  flaky schema engine — then seeds. It only seeds a **fresh** DB, so re-running never wipes data; the
  fallback DDL is `IF NOT EXISTS` so a partial run recovers. `create-cartwright` now uses `db:setup` during
  scaffold, so a new shop reaches admin login with no manual recovery.

### 📝 Notes

- The misleading "blank Schema engine error → just run it again, it's transient" guidance is replaced
  everywhere (AGENTS.md, `.claude/CLAUDE.md`, README, `docs/getting-started.md`, and the Cursor / Copilot /
  Gemini / Windsurf agent-rules) with `db:setup`, and the docs no longer promise `.admin-credentials`
  exists if setup failed. Added `.nvmrc` (Node 22 LTS), since Node 24 appears to aggravate the flake. The
  manual escape hatches `prisma db push` / `prisma db seed` still work. Test the fallback explicitly with
  `CARTWRIGHT_FORCE_DB_FALLBACK=1 pnpm db:setup`.

## v0.26.0 — 2026-06-07

**Admin backend, restructured: a grouped, scannable information architecture.** The admin sidebar had
grown feature-by-feature into a flat ~40-item list with no hierarchy. It is now a calm, grouped nav
that follows familiar commerce-admin conventions, keeps daily tasks on top, and gives AI/agentic
features a permanent home — plus a durable rule for where future features land so it never sprawls
again. Admin-only and **default-equivalent**: no schema change, no new flags, no storefront impact, so
every shop and all three canaries behave identically per mode.

### ✨ New

- **Grouped, collapsible admin sidebar.** Two pinned items (Dashboard, Leads) above seven ordered
  groups — Salg · Indhold · Intelligens · Marketing & kontakt · Forbindelser · Udseende · System &
  opsætning. Native `<details>/<summary>` sections with lucide group icons; the group holding the
  active route auto-expands; open/closed state persists in `localStorage` (read via
  `useSyncExternalStore`, so no hydration mismatch). A group auto-hides when all its items are
  flag-gated off — website-mode shops (no commerce) see the whole **Salg** group disappear. Nav is now
  a single source of truth in `lib/admin/nav.ts` (typed groups + `filterNav`/`isRouteActive`),
  unit-tested across website / webshop / agent-marketplace modes.
- **Hub consolidation.** Google **Sheets / Drive / Docs-import** are folded into **Integrationer** as
  flag-gated connector cards under a new "Import & sync" tab (the Shopify "Apps" pattern) — the routes
  are unchanged and gain a back-link. **Designs** is folded into **Indstillinger**, now a tabbed
  "Udseende & indstillinger" (Branding / Tema / Designs); `/admin/designs` redirects there so bookmarks
  and CLI doc-links keep working.

### 🧹 Housekeeping

- Merged the duplicate `/admin/henvendelser` into `/admin/leads` (both queried the same `Lead` table,
  porting the richer AI-triage view) and removed the `/admin/setup-guide` redirect-stub. A shared
  `AdminTabs` shell replaces the integrations-only `SetupTabs`.

### 📝 Notes

- The placement rule lives in `lib/admin/nav.ts`: a new feature slots by "what is the feature's
  *product*?" — model output/inference → **Intelligens**; money/catalog/fulfillment → **Salg** (and
  gate it with `ecommerceEnabled`); human-edited content → **Indhold**; outside-system plumbing →
  **Forbindelser**; and so on. The Intelligens group is the designated growth bucket, so future
  AI/agentic tooling has one obvious home and the menu stays calm.

## v0.25.0 — 2026-06-06

**Agentic commerce, completed: buy-in-ChatGPT + agent identity-linking + in-browser tools.** Three
agentic-web surfaces move from scaffold to wired — all **default-off** and **canary-safe**, so an
existing shop (and each of the three canaries) is byte-identical until it opts in. The external
preconditions for ACP go-live (Stripe Shared Payment Token access + ChatGPT merchant onboarding) are
not code, so the payment path ships **code-ready but inert** behind an env gate.

### ✨ New

- **ACP delegated-payment completion** (`acp` flag + env `ACP_PAYMENT_COMPLETION`, default-off). The
  last missing piece of the ACP checkout lifecycle: `/api/acp/v1/checkout_sessions/[id]/complete` now
  charges via a Stripe **Shared Payment Token** (off-session PaymentIntent) and builds the order from
  the ACP session line items (not the cart cookie), with idempotency replay and refund-on-failure.
  Wired + unit-tested behind the env gate; responds 501 (inert) until Stripe SPT + ChatGPT merchant
  access are connected. See `docs/HUL-C-ACP-COMPLETION.md`.
- **UCP identity-linking — OAuth 2.0 server** (`ucpIdentityLinking`, runtime, default-off). Implements
  `dev.ucp.common.identity_linking`: a full Authorization Code + PKCE (S256-only) authorization server
  so an agentic platform can act on a user's behalf across merchants. Ships RFC 8414 + RFC 9728
  metadata, RFC 7591 dynamic registration (public clients), `/oauth/{authorize,token,revoke}`, a
  consent screen, and a sample protected resource (`/api/ucp/orders`, scope
  `dev.ucp.shopping.order:read`). `/.well-known/ucp` advertises the spec-shaped capability when on.
  Only token/code **hashes** are stored. See `docs/HUL-D-UCP-IDENTITY-LINKING.md`.
- **WebMCP (in-browser agent tools)** (`webMcp`, runtime, default-off). Exposes storefront actions —
  `search_products`, `get_cart` (read-only), `add_to_cart`, and a same-origin `navigate` — as
  browser-native tools to in-browser AI agents via `document.modelContext` (fallback to the deprecated
  `navigator.modelContext`). Server-emits a Chrome 149 origin-trial token when set, plus a flag-gated
  `/<locale>/webmcp-check` page. Experimental (Chrome-only origin trial, W3C draft) — kept off the
  canary mosaic.

### 🔒 Security

- The UCP OAuth server was hardened after an adversarial security-review pass: refresh-token **reuse
  detection** (reusing a rotated refresh revokes the whole token family — RFC 9700 §4.14.2),
  **client-bound revocation**, a **canonical issuer** derived from `AUTH_URL`/`brand.url` (never the
  `Host`/`X-Forwarded-Host` header — blocks issuer-spoofing + discovery-metadata cache-poisoning), and
  a **least-privilege registration default** (`order:read`, never `order:manage`) plus an
  "unverified third-party app" warning on the consent screen.

### 🛠 Migration

- Run **`pnpm db:push`** before enabling `ucpIdentityLinking` — three additive tables (`OAuthClient`,
  `OAuthAuthCode`, `OAuthToken`). Set **`AUTH_URL`** to your canonical origin so the OAuth issuer +
  discovery metadata are correct. ACP completion needs no schema change (`Order.channel` /
  `Order.acpSessionId` already exist).

### 📝 Notes

- Everything is default-off and inert until opted in. The public discovery surfaces (`llms.txt`,
  `/built-with-cartwright`, `/.well-known/ucp`) read the feature manifest, so they advertise the new
  capabilities only once a shop turns the flag on — no manual sync needed.
- ACP go-live is gated on external access (Stripe Shared Payment Token + ChatGPT merchant onboarding);
  promote the `ACP_PAYMENT_COMPLETION` env gate to an `acpPaymentCompletion` flag once verified.
- An external "agentic-web" tech report was fact-checked claim-by-claim against primary sources in
  `docs/AGENTIC-WEB-VERIFICATION-2026.md` (it separates real technology from fabrications like a
  "Delegate Payment API" or just-bash env-var masking); the real, shipped items are the three above.

## v0.24.2 — 2026-06-06 (shipped in v0.25.0)

**Admin dark-mode contrast fixes.** A full 33-page admin audit found form/tool surfaces that hardcoded
fixed Tailwind colors (`bg-white`, `bg-gray-*`, literal hex) instead of the theme-flipping `sol-*` tokens
— so they stayed light (unreadable) in dark mode. The `--color-sol-*` variables flip under `:root.dark`
(themes/*.css); these surfaces now use them and adapt to both themes like the dashboard does.

### 🐛 Fixed

- **Dark-mode readability** across the flagged admin pages: integrations (provider cards, selects, "Test
  forbindelse"), vibe-sandbox (editor/panel cards + tabs), konto (password card + inputs), telefon
  (tabs + "Seneste Opkald"), redirects / shipping / leverandører / design-import (inputs + selects),
  genome (inputs), indstillinger ("Themes & AI Design", logo panel, locale select). Cards →
  `bg-sol-sand`, inputs/inner → `bg-sol-cream`, text → `text-sol-ink` / `text-sol-muted`. Intentional
  dark surfaces (the Vibe live-preview frame + code editors), status banners, and opacity overlays are
  unchanged.
- **`/admin/hoptify` 404 from the menu.** The sidebar always listed "Hop off Shopify 🐸", but the page
  `notFound()`s unless `brand.features.hoptify` is on. The nav item is now gated on that flag (matching
  the page), so it only appears when it works.
- **Storefront no longer leaks OS dark mode.** Dark mode is an admin-only feature (`ThemeToggle` lives
  in `app/admin/layout.tsx`), but the root `ThemeProvider` ran `defaultTheme="system" enableSystem` —
  so a visitor whose OS was dark got `.dark` site-wide, leaving brand storefronts a half-dark mess
  (some tokens flipped, hardcoded `bg-white` cards didn't, per-shop `sol-*` stayed light) across ~27
  routes. The provider is now `defaultTheme="light" enableSystem={false}`: storefronts always render
  their designed brand palette (Teloz stays dark via the `isSaas` header path, independent of `.dark`),
  while the admin `ThemeToggle` still flips explicitly. One-file root-cause fix; no theme CSS or
  per-component edits. (Residual: an owner who toggles admin-dark still previews their own storefront
  dark on that one browser — toggle back to light; full per-brand storefront dark mode is deferred.)

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
