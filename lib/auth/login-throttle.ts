import "server-only";
import { loginPerEmailLimiter, loginPerIpLimiter } from "@/lib/rate-limit";

/**
 * Login brute-force throttle (parity-audit gap #3).
 *
 * Pulled out of lib/auth.ts as a pure-ish helper so it can be unit-tested
 * without booting NextAuth. Each call CONSUMES one token from BOTH the per-IP
 * and per-email token buckets and returns whether the attempt may proceed.
 *
 * Keys are normalized: email lowercased/trimmed (so `Admin@x` and `admin@x `
 * share a bucket), IP first-hop of x-forwarded-for. A missing IP collapses to
 * the literal "unknown" — still throttled (a single shared bucket for all
 * IP-less callers), which is the safe direction.
 *
 * We check BOTH buckets unconditionally (no short-circuit) so an attacker can't
 * keep one bucket full by varying the other axis.
 */
export function checkLoginAttempt(opts: {
  email: string;
  ip: string | null | undefined;
}): { allowed: boolean; retryAfterSec: number } {
  const emailKey = opts.email.trim().toLowerCase() || "unknown";
  const ipKey = normalizeIp(opts.ip) || "unknown";

  const byEmail = loginPerEmailLimiter.check(emailKey);
  const byIp = loginPerIpLimiter.check(ipKey);

  const allowed = byEmail.allowed && byIp.allowed;
  const retryAfterSec = Math.max(
    byEmail.allowed ? 0 : byEmail.retryAfterSec,
    byIp.allowed ? 0 : byIp.retryAfterSec,
  );
  return { allowed, retryAfterSec };
}

/** First hop of an x-forwarded-for chain (the client), trimmed. */
export function normalizeIp(ip: string | null | undefined): string {
  if (!ip) return "";
  return ip.split(",")[0]?.trim() ?? "";
}

/**
 * Extract the caller IP from the Request that Auth.js passes as the second
 * argument to authorize(). Falls back through the common proxy headers.
 */
export function ipFromRequest(req: unknown): string | null {
  if (!req || typeof req !== "object") return null;
  const headers = (req as { headers?: unknown }).headers;
  if (!headers || typeof (headers as Headers).get !== "function") return null;
  const h = headers as Headers;
  return (
    h.get("x-forwarded-for") ??
    h.get("x-real-ip") ??
    h.get("cf-connecting-ip") ??
    null
  );
}
