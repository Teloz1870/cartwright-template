import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { matchRedirect, type RedirectMap } from '@/lib/redirects/match';

const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? Redis.fromEnv()
  : null;

const { auth } = NextAuth(authConfig);

/**
 * Admin-styrede redirects — læses fra Redis (skrevet af lib/redirects/store.ts).
 * Module-level TTL-cache så det ikke er ét Redis-kald pr. request. Fail-soft:
 * ingen Redis / fejl / intet match → tom map → ingen redirect (uændret adfærd).
 */
let redirectCache: { map: RedirectMap; expires: number } | null = null;
async function getRedirectMap(): Promise<RedirectMap> {
  if (redirectCache && redirectCache.expires > Date.now()) return redirectCache.map;
  let map: RedirectMap = {};
  if (redis) {
    try {
      const raw = await redis.get("cartwright_redirects");
      if (raw) map = typeof raw === "string" ? (JSON.parse(raw) as RedirectMap) : (raw as RedirectMap);
    } catch (e) {
      console.warn("[Proxy] redirect map load failed:", e);
    }
  }
  redirectCache = { map, expires: Date.now() + 60_000 };
  return map;
}

const ratelimit = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) 
  ? new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(20, '10 s'),
      analytics: true,
    }) 
  : null;

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

const LEGACY_SLUG_RE =
  /^(\/(?:da|en))?\/(konto\/(?:ordrer|login|opret)|konto|kurv|ordre|kategori|produkt|kontakt|anmeld)(\/.*|$)/;

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  console.log("[Proxy Middleware] Path:", pathname, "Full URL:", req.nextUrl.toString());

  // ── Legacy Danish-slug 301-redirects ───────────────────────────────────────
  // Run FIRST so /da/kurv/foo → 301 /da/cart/foo before any other logic fires.
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

  // ── Admin-styrede redirects ────────────────────────────────────────────────
  // Additivt + fail-soft: kun eksakte konfigurerede stier rammer; alt andet
  // falder igennem til eksisterende logik. Springer /api + /admin over.
  if (!pathname.startsWith("/api") && !pathname.startsWith("/admin")) {
    const hit = matchRedirect(pathname, await getRedirectMap());
    if (hit) {
      return NextResponse.redirect(
        new URL(`${hit.to}${req.nextUrl.search}`, req.nextUrl.origin),
        hit.status,
      );
    }
  }

  // ── /api/* ────────────────────────────────────────────────────────────────
  if (pathname.startsWith("/api")) {
    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1';
      try {
        const { success } = await ratelimit.limit(`global_api_ratelimit_${ip}`);
        if (!success) {
          return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
        }
      } catch (error) {
        console.error("[Middleware] Upstash rate limit failed:", error);
      }
    }
    // Allow API routes to proceed (Auth is handled in individual route handlers)
    return NextResponse.next();
  }

  // ── /admin/* ────────────────────────────────────────────────────────────────
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.match(/^\/(da|en)\/admin/)) {
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
  const isPublicAuthPage = pathname.includes("/account/login") || pathname.includes("/account/signup");
  const isKontoRoute = pathname === "/account" || pathname.includes("/account/") || pathname.match(/^\/(da|en)\/account/);

  if (!isPublicAuthPage && isKontoRoute) {
    if (!req.auth) {
      const loginUrl = new URL("/account/login", req.nextUrl.origin);
      return NextResponse.redirect(loginUrl);
    }
    
    // Auto-redirect admins from /account directly to /admin
    const isExactAccountRoot = pathname === "/account" || pathname.match(/^\/(da|en)\/account\/?$/);
    if (isExactAccountRoot && req.auth.user?.role === "admin") {
      return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));
    }
  }

  // ── Sprog / Storefront ──────────────────────────────────────────────────────
  // For alle andre ruter (storefront, konto, etc.) kører vi next-intl's middleware
  // så URL'er får /da/ eller /en/ prefix.
  let defaultLocale = routing.defaultLocale;
  if (redis) {
    try {
      const cachedLocale = await redis.get<string>('cartwright_default_locale');
      if (cachedLocale && (routing.locales as readonly string[]).includes(cachedLocale)) {
        defaultLocale = cachedLocale as "da" | "en";
      }
    } catch (e) {
      console.warn("[Proxy Middleware] Failed to get default locale from Redis:", e);
    }
  }

  const dynamicIntlMiddleware = createMiddleware({
    locales: routing.locales,
    defaultLocale: defaultLocale
  });

  return dynamicIntlMiddleware(req);
});

export const config = {
  // Kør proxy.ts på alle stier undtagen statiske filer og billeder.
  // opengraph-image/twitter-image/apple-icon er extension-løse Next metadata-
  // routes på app-roden — uden disse i exclude-listen prepender intl-middleware
  // en locale (/opengraph-image → /da/opengraph-image → 404), så social-share-
  // billedet bliver et dødt link for crawlers. (icon håndteres allerede af
  // next-intl internt.)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|apple-icon|.*\\..*|hero).*)',
  ],
};
