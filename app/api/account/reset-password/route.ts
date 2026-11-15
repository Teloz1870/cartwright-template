import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { isSupportedLocale, routing } from "@/i18n/routing";
import { RESET_TOKEN_COOKIE, resetTokenCookieOptions } from "@/lib/auth/reset-token-cookie";
import { localeHref } from "@/lib/urls";

/** A real token is 43 characters; anything this long is not one worth storing. */
const MAX_TOKEN_LENGTH = 512;

/**
 * RESET-TOKEN-URL-LEAK — the reset page sends a `?token=` visit here with a
 * server-side redirect, so no HTML (and no analytics) ever runs at an address
 * that holds the token. This moves the token into an httpOnly cookie scoped to
 * the reset page and sends the browser back to that page with no query.
 *
 * Nothing is validated here: the server action checks the token when the form
 * is sent, exactly as it did when the token came in a hidden field. The
 * destination is built from a known locale only, never from the request.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const requested = params.get("locale") ?? "";
  const locale = isSupportedLocale(requested) ? requested : routing.defaultLocale;
  const token = params.get("token") ?? "";
  if (token && token.length <= MAX_TOKEN_LENGTH) {
    (await cookies()).set(RESET_TOKEN_COOKIE, token, resetTokenCookieOptions(locale));
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: localeHref("/account/reset-password", locale),
      "Cache-Control": "no-store",
    },
  });
}
