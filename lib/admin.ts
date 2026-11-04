import "server-only";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Server-side guard for admin pages.
 *
 * - No session  → redirect to /account/login
 * - Non-admin   → redirect to / (customer homepage)
 * - Admin       → return the session (non-null, role === "admin")
 *
 * Because redirect() throws (never returns), TypeScript narrows the
 * return type correctly — the caller always gets a non-null session.
 *
 * NOTE: this uses redirect() (a 307) which is the right behavior for a *page*
 * navigation but the WRONG response for a JSON POST/GET API route — a fetch()
 * caller sees a redirect, not a 401, and an unauthenticated script can't tell
 * it was rejected. For API route handlers use {@link requireAdminApi} instead.
 */
export async function requireAdmin() {
  const session = await auth();

  if (!session) {
    redirect("/account/login");
  }

  if (session.user.role !== "admin") {
    redirect("/");
  }

  return session;
}

/**
 * Single canonical admin guard for **API route handlers** (route.ts POST/GET/…).
 *
 * Returns EITHER the authenticated admin session OR a 401 `Response`. The 401
 * is the correct status for an unauthenticated API call (vs. the 307 redirect
 * that {@link requireAdmin} emits, which is meaningless to a fetch/curl caller).
 *
 * Usage — one guard, every admin API route:
 *
 *   export async function POST(req: Request) {
 *     const guard = await requireAdminApi();
 *     if (guard instanceof Response) return guard;   // 401 — bail
 *     // …guard.user.id / guard.user.role === "admin" available here…
 *   }
 *
 * Centralizing the check means an admin route can't silently drift into being
 * unauthenticated (the failure mode the parity audit found in translate /
 * generate-logo / phone). The companion regression test
 * (tests/unit/admin-api-auth.test.ts) asserts every admin route carries a guard.
 */
export async function requireAdminApi(): Promise<Session | Response> {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return session;
}
