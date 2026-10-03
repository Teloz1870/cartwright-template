import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret guard for the Phone.inc webhook (cartwright-plugin-v1).
 *
 * Default-off by design: when `PHONE_INC_WEBHOOK_SECRET` is unset (the state of
 * every shop today), this returns `true` and the handler behaves exactly as
 * before — byte-identical, no new rejection. A merchant who sets the env var
 * opts in to authentication: the request must then present the matching secret
 * or it is rejected with 401 before the body is parsed.
 *
 * The secret may be delivered two ways, covering both common webhook channels:
 *   - header `x-phone-inc-signature: <secret>`
 *   - query param `?token=<secret>` (for providers that only let you set the
 *     webhook URL, not custom headers)
 *
 * Comparison is constant-time (`timingSafeEqual`) to avoid leaking the secret
 * via response timing.
 */
export function isPhoneWebhookAuthorized(request: Request): boolean {
  const secret = process.env.PHONE_INC_WEBHOOK_SECRET?.trim();

  // No secret configured → guard is dormant; accept as before.
  if (!secret) return true;

  // Accept if ANY presented channel matches — never let a foreign value in one
  // channel veto a correct value in the other (a provider might populate the
  // header itself while the merchant configured the URL token, or vice versa).
  return presentedSecrets(request).some((candidate) => constantTimeEqual(candidate, secret));
}

function presentedSecrets(request: Request): string[] {
  const candidates: string[] = [];

  const header = request.headers.get("x-phone-inc-signature");
  if (header && header.trim()) candidates.push(header.trim());

  try {
    const token = new URL(request.url).searchParams.get("token");
    if (token && token.trim()) candidates.push(token.trim());
  } catch {
    // Malformed URL — nothing to extract.
  }

  return candidates;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  // Length check first: timingSafeEqual throws on unequal lengths. The length
  // of a shared secret is not itself sensitive.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
