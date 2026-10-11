import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * The one auth gate for every scheduled job under `app/api/cron` (CRON-AUTH-a).
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the project has
 * a `CRON_SECRET` environment variable, and no header at all when it has none.
 *
 * - Secret set: the header must be exactly `Bearer <secret>`, compared in
 *   constant time; anything else is a 401.
 * - Secret unset: the request is let through, as every cron route did before
 *   this helper existed. **Deprecated** — the next release refuses cron calls
 *   in production until `CRON_SECRET` is set. Until then the admin warns (see
 *   `components/admin/SetupWarningBar.tsx`) and the first fail-open call per
 *   server instance logs a warning.
 *
 * A test (`tests/unit/cron-auth.test.ts`) fails if a route under `app/api/cron`
 * reads `CRON_SECRET` itself instead of calling `verifyCronRequest`.
 */

type CronEnv = { CRON_SECRET?: string; VERCEL_ENV?: string; NODE_ENV?: string };

/** Production as far as the cron warning (and next release's refusal) goes. */
export function isProductionRuntime(env: CronEnv = process.env): boolean {
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}

/** True when this deploy's cron jobs answer any caller and it is production. */
export function cronJobsOpenInProduction(env: CronEnv = process.env): boolean {
  return !env.CRON_SECRET && isProductionRuntime(env);
}

/**
 * Constant-time check of an `Authorization` header against `Bearer <secret>`.
 * Both sides are hashed to 32 bytes first, so `timingSafeEqual` always gets
 * equal-length buffers (it throws otherwise) and the time taken says nothing
 * about how long the secret is or how much of it a guess got right.
 */
export function cronBearerMatches(authorization: string | null, secret: string): boolean {
  const given = createHash("sha256").update(authorization ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}

let warnedFailOpen = false;

/**
 * Returns a 401 response to send back, or `null` when the job may run:
 *
 * ```ts
 * const unauthorized = verifyCronRequest(request);
 * if (unauthorized) return unauthorized;
 * ```
 */
export function verifyCronRequest(request: { headers: Headers }): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (!warnedFailOpen && isProductionRuntime()) {
      warnedFailOpen = true;
      console.warn(
        "[cron] CRON_SECRET is not set, so /api/cron/* answers any caller. " +
          "The next Cartwright release refuses cron calls in production until it is set.",
      );
    }
    return null;
  }
  if (!cronBearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
