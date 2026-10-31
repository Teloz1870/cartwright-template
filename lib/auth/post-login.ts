import { brand } from "@/brand.config";
import { safeCallbackPath } from "@/lib/safe-path";
import { LOCALE_ALTERNATION } from "@/lib/urls";

/**
 * Where a visitor goes once they have a session.
 *
 * ONE caller today: `app/[locale]/account/login/page.tsx`, for an
 * ALREADY-authenticated visitor (second tab, back button, or an OAuth
 * continuation link clicked while signed in elsewhere). Before this existed it
 * dropped `?callbackUrl=` unconditionally and stranded them on `/account` — the
 * same silent drop this change fixes for signed-out visitors.
 *
 * `components/LoginForm.tsx` deliberately does NOT use this: it applies
 * `safeCallbackPath` plus its own `?? "/account"`, because after a fresh
 * sign-in the role default belongs to the server (`proxy.ts:226` already steers
 * an admin arriving at `/account` to `/admin`), and the form has no session to
 * read a role from. The consequence is real and worth knowing: the two paths
 * differ on the auth-page exclusion, so `?callbackUrl=/da/account/signup` is
 * honoured by the form and refused here. Unifying them is a follow-up, not a
 * claim this module already delivers — an earlier version of this docblock said
 * "two callers", which was simply false.
 */

/**
 * Auth pages are excluded as destinations because the login page redirects AWAY
 * from itself for a signed-in visitor: honouring `?callbackUrl=/da/account/login`
 * would bounce between the two forever. Signup is excluded with it, so "auth
 * page" keeps meaning sign in or sign up across the codebase.
 *
 * Whole segments, in the shape of `proxy.ts`'s `PUBLIC_AUTH_PAGE_RE`: an
 * optional configured locale, then exactly `account/login` or `account/signup`,
 * then an optional trailing slash. A substring test used to stand here, and it
 * misread `/blog/account/login-tips`, `/da/account/login2` and
 * `/x/account/login` as the login page (POST-LOGIN-INCLUDES). The legacy Danish
 * slugs `konto/login` and `konto/opret` are included because the proxy 301s them
 * to these two pages (`LEGACY_SLUG_MAP`), so honouring them lands right back here.
 */
const AUTH_PAGE_RE = new RegExp(
  `^(?:\\/(?:${LOCALE_ALTERNATION}))?\\/(?:account\\/(?:login|signup)|konto\\/(?:login|opret))\\/?$`,
);

/**
 * A configured locale as the first segment, matched case-insensitively. next-intl
 * matches the locale prefix that way and redirects `/DA/account/login` to
 * `/da/account/login`, so a differently-cased locale still lands on the auth
 * page (review R2). Only the locale is folded: the route segments themselves
 * are case-sensitive in Next, so `/da/ACCOUNT/login` is not the login page.
 */
const LOCALE_PREFIX_CI_RE = new RegExp(
  `^\\/(?:${LOCALE_ALTERNATION})(?=\\/|$)`,
  "i",
);

/** Respell a configured locale prefix the way it is configured, whatever its case. */
function foldLocalePrefix(path: string): string {
  const match = LOCALE_PREFIX_CI_RE.exec(path);
  if (!match) return path;
  const typed = match[0].slice(1).toLowerCase();
  const configured = brand.locales.find((l) => l.toLowerCase() === typed);
  return configured ? `/${configured}${path.slice(match[0].length)}` : path;
}

function isAuthPagePath(path: string): boolean {
  // `path` comes from `safeCallbackPath`, so it is already parser-normalised
  // (dot segments resolved) and carries its query and fragment; only the path
  // decides which page renders. Percent-escapes are decoded so `%6Cogin` cannot
  // spell the login page past the test; an undecodable path is read as-is.
  const pathname = path.split(/[?#]/, 1)[0];
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed escape cannot name a route segment we compare against.
  }
  // Decoding can surface what the parser left alone: an escaped slash turns
  // `/da/blog/..%2Faccount/login` into an unresolved `..`, and repeated slashes
  // survive parsing. Collapse and re-resolve so neither spells the page past
  // the test. The result is compared only, never navigated to.
  let normalised = decoded.replace(/\/{2,}/g, "/");
  try {
    normalised = new URL(normalised, "https://cartwright.invalid").pathname;
  } catch {
    // Keep the collapsed form.
  }
  return AUTH_PAGE_RE.test(foldLocalePrefix(normalised));
}

/**
 * Resolve a post-login destination. `raw` is an UNTRUSTED query value; it is
 * validated through `safeCallbackPath`, so an off-origin or malformed value
 * falls back to the role default rather than leaving the origin.
 *
 * An explicit, trusted callbackUrl wins over the role default — including for
 * admins. Sending an admin to `/admin` is a convenience for the bare login
 * page, not a policy: when a specific destination was requested, overriding it
 * is what breaks the flow. It is a same-origin navigation either way, and every
 * `/admin` route still enforces its own `requireAdmin` (a non-admin is bounced
 * by `proxy.ts`), so this cannot widen access.
 */
export function postLoginDestination(
  raw: unknown,
  role: string | undefined,
): string {
  const requested = safeCallbackPath(raw);
  if (requested !== undefined && !isAuthPagePath(requested)) return requested;
  return role === "admin" ? "/admin" : "/account";
}
