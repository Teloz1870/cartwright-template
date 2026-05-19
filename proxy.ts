import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

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

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // ── /admin/* ────────────────────────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
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
  // Public auth pages — always allow through
  const isPublicAuthPage =
    pathname === "/konto/login" || pathname === "/konto/opret";
  if (isPublicAuthPage) return NextResponse.next();

  // All other /konto/* routes require a session
  if (!req.auth) {
    const loginUrl = new URL("/konto/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/konto/:path*", "/admin/:path*"],
};
