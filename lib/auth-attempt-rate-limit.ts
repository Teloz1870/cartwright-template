import "server-only";

import { createRateLimiter, type RateLimitResult } from "@/lib/rate-limit";

export const AUTH_ATTEMPT_RATE_LIMIT = 120;
const AUTH_ATTEMPT_WINDOW_SECONDS = 60;

export const authAttemptPerIpLimiter = createRateLimiter("auth-attempt", {
  capacity: AUTH_ATTEMPT_RATE_LIMIT,
  refillRate: 2,
});

export function authAttemptRateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  return {
    "RateLimit-Policy": `"auth-attempt";q=${AUTH_ATTEMPT_RATE_LIMIT};w=${AUTH_ATTEMPT_WINDOW_SECONDS}`,
    "RateLimit": `"auth-attempt";r=${result.remaining};t=${result.resetAfterSec}`,
    "RateLimit-Limit": String(AUTH_ATTEMPT_RATE_LIMIT),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.resetAfterSec),
  };
}

export function applyAuthAttemptRateLimitHeaders(
  response: Response,
  result: RateLimitResult,
): Response {
  for (const [name, value] of Object.entries(authAttemptRateLimitHeaders(result))) {
    response.headers.set(name, value);
  }
  return response;
}
