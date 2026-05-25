import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? Redis.fromEnv()
  : null;

const { auth } = NextAuth(authConfig);

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
 * ser session === null. Den bug forårsagede at /admin → /konto/login-redirect.
 */
function withPathnameHeader(req: NextRequest, pathname: string) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  console.log("[Proxy Middleware] Path:", pathname, "Full URL:", req.nextUrl.toString());

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
      const loginUrl = new URL("/konto/login", req.nextUrl.origin);
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

  // ── /konto/* ────────────────────────────────────────────────────────────────
  // Public auth pages — always allow through to intlMiddleware
  const isPublicAuthPage = pathname.includes("/konto/login") || pathname.includes("/konto/opret");
  const isKontoRoute = pathname === "/konto" || pathname.includes("/konto/") || pathname.match(/^\/(da|en)\/konto/);

  if (!isPublicAuthPage && isKontoRoute) {
    if (!req.auth) {
      const loginUrl = new URL("/konto/login", req.nextUrl.origin);
      return NextResponse.redirect(loginUrl);
    }
    
    // Auto-redirect admins from /konto directly to /admin
    const isExactKontoRoot = pathname === "/konto" || pathname.match(/^\/(da|en)\/konto\/?$/);
    if (isExactKontoRoot && req.auth.user?.role === "admin") {
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
      if (cachedLocale && routing.locales.includes(cachedLocale as any)) {
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
  // Kør proxy.ts på alle stier undtagen statiske filer og billeder
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|hero).*)'],
};
