import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * The one auth gate for every scheduled job under `app/api/cron` (CRON-AUTH).
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the project has
 * a `CRON_SECRET` environment variable, and no header at all when it has none.
 *
 * - Secret set: the header must be `Bearer <secret>`, compared in constant
 *   time; anything else is a 401. The secret and the token are both compared
 *   trimmed (`cronBearerMatches`), so a stray pad on the variable does not
 *   split the deploy from its callers. A header longer than
 *   `MAX_AUTHORIZATION_LENGTH` is a 401 without being read.
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

/**
 * `String#trim`, plus U+0085 (NEL): Unicode White_Space that `trim` leaves, and
 * that survives the wire as the latin1 header byte 0x85 — so a secret of only
 * NEL would be as guessable as one of only non-breaking spaces.
 *
 * A scan inward from both ends, so the cost is linear in the length: it runs
 * on the caller's bearer, before any auth. The regex it replaced
 * (`/^[\s\u0085]+|[\s\u0085]+$/g`) retried its end anchor from every space of
 * an inner run, so `x` + spaces + `y` was quadratic — about 0.4 s for 16 KB.
 */
function trimSpace(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isSpace(value[start])) start++;
  while (end > start && isSpace(value[end - 1])) end--;
  return value.slice(start, end);
}

/** One UTF-16 unit; every White_Space character is in the BMP. */
function isSpace(unit: string): boolean {
  return unit === "\u0085" || unit.trim() === "";
}

/**
 * The secret this deploy is configured with, or `undefined` when it has none
 * (CRON-AUTH-d). The value is trimmed, and one that is nothing but whitespace
 * counts as none: `CRON_SECRET=" "` used to count as set, which made the
 * expected header `Bearer  ` — a bearer anyone can guess — and kept the admin
 * saying "configured" on a production deploy that should refuse with a 503.
 * Every reader of the secret goes through here, so "is it set" has one answer.
 */
export function configuredCronSecret(env: CronEnv = process.env): string | undefined {
  return trimSpace(env.CRON_SECRET ?? "") || undefined;
}

/** True when this is production and its cron calls are refused for want of a secret. */
export function cronJobsRefusedInProduction(env: CronEnv = process.env): boolean {
  return !configuredCronSecret(env) && isProductionRuntime(env);
}

const BEARER_PREFIX = "Bearer ";

/**
 * The longest `Authorization` header the gate reads. A longer one is refused
 * before it is trimmed or hashed, so what an unauthenticated caller can make a
 * request cost is bounded by a constant, whatever the header holds. The bound
 * is fixed, so refusing early says nothing about the secret. It leaves ample
 * room: `openssl rand -hex 32` gives 64 characters, and only a `CRON_SECRET`
 * longer than this minus `Bearer ` could never match.
 */
export const MAX_AUTHORIZATION_LENGTH = 1024;

/**
 * Constant-time check of an `Authorization` header against `Bearer <secret>`.
 * Both sides are hashed to 32 bytes first, so `timingSafeEqual` always gets
 * equal-length buffers (it throws otherwise) and the time taken says nothing
 * about how long the secret is or how much of it a guess got right.
 *
 * The token after `Bearer ` and the secret are both trimmed. Trimming only the
 * secret broke a deploy whose `CRON_SECRET` was pasted with a leading space:
 * a caller that sends `Bearer $CRON_SECRET` as written keeps that space inside
 * the header (HTTP strips only the edges), so it stopped matching. Trimmed on
 * both sides, every header that matched a non-blank raw secret still matches.
 * A blank secret matches nothing, so `Bearer ` plus whitespace is never a
 * bearer.
 */
export function cronBearerMatches(authorization: string | null, secret: string): boolean {
  // First, before anything else reads the header: the caller is not trusted yet.
  if (authorization !== null && authorization.length > MAX_AUTHORIZATION_LENGTH) return false;
  const expected = trimSpace(secret);
  const header = authorization ?? "";
  // No `Bearer ` prefix leaves an empty token, which a non-blank secret never matches.
  const token = header.startsWith(BEARER_PREFIX)
    ? trimSpace(header.slice(BEARER_PREFIX.length))
    : "";
  const given = createHash("sha256").update(token).digest();
  const wanted = createHash("sha256").update(expected).digest();
  return timingSafeEqual(given, wanted) && expected !== "";
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
  const secret = configuredCronSecret();
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
