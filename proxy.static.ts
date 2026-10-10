import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { canonicalTrustRedirect } from "./lib/canonical-public-routes";
import { isAssetExempt } from "./lib/locale-exempt";
import {
  LOCALE_ALTERNATION,
  LOCALE_SEGMENT_RE,
  applyTrailingSlash,
  trailingSlashRedirect,
  withoutLocalePrefix,
} from "./lib/urls";
import { brand } from "./brand.config";

/**
 * B3 static seam variant — the `site`-profile middleware (site-profile
 * program). The materializer copies this file over `proxy.ts` when the
 * auth/db modules are not in the profile; NOTHING imports it in the shipped
 * engine (byte-identical until then).
 *
 * A site profile has no sessions to gate, no /admin or /account surfaces, no
 * Redis-backed rate limits or admin redirects — so the middleware collapses
 * to (1) the legacy Danish-slug 301s (bookmarks/SEO keep migrating on every
 * profile), (2) the locale-less asset routes every profile serves from the
 * root (`/icon`, `/og` — the same `isAssetExempt` the db variant routes by),
 * and (3) next-intl locale routing from brand.config.
 */

const LEGACY_SLUG_MAP: Record<string, string> = {
  "konto/ordrer": "account/orders",
  "konto/login": "account/login",
  "konto/opret": "account/signup",
  "konto": "account",
  "kategori": "category",
  "produkt": "product",
  "kontakt": "contact",
  "anmeld": "review",
  "ordre": "order",
  "kurv": "cart",
};

const LEGACY_SLUG_RE = new RegExp(
  `^(\\/(?:${LOCALE_ALTERNATION}))?\\/(konto\\/(?:ordrer|login|opret)|konto|kurv|ordre|kategori|produkt|kontakt|anmeld)(\\/.*|$)`,
);

const intlMiddleware = createMiddleware(routing);

/**
 * URL2: the same trailing-slash handling as the db variant — next.config.ts
 * turns Next's own slash redirect off when `urls.trailingSlash` is a literal
 * `true`, and this proxy adds the slash to pages instead (never to `/api`,
 * `/icon`, `/og` or a file). Off, no response changes.
 */
const TRAILING_SLASH =
  (brand as { urls?: { trailingSlash?: unknown } | null }).urls?.trailingSlash === true;
/** URL1: under `urls.localePrefix: "never"` the proxy's redirects drop the locale too (one hop). */
const withRoutingSlash = (path: string) => {
  const routed = routing.localePrefix === "never" ? withoutLocalePrefix(path) : path;
  return TRAILING_SLASH ? applyTrailingSlash(routed) : routed;
};

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const acceptsMarkdown = req.headers.get("accept")
    ?.split(",")
    .some((value) => value.trim().split(";")[0] === "text/markdown");
  const isHomepage = pathname === "/" || (routing.locales as readonly string[]).some(
    (locale) => pathname === `/${locale}` || pathname === `/${locale}/`,
  );
  if ((req.method === "GET" || req.method === "HEAD") && acceptsMarkdown && isHomepage) {
    const target = new URL("/llms.txt", req.url);
    const requestedLocale = (routing.locales as readonly string[]).find(
      (locale) => pathname === `/${locale}` || pathname === `/${locale}/`,
    );
    if (requestedLocale) target.searchParams.set("locale", requestedLocale);
    const requestHeaders = new Headers(req.headers);
    if (requestedLocale) {
      requestHeaders.set("x-cartwright-markdown-locale", requestedLocale);
    }
    return NextResponse.rewrite(target, {
      request: { headers: requestHeaders },
    });
  }

  const canonicalTrustPath = canonicalTrustRedirect(
    routing.localePrefix === "never" && !LOCALE_SEGMENT_RE.test(pathname)
      ? `/${routing.defaultLocale}${pathname}`
      : pathname,
    routing.locales as readonly string[],
  );
  if (canonicalTrustPath) {
    const url = new URL(withRoutingSlash(canonicalTrustPath), req.nextUrl.origin);
    url.search = req.nextUrl.search;
    return NextResponse.redirect(url, 301);
  }

  const legacyMatch = pathname.match(LEGACY_SLUG_RE);
  if (legacyMatch) {
    const [, localePrefix = "", legacy, rest = ""] = legacyMatch;
    const replacement = LEGACY_SLUG_MAP[legacy];
    if (replacement) {
      const url = new URL(
        withRoutingSlash(`${localePrefix}/${replacement}${rest}${req.nextUrl.search}`),
        req.nextUrl.origin,
      );
      return NextResponse.redirect(url, 301);
    }
  }

  // `/icon` (generated favicon) and `/og?title=…` (the per-page share card)
  // are root routes in every profile; `lib/og.ts:pageOg()` puts `/og?title=…`
  // in every page's `og:image`. Without this branch the locale rewrite sends
  // them to `/en/og` → 404, so a site scaffold's share cards were dead links
  // (found by a docs falsifier on a real 2.9.2 scaffold).
  if (pathname.startsWith("/api") || isAssetExempt(pathname)) {
    return NextResponse.next();
  }

  const response = intlMiddleware(req);
  // URL1: the same permanent `/<locale>/x` -> `/x` as the db variant under "never".
  const intlTarget = response.headers.get("location");
  if (routing.localePrefix === "never" && response.status === 307 && intlTarget) {
    return NextResponse.redirect(new URL(intlTarget, req.url), 308);
  }
  if (TRAILING_SLASH && !response.headers.has("location")) {
    const target = trailingSlashRedirect(pathname, req.method);
    if (target) {
      // Set on a copy of the request URL, never parsed from a string: a
      // `//host` path cannot become another origin this way.
      const url = new URL(req.nextUrl.href);
      url.pathname = target;
      return NextResponse.redirect(url, 308);
    }
  }
  return response;
}

export const config = {
  // Same exclusions as the db variant — static assets + extension-less Next
  // metadata routes must never get a locale prefix.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|apple-icon|.*\\..*|hero).*)",
  ],
};
