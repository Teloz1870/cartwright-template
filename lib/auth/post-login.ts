import { safeCallbackPath } from "@/lib/safe-path";

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
 * would bounce between the two forever. The predicate mirrors `proxy.ts`'s own
 * `isPublicAuthPage` (`proxy.ts:215`) — substring, both locales, signup included
 * — so "auth page" means exactly one thing across the codebase.
 */
function isAuthPagePath(path: string): boolean {
  return path.includes("/account/login") || path.includes("/account/signup");
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
