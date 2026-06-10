import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exchangeGoogleOAuthCode } from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "cartwright_google_oauth_state";
const VERIFIER_COOKIE = "cartwright_google_oauth_verifier";

function integrationRedirect(request: NextRequest, marker: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/admin/integrations?google=${encodeURIComponent(marker)}`, request.url),
    { status: 303 },
  );
}

function clearOauthCookies(response: NextResponse): NextResponse {
  response.cookies.set(STATE_COOKIE, "", {
    maxAge: 0,
    path: "/api/google/oauth/callback",
  });
  response.cookies.set(VERIFIER_COOKIE, "", {
    maxAge: 0,
    path: "/api/google/oauth/callback",
  });
  return response;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/account/login", request.url));
  }

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return clearOauthCookies(integrationRedirect(request, `error-${error}`));
  }

  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(VERIFIER_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState || !codeVerifier) {
    return clearOauthCookies(integrationRedirect(request, "invalid-state"));
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return clearOauthCookies(integrationRedirect(request, "missing-code"));
  }

  const redirectUri = new URL("/api/google/oauth/callback", request.url).toString();
  const exchanged = await exchangeGoogleOAuthCode({
    code,
    redirectUri,
    codeVerifier,
  });

  if (!exchanged.ok) {
    return clearOauthCookies(integrationRedirect(request, exchanged.reason));
  }

  return clearOauthCookies(integrationRedirect(request, "connected"));
}
