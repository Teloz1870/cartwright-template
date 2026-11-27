import { withLocale } from "@/lib/urls";

/**
 * RESET-TOKEN-URL-LEAK — where a password-reset token waits between the link
 * and the form, so it is never in the address bar while the page runs.
 *
 * Every script on a page can read `location.href`, and GA4's `gtag('config')`
 * sends it to Google — even with analytics consent refused, Consent Mode's
 * cookieless ping carries the URL. A reset link is a live credential for an
 * hour (admin accounts included), so the reset page answers `?token=` with a
 * redirect to `app/api/account/reset-password/route.ts`, which moves the token
 * into this cookie and sends the browser back without the query. The server
 * action reads it from here.
 */
export const RESET_TOKEN_COOKIE = "cw_reset_token";

/** Half the token's own hour: time to choose a password, gone soon after. */
const MAX_AGE_SECONDS = 30 * 60;

/**
 * The reset page's own path (`/da/account/reset-password`, or
 * `/account/reset-password` under `urls.localePrefix: "never"`) — the cookie is
 * sent there and nowhere else. No trailing slash: a cookie path matches the
 * slashed address too, so this holds under `urls.trailingSlash` as well.
 */
export function resetTokenCookiePath(locale: string): string {
  return withLocale("/account/reset-password", locale);
}

export function resetTokenCookieOptions(locale: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: resetTokenCookiePath(locale),
    maxAge: MAX_AGE_SECONDS,
  };
}
