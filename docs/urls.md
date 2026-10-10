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
profile's sitemap as well. A link the engine still writes by hand rather than through this helper
(the header's `/da/contact`, for one) reaches its page through the 308 — one extra hop on that
click.

### `localePrefix` — the language in front of the path

`"always"`, the default, puts the locale in front of every path (`/da/product/x`). `"never"`
drops it (`/product/x`) and is accepted **only on a shop with exactly one locale** — on a
multi-language shop two languages would compete for the same path, so the config refuses it
with a message that names the fix. A single-language shop is **not** switched automatically:
it keeps `/da/` until you opt out here.

## What changes, and when

With the block absent, nothing changes: every link is the same string it was.

The engine's own product and category links now go through the helper — the product page's
canonical and breadcrumbs, the category page, the product card, the footer's category list, the
cart, the sitemap, the catalogue feed, `/pricing.md`, the search API, IndexNow and the review
pages. So do the shipped design packs' homepages and product cards; the one link left out is
the coffee pack's brew-recommendation tool, whose links follow the page's own path until routing
reads the options. `trailingSlash` steers routing as well (see above). `localePrefix` does
**not** yet: it starts steering routing in a later release, and a stored permalink is *served* at
its address only after that. Until then, setting `localePrefix` or `permalinks` changes the links
but not the addresses the shop answers — so leave those two unset on a live shop. `permalinks` has
no effect on the engine's own links yet: every call site hands the helper the slug alone, so a
product is linked at one address everywhere, and the stored permalink is threaded through all of
them at once in the release that also serves it.

A stored permalink is the path **without** the language prefix (`/hegn/komposithegn/x/`, never
`/da/hegn/…`): the prefix is added the same way as for every other link. A permalink with a `.`
or `..` segment is ignored and the product is linked at its pattern, because a browser would
resolve it to a different page than the one the link names.

A misconfigured block (for example `localePrefix: "never"` on a two-locale shop) fails at the
first link built, with a clear error — never silently.
