import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import {
  createRateLimiter,
  type RateLimitResult,
} from "@/lib/rate-limit";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export type { RateLimitResult } from "@/lib/rate-limit";

export const PUBLIC_AGENT_RATE_LIMIT = 60;
const PUBLIC_AGENT_RATE_WINDOW_SECONDS = 60;
const PUBLIC_AGENT_UPSTASH_PREFIX = "cartwright:public-agent-api";
const PUBLIC_AGENT_UPSTASH_RETRY_MS = 30_000;

type DistributedRateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix timestamp in milliseconds. */
  reset: number;
  reason?: string;
};

type DistributedRateLimiter = {
  limit(identifier: string): Promise<DistributedRateLimitResult>;
};

let upstashPublicAgentLimiter: DistributedRateLimiter | null | undefined;

/** Lazily construct the distributed limiter only in agent-API profiles. */
function getUpstashPublicAgentLimiter(): DistributedRateLimiter | null {
  if (upstashPublicAgentLimiter !== undefined) {
    return upstashPublicAgentLimiter;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    upstashPublicAgentLimiter = null;
    return null;
  }

  try {
    const redis = new Redis({ url, token });
    upstashPublicAgentLimiter = new Ratelimit({
      redis,
      // Burst 60, then one token per second. MCP and REST share both this
      // prefix and the same normalized client identifier.
      limiter: Ratelimit.tokenBucket(1, "1 s", PUBLIC_AGENT_RATE_LIMIT),
      prefix: PUBLIC_AGENT_UPSTASH_PREFIX,
      analytics: false,
      timeout: 1_500,
    });
  } catch {
    // Never log the thrown value: SDK/configuration failures can contain
    // connection details. Local throttling is safer than failing open.
    console.error(
      "[rate-limit] Upstash initialization failed; using the in-memory public-agent limiter.",
    );
    upstashPublicAgentLimiter = null;
  }

  return upstashPublicAgentLimiter;
}

/**
 * Resolve the same conservative per-client key for every public-agent route.
 *
 * Vercel overwrites its forwarding headers at ingress, so they are trusted
 * there. A self-hosted process does not have that guarantee and deliberately
 * collapses to one `unknown` bucket unless its operator opts in after placing
 * the app behind a proxy that overwrites (rather than appends to) client input.
 */
export const publicAgentIp = trustedClientIp;

/**
 * Distributed public-agent limiter with a local shadow bucket.
 *
 * Redis is authoritative when configured. The local bucket is consumed on
 * every request so a provider timeout cannot create a fresh unthrottled burst.
 */
export function createPublicAgentRateLimiter(
  distributedProvider: () => DistributedRateLimiter | null =
    getUpstashPublicAgentLimiter,
) {
  const fallback = createRateLimiter("public-agent-api", {
    capacity: PUBLIC_AGENT_RATE_LIMIT,
    refillRate: 1,
  });
  let distributedRetryAtMs = 0;
  let distributedFailureLogged = false;

  async function check(key: string): Promise<RateLimitResult> {
    const fallbackResult = fallback.check(key);
    const now = Date.now();
    if (now < distributedRetryAtMs) return fallbackResult;

    try {
      const distributed = distributedProvider();
      if (!distributed) return fallbackResult;

      const result = await distributed.limit(key);
      if (result.reason === "timeout") {
        throw new Error("distributed rate-limit timeout");
      }

      const nextTokenAfterSec = Math.max(
        1,
        Math.ceil((result.reset - now) / 1000),
      );
      const remaining = Math.max(
        0,
        Math.min(PUBLIC_AGENT_RATE_LIMIT, Math.floor(result.remaining)),
      );
      const distributedResult: RateLimitResult = {
        allowed: result.success,
        remaining,
        retryAfterSec: result.success ? 0 : nextTokenAfterSec,
        resetAfterSec: Math.max(1, PUBLIC_AGENT_RATE_LIMIT - remaining),
      };

      // If Redis was cleared mid-window, retain the stricter local outcome.
      return !fallbackResult.allowed && distributedResult.allowed
        ? fallbackResult
        : distributedResult;
    } catch {
      distributedRetryAtMs = now + PUBLIC_AGENT_UPSTASH_RETRY_MS;
      if (!distributedFailureLogged) {
        console.error(
          "[rate-limit] Upstash check failed; temporarily using the in-memory public-agent limiter.",
        );
        distributedFailureLogged = true;
      }
      return fallbackResult;
    }
  }

  function reset(key?: string) {
    fallback.reset(key);
    distributedRetryAtMs = 0;
    distributedFailureLogged = false;
  }

  return { name: "public-agent-api", check, reset };
}

const publicAgentLimiter = createPublicAgentRateLimiter();

export const publicAgentPerIpLimiter = {
  ...publicAgentLimiter,
  reset(key?: string) {
    publicAgentLimiter.reset(key);
    // Test/dev reset only; remote rate-limit data is never mutated.
    upstashPublicAgentLimiter = undefined;
  },
};

export function rateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  return {
    // Current HTTPAPI draft-11 structured fields. Keep the three legacy
    // scalar fields in parallel for clients built against earlier drafts.
    "RateLimit-Policy": `"public-agent";q=${PUBLIC_AGENT_RATE_LIMIT};w=${PUBLIC_AGENT_RATE_WINDOW_SECONDS}`,
    "RateLimit": `"public-agent";r=${result.remaining};t=${result.resetAfterSec}`,
    "RateLimit-Limit": String(PUBLIC_AGENT_RATE_LIMIT),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.resetAfterSec),
  };
}

export function applyRateLimitHeaders(
  response: Response,
  result: RateLimitResult,
): Response {
  for (const [name, value] of Object.entries(rateLimitHeaders(result))) {
    response.headers.set(name, value);
  }
  return response;
}
