import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildGoogleOAuthConsentUrl,
  createGoogleOAuthPkce,
} from "@/plugins/google-workspace/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "cartwright_google_oauth_state";
const VERIFIER_COOKIE = "cartwright_google_oauth_verifier";
const COOKIE_MAX_AGE_SECONDS = 10 * 60;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/account/login", request.url));
  }

  const pkce = createGoogleOAuthPkce();
  const redirectUri = new URL("/api/google/oauth/callback", request.url).toString();
  const consent = await buildGoogleOAuthConsentUrl({
    redirectUri,
    state: pkce.state,
    codeChallenge: pkce.codeChallenge,
  });

  if (!consent.ok) {
    return NextResponse.redirect(
      new URL("/admin/integrations?google=missing-credentials", request.url),
    );
  }

  const response = NextResponse.redirect(consent.url, { status: 303 });
  response.cookies.set(STATE_COOKIE, pkce.state, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/api/google/oauth/callback",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.cookies.set(VERIFIER_COOKIE, pkce.codeVerifier, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/api/google/oauth/callback",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
