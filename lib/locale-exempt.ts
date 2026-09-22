/**
 * Top-level route prefixes that must NOT get a locale prepended.
 *
 * Everything the proxy hands to next-intl's middleware is rewritten to
 * `/<locale><path>`. That is correct for the storefront, which lives under
 * `app/[locale]/` — but `app/` also holds routes deliberately placed OUTSIDE
 * that segment, and for those the rewrite points at a path with no route:
 * `307 → /<locale><path>` → `404`, on every verb, for every visitor.
 *
 * Three kinds of route escape that rewrite:
 *  1. an explicit branch in `proxy.ts` that returns before the intl middleware
 *     runs (`/api`, `/admin`, and the prefixes below);
 *  2. a dot anywhere in the path — the matcher's `.*\..*` clause excludes it,
 *     which is why `/.well-known/*`, `/llms.txt`, `/blog/feed.xml`,
 *     `/feed/google.xml`, `/robots.txt`, `/sitemap.xml` and
 *     `/manifest.webmanifest` are reachable;
 *  3. a name listed in the matcher by hand (`opengraph-image`, `twitter-image`,
 *     `apple-icon`, `favicon.ico`, `hero`).
 *
 * A locale-less route with none of the three has nothing holding it up. Each of
 * these was measured as `307` → `404` on live production — demo.cartwright.app,
 * teloz-showcase.vercel.app and solbrillen-dk-teloz1.vercel.app — before this
 * file existed:
 *
 *  - `/oauth/*` — the UCP identity-linking endpoints (RFC 8414 authorize/token/
 *    revoke/register). `.well-known/oauth-authorization-server` publishes these
 *    exact URLs. The unreachability was flag-independent; the advertising was
 *    not — that document 404s when `ucpIdentityLinking` is off, and it is off
 *    on `main` and on solbrillen, so no canary ever published the four dead
 *    URLs. A shop with the flag on did. Reachability was only half of it: the
 *    `callbackUrl` that `/oauth/authorize` hands to login was silently dropped
 *    by `components/LoginForm.tsx`, so the authorization-code flow could only
 *    ever complete for an already-signed-in user. That second gap predated this
 *    file and was untouched by it — routing was never what broke it — and is
 *    now closed: the login form resolves `?callbackUrl=` through
 *    `lib/safe-path.ts` and propagates it across the password, GitHub, Google
 *    and magic-link paths.
 *  - `/icon` — the generated favicon (`app/icon.tsx`). Every page ships
 *    `<link rel="icon" href="/icon?…">`, `app/layout.tsx:63` puts
 *    `${brand.url}/icon` in the site-wide Organization JSON-LD as `logo`, and
 *    `app/manifest.ts:22` lists it as the PWA icon. `app/icon.tsx` replaced the
 *    static `favicon.ico`, and `/favicon.ico` answers with HTML, so no canary
 *    had a working icon at all.
 *  - `/og` — the per-page share card. `lib/og.ts:pageOg()` sets `og:image` to
 *    `/og?title=…` for contact, priser, services, changelog, info and
 *    built-with-cartwright, so those shipped a dead card URL to every social
 *    and AI crawler that resolved it. (The two `[slug]` pages pass their hero
 *    image to `pageOg` when the entity has one; those cards were fine.)
 *
 * `/manifest` is the fourth shadowed route and is deliberately NOT listed here
 * — see KNOWN_SHADOWED in tests/unit/locale-exempt-routes.test.ts for why.
 *
 * That test derives the locale-less route paths from `app/` — route folders AND
 * the root metadata conventions, since `/icon` is one of the latter — and fails
 * on any that is covered by none of the three escapes and not named as a known
 * exception.
 */

/**
 * Protocol endpoints: exempt from the locale rewrite AND from merchant
 * redirects — the same pair of exemptions `/api` and `/admin` already get.
 *
 * The redirect half is load-bearing, not tidiness. `lib/redirects/match.ts:26`
 * passes an `http(s)://` destination through verbatim (and `store.ts:53` lets
 * one be saved), and `proxy.ts` appends the original query to it, so a redirect
 * rule on `/oauth/authorize` would carry the client's `client_id`, `state`,
 * `redirect_uri` and `code_challenge` to another origin. This was NOT inert
 * before the paths answered: on `main` the redirect lookup sits above the intl
 * rewrite, so a rule on `/oauth/authorize` returned a 301 and the endpoint's
 * own 404 never entered into it. The hole was live, and the protocol/asset
 * split below is what closes it — do not read this as a precaution against a
 * future problem and delete the branch.
 */
export const PROTOCOL_EXEMPT_PREFIXES = ["/oauth"] as const;

/**
 * Asset routes: exempt from the locale rewrite only. They stay redirect-
 * eligible, which is the behaviour they have today, and retargeting an icon or
 * a share-card renderer hands nothing to another origin.
 */
export const ASSET_EXEMPT_PREFIXES = ["/icon", "/og"] as const;

export const LOCALE_EXEMPT_PREFIXES = [
  ...PROTOCOL_EXEMPT_PREFIXES,
  ...ASSET_EXEMPT_PREFIXES,
] as const;

/**
 * Exact match or a `/`-delimited descendant — never a plain `startsWith`, which
 * would also swallow the sibling names `/manifesto`, `/ogle` and `/iconography`.
 */
function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Skips the locale rewrite AND the merchant-redirect lookup. */
export function isProtocolExempt(pathname: string): boolean {
  return matchesPrefix(pathname, PROTOCOL_EXEMPT_PREFIXES);
}

/** Skips the locale rewrite only. */
export function isAssetExempt(pathname: string): boolean {
  return matchesPrefix(pathname, ASSET_EXEMPT_PREFIXES);
}

/** Skips the locale rewrite, by either route. */
export function isLocaleExempt(pathname: string): boolean {
  return matchesPrefix(pathname, LOCALE_EXEMPT_PREFIXES);
}
