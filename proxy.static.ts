import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * B3 static seam variant — the `site`-profile middleware (site-profile
 * program, `internal-docs/site-profile-ultraplan.md` §5). The materializer
 * copies this file over `proxy.ts` when the auth/db modules are not in the
 * profile; NOTHING imports it in the shipped engine (byte-identical until
 * then).
 *
 * A site profile has no sessions to gate, no /admin or /account surfaces, no
 * Redis-backed rate limits or admin redirects — so the middleware collapses
 * to (1) the legacy Danish-slug 301s (bookmarks/SEO keep migrating on every
 * profile) and (2) next-intl locale routing from brand.config.
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

const LEGACY_SLUG_RE =
  /^(\/(?:da|en))?\/(konto\/(?:ordrer|login|opret)|konto|kurv|ordre|kategori|produkt|kontakt|anmeld)(\/.*|$)/;

const intlMiddleware = createMiddleware(routing);

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const legacyMatch = pathname.match(LEGACY_SLUG_RE);
  if (legacyMatch) {
    const [, localePrefix = "", legacy, rest = ""] = legacyMatch;
    const replacement = LEGACY_SLUG_MAP[legacy];
    if (replacement) {
      const url = new URL(
        `${localePrefix}/${replacement}${rest}${req.nextUrl.search}`,
        req.nextUrl.origin,
      );
      return NextResponse.redirect(url, 301);
    }
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  return intlMiddleware(req);
}

export const config = {
  // Same exclusions as the db variant — static assets + extension-less Next
  // metadata routes must never get a locale prefix.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|apple-icon|.*\\..*|hero).*)",
  ],
};
