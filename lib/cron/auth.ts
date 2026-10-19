import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * The one auth gate for every scheduled job under `app/api/cron` (CRON-AUTH).
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the project has
 * a `CRON_SECRET` environment variable, and no header at all when it has none.
 *
 * - Secret set: the header must be exactly `Bearer <secret>`, compared in
 *   constant time; anything else is a 401.
 * - Secret unset, production (`isProductionRuntime`): the call is refused with
 *   a 503 and the job does not run (CRON-AUTH-b, fail-closed). It is a 503,
 *   not a 401, because no header could make it pass: the deploy is missing
 *   configuration, and the Vercel Cron log should say that rather than look
 *   like a wrong secret. The admin says so too (`SetupWarningBar`, the setup
 *   guide's CRON_SECRET item), and each server instance logs it once.
 * - Secret unset anywhere else (`next dev`, tests): the request is let
 *   through, as before, so a local cron can be called by hand.
 *
 * A test (`tests/unit/cron-auth.test.ts`) fails if a route under `app/api/cron`
 * reads `CRON_SECRET` itself instead of calling `verifyCronRequest`, and calls
 * every route it finds there to check that it refuses.
 */

type CronEnv = { CRON_SECRET?: string; VERCEL_ENV?: string; NODE_ENV?: string };

/**
 * Production as far as the cron gate goes: a Vercel production deploy, or any
 * production build (`next start`, a container — and a Vercel preview, which
 * also runs with `NODE_ENV=production`; Vercel Cron never calls a preview).
 */
export function isProductionRuntime(env: CronEnv = process.env): boolean {
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}

/** True when this is production and its cron calls are refused for want of a secret. */
export function cronJobsRefusedInProduction(env: CronEnv = process.env): boolean {
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

let loggedRefusal = false;

/**
 * Returns the response to send back (401 or 503), or `null` when the job may
 * run:
 *
 * ```ts
 * const unauthorized = verifyCronRequest(request);
 * if (unauthorized) return unauthorized;
 * ```
 */
export function verifyCronRequest(request: { headers: Headers }): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (!isProductionRuntime()) return null;
    if (!loggedRefusal) {
      loggedRefusal = true;
      console.error(
        "[cron] CRON_SECRET is not set, so every call to /api/cron/* is refused " +
          "on this production deploy and its scheduled jobs do not run. " +
          "Set CRON_SECRET (openssl rand -hex 32) and redeploy.",
      );
    }
    return NextResponse.json(
      { error: "CRON_SECRET not configured on this deploy" },
      { status: 503 },
    );
  }
  if (!cronBearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
