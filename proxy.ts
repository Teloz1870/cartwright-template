import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { LOCALE_RE, matchRedirect } from '@/lib/redirects/match';
import { loadRedirectMap } from '@/lib/redirects/load';
import { isAssetExempt, isProtocolExempt } from '@/lib/locale-exempt';
import { canonicalTrustRedirect } from '@/lib/canonical-public-routes';
import { trustedClientIp } from '@/lib/trusted-client-ip';
import { LOCALE_ALTERNATION, PERMALINK_RESERVED_RE, applyTrailingSlash, trailingSlashRedirect, withoutLocalePrefix } from '@/lib/urls';
import { loadPermalinkMap, resolvePermalinkRewrite } from '@/lib/permalinks/resolve-request';
import { brand } from '@/brand.config';

const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? Redis.fromEnv()
  : null;

const { auth } = NextAuth(authConfig);

/**
 * URL2: `brand.urls.trailingSlash`. next.config.ts turns Next's own slash
 * redirect off (it would 308 `/api` too), so this proxy adds the slash to
 * storefront pages itself — see the end of the handler — and every redirect it
 * issues carries the slash already, so it lands in one hop, not 301 → 308.
 * Only a literal `true` counts (next.config.ts reads it the same way); off,
 * nothing below changes a single response.
 */
const REDIRECT_OPTIONS = {
  trailingSlash: (brand as { urls?: { trailingSlash?: unknown } | null }).urls?.trailingSlash === true,
};
/**
 * URL1: under `urls.localePrefix: "never"` a redirect the proxy builds from an
 * engine path (`/da/about`) drops the locale first, so it too lands in one hop.
 */
/**
 * URL5-b: serve stored permalinks (lib/permalinks/resolve-request.ts). Read as
 * a literal `true`, like the slash option above, and not through
 * `resolveUrlConfig()`: that one throws on a bad block, and this runs at import.
 */
const PERMALINKS_ON = (brand as { urls?: { permalinks?: unknown } | null }).urls?.permalinks === true;

const withRoutingSlash = (path: string) => {
  const routed = routing.localePrefix === "never" ? withoutLocalePrefix(path) : path;
  return REDIRECT_OPTIONS.trailingSlash ? applyTrailingSlash(routed) : routed;
};

const GLOBAL_API_RATE_LIMIT = 20;
const GLOBAL_API_RATE_WINDOW_SECONDS = 10;

const ratelimit = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) 
  ? new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(
        GLOBAL_API_RATE_LIMIT,
        `${GLOBAL_API_RATE_WINDOW_SECONDS} s`,
      ),
      analytics: true,
    }) 
  : null;

/**
 * Delt Upstash sliding-window-tjek. Returnerer et 429-svar når kalderen er over
 * budget, ellers null. Uden UPSTASH_*-env (default-scaffoldet) er `ratelimit`
 * null ⇒ altid null ⇒ uændret adfærd. Bucket-nøglen er et argument, så /api
 * beholder præcis sin hidtidige nøgle (`global_api_ratelimit_<ip>`) og nye
 * kaldere ikke deler dens vindue.
 */
async function rateLimitedResponse(
  req: NextRequest,
  bucket: string,
): Promise<NextResponse | null> {
  if (!ratelimit) return null;
  const ip = trustedClientIp(req.headers);
  try {
    const result = await ratelimit.limit(`${bucket}_${ip}`);
    const resetAfterSec = Math.max(
      1,
      Math.ceil((result.reset - Date.now()) / 1000),
    );
    const policyName = bucket === "oauth_ratelimit" ? "oauth" : "global-api";
    const headers = {
      "RateLimit-Policy": `"${policyName}";q=${result.limit};w=${GLOBAL_API_RATE_WINDOW_SECONDS}`,
      "RateLimit": `"${policyName}";r=${Math.max(0, result.remaining)};t=${resetAfterSec}`,
      "RateLimit-Limit": String(result.limit),
      "RateLimit-Remaining": String(Math.max(0, result.remaining)),
      "RateLimit-Reset": String(resetAfterSec),
    };
    if (!result.success) {
      const detail = "The per-IP API request limit has been exceeded.";
      return NextResponse.json(
        {
          type: "https://cartwright.app/problems/rate_limit_exceeded",
          title: "Too Many Requests",
          status: 429,
          detail,
          instance: req.nextUrl.pathname,
          code: "rate_limit_exceeded",
          resolution: `Retry after ${resetAfterSec} seconds.`,
          ok: false,
          error: detail,
        },
        {
          status: 429,
          headers: {
            "Content-Type": "application/problem+json",
            ...headers,
            "Retry-After": String(resetAfterSec),
          },
        },
      );
    }
    return NextResponse.next({ headers });
  } catch {
    // Do not serialize/log provider errors: they may contain Redis details.
    console.error("[Middleware] Distributed rate-limit check failed.");
  }
  return null;
}

/**
 * Task D: helper der annoterer requesten med x-pathname så server-components
 * (specifikt app/admin/layout.tsx) kan læse den via headers() og redirecte til
 * /admin/setup hvis wizard skal vises. Standard App Router-pattern.
 *
 * KRITISK: vi SKAL kopiere original-headers fra request og kun ADDE x-pathname
 * — ellers stripper vi Cookie-headeren med session-token og server-components
 * ser session === null. Den bug forårsagede at /admin → /account/login-redirect.
 */
function withPathnameHeader(req: NextRequest, pathname: string) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/**
 * Legacy Danish-slug → English-slug 301 redirects.
 *
 * PR #16 followup: storefront route folders were renamed from Danish (/kurv,
 * /konto, /kontakt, /produkt, /kategori, /ordre, /anmeld) to English (/cart,
 * /account, /contact, /product, /category, /order, /review). Existing customer
 * bookmarks, Google index entries, and email links must continue working —
 * permanent 301 redirects fire at the edge before next-intl's locale handling
 * so SEO + UX migrate cleanly.
 *
 * Map is sorted longest-first inside the regex so /konto/ordrer matches
 * before bare /konto. Status 301 = permanent, browsers + crawlers cache it.
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
/**
 * `/admin` and `/account` as a whole segment, with or without a configured
 * locale (`brand.locales`) — the shape of PERMALINK_RESERVED_RE. A path that
 * only begins with the name (`/en/administration`, `/en/accounting`) or has it
 * deeper down (`/x/account/y`) is a storefront path, not a gated page.
 */
const ADMIN_SEGMENT_RE = new RegExp(`^(?:\\/(?:${LOCALE_ALTERNATION}))?\\/admin(?:\\/|$)`);
const ACCOUNT_SEGMENT_RE = new RegExp(`^(?:\\/(?:${LOCALE_ALTERNATION}))?\\/account(?:\\/|$)`);
const LOCALE_ACCOUNT_ROOT_RE = new RegExp(`^\\/(${LOCALE_ALTERNATION})\\/account\\/?$`);
/**
 * The account pages a signed-out visitor has to reach: sign in, sign up, and
 * both halves of a password reset — the form that mails the link and the page
 * that link opens (`lib/auth/password-reset.ts`). A whole segment, with or
 * without a configured locale and a trailing slash, so `/account/login-history`
 * is not public by accident.
 */
const PUBLIC_AUTH_PAGE_RE = new RegExp(
  `^(?:\\/(?:${LOCALE_ALTERNATION}))?\\/account\\/(?:login|signup|forgot-password|reset-password)\\/?$`,
);
/**
 * `/api` and `/admin` as a whole segment, without a locale — the scope the
 * redirect lookup and the API branch have always had. `/apiary` and
 * `/administration` are storefront paths.
 */
const isApiPath = (pathname: string) => pathname === "/api" || pathname.startsWith("/api/");
const isAdminPath = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");

/**
 * next-intl's middleware as the storefront runs it: the default locale an
 * admin set (cached in Redis, when it is configured) over brand.config's, and
 * routing's own `localeCookie` when it sets one. The intl step at the end of
 * the handler runs it, and so does the URL5-b permalink rewrite, for the
 * locale cookie only.
 */
async function storefrontIntlMiddleware() {
  let defaultLocale = routing.defaultLocale;
  if (redis) {
    try {
      const cachedLocale = await redis.get<string>('cartwright_default_locale');
      if (cachedLocale && (routing.locales as readonly string[]).includes(cachedLocale)) {
        // Derive the union from the configured locales — a hardcoded "da" | "en"
        // breaks typechecking the moment a scaffold ships a different locale set
        // (the en-only overlay did exactly that; found live by a customer's AI).
        defaultLocale = cachedLocale as (typeof routing.locales)[number];
      }
    } catch (e) {
      console.warn("[Proxy Middleware] Failed to get default locale from Redis:", e);
    }
  }

  return createMiddleware({
    locales: routing.locales,
    defaultLocale: defaultLocale,
    // URL1: absent under "always", so next-intl gets the config it had before.
    ...(routing.localePrefix ? { localePrefix: routing.localePrefix } : {}),
    // Absent on the shipped routing, so next-intl keeps its default cookie.
    ...(routing.localeCookie !== undefined ? { localeCookie: routing.localeCookie } : {}),
  });
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  console.log("[Proxy Middleware] Path:", pathname, "Full URL:", req.nextUrl.toString());

  // HTTP content negotiation for agent readers. This is deliberately limited
  // to the two homepage URL shapes; ordinary browsers and every other route
  // keep their existing HTML/routing semantics.
  const acceptsMarkdown = req.headers.get("accept")
    ?.split(",")
    .some((value) => value.trim().split(";")[0] === "text/markdown");
  const isHomepage = pathname === "/" || (routing.locales as readonly string[]).some(
    (locale) => pathname === `/${locale}` || pathname === `/${locale}/`,
  );
  // ?mode=agent er den eksplicitte URL-form af samme forhandling — en agent
  // (eller et menneske der tester) kan bede om agent-visningen uden headers.
  const wantsAgentView = req.nextUrl.searchParams.get("mode") === "agent";
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    (acceptsMarkdown || wantsAgentView) &&
    isHomepage
  ) {
    const target = new URL("/llms.txt", req.url);
    // Homepage-form-markør: llms-routen sætter YAML-frontmatter på (og kun på)
    // dokumentet i denne form — bare /llms.txt forbliver uændret.
    target.searchParams.set("md", "1");
    const requestedLocale = (routing.locales as readonly string[]).find(
      (locale) => pathname === `/${locale}` || pathname === `/${locale}/`,
    );
    if (requestedLocale) target.searchParams.set("locale", requestedLocale);
    const requestHeaders = new Headers(req.headers);
    if (requestedLocale) {
      // Next's dev/proxy pipeline can omit rewrite query parameters from the
      // Route Handler request. Carry the locale in an internal request header
      // as well; the public response still varies only on Accept.
      requestHeaders.set("x-cartwright-markdown-locale", requestedLocale);
    }
    return NextResponse.rewrite(target, {
      request: { headers: requestHeaders },
    });
  }

  // ── URL5-b: a stored permalink answers at itself ───────────────────────────
  // Only with `urls.permalinks` on (off, the map is never loaded). FIRST of the
  // path rules, so a migrated address is served even where an older rule would
  // have redirected it. /api, /admin and /account (whole segments, with or
  // without a locale) are never a permalink: the admin and account gates below
  // must not be shadowed by catalogue data.
  let permalinkWithoutLocale = false;
  if (PERMALINKS_ON && !PERMALINK_RESERVED_RE.test(pathname)) {
    const served = resolvePermalinkRewrite(pathname, await loadPermalinkMap(), {
      locales: routing.locales as readonly string[],
      defaultLocale: routing.defaultLocale,
      localePrefix: routing.localePrefix === "never" ? "never" : undefined,
    });
    if (served && "unprefixed" in served) {
      // An old inbound link without the locale: skip the redirect rules below
      // and let next-intl send it to the reader's locale form (served next).
      permalinkWithoutLocale = true;
    } else if (served) {
      // The slash rule applies here as everywhere else: one address per page,
      // never both `/x` and `/x/` answering 200 (URL2).
      const slashed = trailingSlashRedirect(pathname, req.method);
      if (slashed) {
        // Set on a copy of the request URL, never parsed from a string: a
        // `//host` path cannot become another origin this way.
        const target = new URL(req.nextUrl.href);
        target.pathname = slashed;
        return NextResponse.redirect(target, 308);
      }
      const url = new URL(served.path, req.nextUrl.origin);
      // The query rides along (`?attribute_pa_farve=…`, a variant pick).
      url.search = req.nextUrl.search;
      // The rewrite skips next-intl's middleware, which is what tells the
      // server components the locale (next-intl reads this request header) —
      // without it an /en permalink would render in the default language.
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("X-NEXT-INTL-LOCALE", served.locale);
      const rewritten = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      // The locale cookie, exactly as next-intl sets it for the page it serves
      // (`middleware/syncCookie.js`: an outdated cookie, or none yet while the
      // browser's language differs; document requests only). Its middleware
      // reads the same locale from this path as the rewrite (the prefix, or
      // the shop's one locale under "never"), so its cookie is taken over and
      // the rest of its answer dropped.
      const intl = (await storefrontIntlMiddleware())(req);
      for (const cookie of intl.cookies.getAll()) rewritten.cookies.set(cookie);
      return rewritten;
    }
  }

  // Under "never" the trust aliases are asked for without a locale (`/info/om-os`).
  const canonicalTrustPath = canonicalTrustRedirect(
    routing.localePrefix === "never" && !LOCALE_RE.test(pathname)
      ? `/${routing.defaultLocale}${pathname}`
      : pathname,
    routing.locales as readonly string[],
  );
  if (canonicalTrustPath && !permalinkWithoutLocale) {
    const url = new URL(withRoutingSlash(canonicalTrustPath), req.nextUrl.origin);
    url.search = req.nextUrl.search;
    return NextResponse.redirect(url, 301);
  }

  // ── Legacy Danish-slug 301-redirects ───────────────────────────────────────
  // Run FIRST so /da/kurv/foo → 301 /da/cart/foo before any other logic fires.
  const legacyMatch = permalinkWithoutLocale ? null : pathname.match(LEGACY_SLUG_RE);
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

  // ── /oauth/* (protocol endpoints) ──────────────────────────────────────────
  // Returns BEFORE the redirect lookup below, which is how it gets the same
  // exemption /api and /admin have. (Those two are excluded by that lookup's
  // own guard a few lines down, not by sitting above it — same effect, and
  // this branch has to return early anyway for the second reason.) Three
  // things ride on this:
  //  · returning here keeps next-intl from rewriting to /<locale>/oauth/*,
  //    which has no route — every verb answered 307 then 404, and that part was
  //    independent of the ucpIdentityLinking flag. The publishing half was not:
  //    .well-known/oauth-authorization-server 404s with the flag off, so only a
  //    shop that had turned it on advertised the four dead URLs;
  //  · a merchant redirect on /oauth/authorize would 301 it to an absolute
  //    destination with the caller's query appended (the lookup below builds
  //    `${hit.to}${req.nextUrl.search}`), handing client_id/state/redirect_uri/
  //    code_challenge to another origin. Dead endpoints made that inert;
  //  · /oauth/register is RFC 7591 OPEN dynamic client registration — an
  //    unauthenticated POST that writes an OAuthClient row. It gets the same
  //    sliding window /api/* has, which docs/HUL-D-UCP-IDENTITY-LINKING.md
  //    lists as an outstanding go-live protection. Without UPSTASH_* env there
  //    is no limiter and this is a no-op, exactly as for /api.
  if (isProtocolExempt(pathname)) {
    const limited = await rateLimitedResponse(req, "oauth_ratelimit");
    if (limited) return limited;
    return NextResponse.next();
  }

  // ── Admin-styrede redirects ────────────────────────────────────────────────
  // Additivt + fail-soft: kun eksakte konfigurerede stier rammer; alt andet
  // falder igennem til eksisterende logik. Springer /api + /admin over (hele
  // segmenter: /apiary og /administration slås op som alle andre stier).
  // RED1: mappet læses fra Redis når det er sat op, ellers fra databasen
  // (lib/redirects/load.ts, 60 s cache) — uden Redis virker de nu også.
  if (!permalinkWithoutLocale && !isApiPath(pathname) && !isAdminPath(pathname)) {
    const hit = matchRedirect(pathname, await loadRedirectMap(), REDIRECT_OPTIONS);
    if (hit) {
      const to = routing.localePrefix === "never" ? withoutLocalePrefix(hit.to) : hit.to;
      return NextResponse.redirect(
        new URL(`${to}${req.nextUrl.search}`, req.nextUrl.origin),
        hit.status,
      );
    }
  }

  // ── /icon, /og (locale-less assets) ───────────────────────────────────────
  // Same rewrite problem as /oauth above — both live outside app/[locale], so
  // falling through to the intl middleware sent them to /<locale>/icon and
  // /<locale>/og, neither of which is a route: 307 then 404. That left every
  // canary with a dead <link rel="icon">, a dead Organization JSON-LD logo, and
  // a dead og:image on every page wired through lib/og.ts:pageOg.
  //
  // Deliberately BELOW the redirect lookup, unlike /oauth: these stay
  // redirect-eligible, which is what they do today, and nothing is handed to
  // another origin by retargeting an icon or a share-card renderer.
  if (isAssetExempt(pathname)) {
    return NextResponse.next();
  }

  // ── /api/* ────────────────────────────────────────────────────────────────
  // A whole segment, like the reserved test above: `/apiary`, and a stored
  // `/apikultur/` (`permalinkWithoutLocale`), are not /api, so they go on to
  // next-intl.
  if (!permalinkWithoutLocale && isApiPath(pathname)) {
    // Same bucket key as before the helper was extracted, so the window is
    // unchanged for existing callers.
    const limited = await rateLimitedResponse(req, "global_api_ratelimit");
    if (limited) return limited;
    // Allow API routes to proceed (Auth is handled in individual route handlers)
    return NextResponse.next();
  }

  // ── /admin/* ────────────────────────────────────────────────────────────────
  if (ADMIN_SEGMENT_RE.test(pathname)) {
    // No session → send to login
    if (!req.auth) {
      const loginUrl = new URL("/account/login", req.nextUrl.origin);
      return NextResponse.redirect(loginUrl);
    }
    // Session exists but not admin → send to homepage
    // (role is in the JWT and copied to session via auth.config.ts callbacks,
    //  so it is reliably available at the Edge)
    if (req.auth.user?.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
    return withPathnameHeader(req, pathname);
  }

  // ── /account/* ────────────────────────────────────────────────────────────────
  // Public auth pages — always allow through to intlMiddleware
  const isPublicAuthPage = PUBLIC_AUTH_PAGE_RE.test(pathname);
  const isKontoRoute = !permalinkWithoutLocale && ACCOUNT_SEGMENT_RE.test(pathname);

  if (!isPublicAuthPage && isKontoRoute) {
    if (!req.auth) {
      const loginUrl = new URL("/account/login", req.nextUrl.origin);
      return NextResponse.redirect(loginUrl);
    }
    
    // Auto-redirect admins from /account directly to /admin
    const isExactAccountRoot = pathname === "/account" || LOCALE_ACCOUNT_ROOT_RE.test(pathname);
    if (isExactAccountRoot && req.auth.user?.role === "admin") {
      return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));
    }
  }

  // ── Sprog / Storefront ──────────────────────────────────────────────────────
  // For alle andre ruter (storefront, konto, etc.) kører vi next-intl's middleware
  // så URL'er får /da/ eller /en/ prefix.
  const dynamicIntlMiddleware = await storefrontIntlMiddleware();

  const response = dynamicIntlMiddleware(req);
  // ── URL1: `/<locale>/x` → `/x` is permanent under "never" ─────────────────────
  // It is the only redirect next-intl issues in that mode, and it sends a 307.
  // With one locale the answer can never change, so it goes out as a 308 and an
  // old prefixed address hands its ranking to the page. The target is next-intl's.
  const intlTarget = response.headers.get("location");
  if (routing.localePrefix === "never" && response.status === 307 && intlTarget) {
    return NextResponse.redirect(new URL(intlTarget, req.url), 308);
  }
  // ── URL2: the storefront page's own trailing slash ───────────────────────────
  // Last, so only a page the storefront would serve gets it: /api, /admin,
  // /oauth, /icon and /og returned above and answer at either form. A path
  // next-intl redirects (no locale yet) keeps that one redirect — next-intl
  // adds the slash itself when Next's `trailingSlash` is on — instead of two.
  if (REDIRECT_OPTIONS.trailingSlash && !response.headers.has("location")) {
    const target = trailingSlashRedirect(pathname, req.method);
    if (target) {
      // Set on a copy of the request URL, never parsed from a string: a
      // `//host` path cannot become another origin this way.
      const url = new URL(req.nextUrl.href);
      url.pathname = target;
      return NextResponse.redirect(url, 308);
    }
  }
  if (isHomepage && (req.method === "GET" || req.method === "HEAD")) {
    // Discovery-links på selve homepage-svaret (også på locale-redirectet fra
    // "/"): markdown-alternativet + de flag-uafhængige agent-indgange. De
    // flag-gatede flader (OpenAPI/MCP) annonceres af deres egne ruter i
    // stedet — en Link-header her ville reklamere for et 404 på shops med
    // mcpPublic slået fra.
    response.headers.append(
      "Link",
      '</index.md>; rel="alternate"; type="text/markdown", ' +
        '</sitemap.xml>; rel="sitemap", ' +
        '</llms.txt>; rel="describedby"; type="text/markdown"',
    );
  }
  return response;
});

export const config = {
  // Kør proxy.ts på alle stier undtagen statiske filer og billeder.
  // opengraph-image/twitter-image/apple-icon er extension-løse Next metadata-
  // routes på app-roden — uden disse i exclude-listen prepender intl-middleware
  // en locale (/opengraph-image → /da/opengraph-image → 404), så social-share-
  // billedet bliver et dødt link for crawlers.
  //
  // Denne blok sagde tidligere "(icon håndteres allerede af next-intl
  // internt.)". Det er FALSK — next-intl har ingen /icon-undtagelse, og /icon
  // gav 307 → /da/icon → 404 på alle tre canaries, målt. /icon er derfor
  // undtaget i proxy-handleren ovenfor (lib/locale-exempt.ts) i stedet for her,
  // så undtagelsen har ét hjem og er dækket af en test.
  //
  // `hero(?![^/])` er segmentet /hero (asset-mappen public/hero/), ikke
  // /heron-hegn/ eller /heroes/ — dem skal proxy'en se. Et lookahead og ikke
  // `hero(?:/|$)`, fordi lib/urls.ts:PROXY_SKIPPED_PREFIXES og dens test
  // splitter matcheren på `|`.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|apple-icon|.*\\..*|hero(?![^/])).*)',
  ],
};
