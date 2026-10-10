# URLs — the shape of your public links

Every public address a Cartwright shop links to — a product, a category, a CMS page, a blog
post — is built in one place, `lib/urls.ts`, from three options in `brand.config.ts`:

```ts
urls: {
  permalinks: false,      // an imported permalink wins over the pattern
  trailingSlash: false,   // every path ends in "/"
  localePrefix: "always", // "always" | "never" — the locale in front of every path
},
```

**All three are off by default**, and the defaults produce exactly the URLs a shop has today:

| Link | Default |
|---|---|
| Product | `/da/product/<slug>` |
| Category | `/da/category/<slug>` |
| CMS page | `/da/info/<slug>` (`about`, `contact`, `privacy` keep their own routes) |
| Blog post | `/da/blog/<slug>` |

You only need this block when the shop must keep the addresses of a site it replaces — for
example a WordPress/WooCommerce shop whose products live at `/fences/composite/x/` and whose
customers, search results and printed material still point there.

## The options

### `permalinks` — keep an imported address

Products and categories can carry a `permalink`, filled in by the migration import from the
old site's own URL. With `permalinks: true`, a link to such an entity uses that stored address
instead of `/product/<slug>`; an entity without one keeps the pattern. With the default `false`,
a stored permalink is ignored entirely, so turning the import on never changes a link by itself.

A permalink is a local address. If one was stored as a full URL, only its path, query and
fragment are kept — `https://old-shop.dk/a/b/` links as `/da/a/b` with the defaults — so a link
built here never points at another host. Backslashes in the path are read as `/` and tabs or line
breaks are dropped first, the way a browser reads them, so `/\evil.com/x` cannot slip out either.

### `trailingSlash` — WordPress-style paths

`true` makes every path end in `/` (`/product/x/`), the way WordPress addresses do. `false`, the
default, keeps paths bare (`/product/x`). The root stays `/` either way, and a path whose last
segment has a dot never gets a slash: a file (`/catalogue.pdf`), but also a slug such as
`v1.2-notes`, which is linked, redirected to and listed without one.

The option steers routing too. With `true`, a request for a storefront page without its slash
(`GET /da/product/x`) is answered with a permanent redirect (308) to `/da/product/x/`; with the
slash it is served directly. `proxy.ts` does this, not Next: `next.config.ts` gives Next
`trailingSlash: true` (so the canonical and hreflang URLs Next writes into a page carry the
slash, and so does the locale redirect) together with
`skipTrailingSlashRedirect: true`, because Next's own redirect has no exception for `/api`.
The rule applies only to `GET` and `HEAD` — a form or server action is answered where it was
sent — and never to a path with a dot in it, which the proxy does not see. A link built here is
therefore never redirected.

These paths are **not** redirected and answer with or without the slash, exactly as before:
`/api/*`, `/admin/*`, `/oauth/*`, `/icon`, `/og`, `/.well-known/*` and files (`/robots.txt`,
`/sitemap.xml`, `/llms.txt`). So nothing registered elsewhere has to change: the Vercel Cron
paths in `vercel.json` (Vercel Cron does not follow redirects), the Stripe webhook at
`/api/webhook/stripe`, the MCP, A2A and ACP endpoints, and the OAuth callbacks. Keep each
provider's callback URL exactly as Auth.js writes it — `/api/auth/callback/google`, no slash;
Google compares it character for character. A `--profile site` scaffold gets the same rule, the
same exceptions and the same one-hop redirects from its own proxy; it only has fewer of these
routes (no `/admin`, `/oauth`, crons, webhooks or merchant redirects).

Merchant redirects (`/admin/redirects`) match a source with or without its slash, and a relative
destination is given the slash, so `/old-page` and `/old-page/` both land in one hop. The engine's
own redirects do the same: `/da/om-os`, the trust-page aliases (`/da/info/om-os` → `/da/about/`)
and the legacy Danish paths (`/da/kurv` → `/da/cart/`). A path without a locale (`/contact`) gets
one redirect, to `/<default locale>/contact/`. The sitemap's entries carry the slash, in the site
profile's sitemap as well. The links the engine used to write by hand — the footer (including its
trust badges), the cookie banner, the announcement bar, the visible breadcrumbs, the recovery
links on both 404s — go through the helper too, so they carry the slash. A link still written by
hand (see the list under `localePrefix` below) reaches its page through the 308 — one extra hop on
that click.

### `localePrefix` — the language in front of the path

`"always"`, the default, puts the locale in front of every path (`/da/product/x`). `"never"`
drops it (`/product/x`) and is accepted **only on a shop with exactly one locale** — on a
multi-language shop two languages would compete for the same path, so the config refuses it
with a message that names the fix. A single-language shop is **not** switched automatically:
it keeps `/da/` until you opt out here.

```ts
locales: ["da"] as const,
defaultLocale: "da",
urls: { localePrefix: "never" },
```

The option steers routing too. With `"never"`, `i18n/routing.ts` gives next-intl
`localePrefix: "never"`, and the shop answers like this:

| Request | Answer |
|---|---|
| `/`, `/contact`, `/product/x`, `/account/login` | the page, directly (200) |
| `/da`, `/da/contact?ref=x` | permanent redirect (308) to `/`, `/contact?ref=x` |
| `/da/info/om-os`, `/info/om-os`, `/om-os` | 301/308 to `/about`, one hop |
| `/da/kurv`, `/kurv` (legacy Danish paths) | 301 to `/cart` |
| `/api/*`, `/admin/*`, `/oauth/*`, `/icon`, `/og`, files | untouched — `/admin` still sends a visitor without a session to `/account/login` |

next-intl decides the route and sends the prefixed address to the unprefixed one; it does so
with a temporary 307, and `proxy.ts` (and the site profile's `proxy.static.ts`) re-sends that one
redirect as a permanent 308, because with a single locale the answer can never change. A merchant
redirect to a relative destination lands on the unprefixed page, and so does every redirect the
proxy issues itself. The canonical and `og:url` the engine writes (home, contact, info,
developers, catalogue, service, blog, product and category pages), both sitemaps, the page links
in `llms.txt` and the JSON-LD addresses carry no prefix, and hreflang is off, as on any
single-language shop.

It composes with `trailingSlash`: `/da/contact` goes to `/contact/` in one hop, and a sitemap entry
is `/contact/`.

The build refuses `"never"` on a shop with more than one locale (`next.config.ts` throws, naming
the fix), because routing reads the option when it loads and cannot fail there. Treat `"never"`
as a lasting choice: browsers keep a 308 for good, so if the shop later goes back to `"always"`
(to add a second language), a visitor whose browser remembers `/da/x` → `/x` is sent in a circle
until that cache is cleared.

Not yet: the storefront still writes these links by hand with the prefix — found with
``git grep -n '`/${locale}' -- components app designs plugins``, the admin left out. Each reaches
its page through the one 308 — and, with `trailingSlash`, takes the same 308 for the slash — until
it adopts the helper:

- `components/chrome-parts/` — every link in `CenteredHeader`, `MinimalHeader`, `MegaFooter` and
  `SlimFooter`.
- The headers and footers of the design packs that bring their own (`designs/<pack>/chrome.tsx`:
  aerospace, agentic-showcase, apex, blank, brutalist, drive, editorial-ink, ember, engineered,
  fable, flux, halo, jungle, meridian, nocturne, stillwater, studio). Such a pack's chrome
  replaces the engine footer, so on Solbrillen (`apex`) the footer's links are the pack's, not the
  converted ones. Also the packs' own 404 pages (aerospace, drive, flux, halo).
- The fixed-route links on pack homepages — `/produkter`, `/contact`, `/about`, `/services`,
  `/info/…` and the like — in agentic-showcase, apex, atelier, aurora-shop, corporate-baseline, crema, ember,
  fable, hoptify, northern-coffee, saas-dark, stack, stillwater, webshop-bold, webshop-classic,
  webshop-editorial and webshop-minimal; and the product-page crumb in `crema/webshop/PdpLayout`
  and `halo/PdpLayout`. (Their product and category links go through the helper.)
- The catalogue: its filter links (`components/CatalogFilters.tsx`), the empty grid's "Browse all
  products" (`components/ProductGrid.tsx`) and the catalogue WebMCP tool's navigation
  (`components/webmcp/PlpWebMcpTools.tsx`).
- `components/AIStylistPanel.tsx` (cart, checkout, order and returns links) and
  `components/LoginForm.tsx` (forgot password).
- `app/[locale]/services/page.tsx` (the link to each service) and `app/[locale]/order/[id]/page.tsx`
  ("Continue shopping").
- `plugins/blog/pages/BlogIndexPage.tsx` (the post links), `plugins/reviews/pages/` (the
  order-review page's link and sign-in redirect, the review page's home link) and
  `plugins/wishlist/` (the wishlist page's link and sign-in redirect, the button's sign-in
  redirect).
- The links in e-mails (the review request, for one, always points at `/da/review/…`).

## What changes, and when

With the block absent, nothing changes: every link is the same string it was.

The engine's own product and category links now go through the helper — the product page's
canonical and breadcrumbs, the category page, the product card, the footer's category list, the
cart, the sitemap, the catalogue feed, `/pricing.md`, the search API, IndexNow and the review
pages. So do the product and category links on the shipped design packs' homepages and product
cards; the one left out is the coffee pack's brew-recommendation tool, whose links follow the
page's own path. A fixed route with no entity behind it (`/contact`, `/info/terms`, `/produkter`,
the locale home) goes through `localeHref(path, locale)`: the footer's links and its trust badges
(which also render on the product, category and checkout pages and three webshop homepages), the
cookie banner's policy link, the announcement bar's audit-feed link, the visible breadcrumbs and
their BreadcrumbList steps, and the recovery links on both 404s (`app/[locale]/not-found.tsx` and
the catch-all `app/[locale]/[...missing]/route.ts`) — the rest are listed under `localePrefix`
above. `trailingSlash` and `localePrefix` steer routing as well (see above). A stored permalink is *served* at its address
only in a later release; until then, setting `permalinks` changes the links but not the addresses
the shop answers — so leave it unset on a live shop. `permalinks` has
no effect on the engine's own links yet: every call site hands the helper the slug alone, so a
product is linked at one address everywhere, and the stored permalink is threaded through all of
them at once in the release that also serves it.

A stored permalink is the path **without** the language prefix (`/hegn/komposithegn/x/`, never
`/da/hegn/…`): the prefix is added the same way as for every other link. A permalink with a `.`
or `..` segment is ignored and the product is linked at its pattern, because a browser would
resolve it to a different page than the one the link names.

A misconfigured block (for example `localePrefix: "never"` on a two-locale shop) fails at the
first link built, with a clear error — never silently — and that one combination fails the build
already.
