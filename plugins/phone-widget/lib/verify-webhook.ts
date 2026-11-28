import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signature check for the Phone.inc webhook (cartwright-plugin-v1), as
 * Phone.inc documents it (https://docs.phone.inc/api/webhooks):
 *
 *   X-Phone-Inc-Timestamp: <Unix seconds>
 *   X-Phone-Inc-Signature: v1=<64 lowercase hex>
 *
 * where the hex is HMAC-SHA256, keyed with the subscription's signing secret,
 * over `<timestamp>.<exact raw body bytes>`. The full `v1=…` value is compared
 * in constant time, and a timestamp more than 300 seconds away from the clock,
 * in either direction, is refused.
 *
 * The secret is Phone.inc's (returned when the subscription is created,
 * readable later with `PATCH /api/v1/webhooks/:id` and `{}`); the merchant
 * cannot choose it and puts it in `PHONE_INC_WEBHOOK_SECRET`.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

const SIGNATURE = /^v1=[0-9a-f]{64}$/;
const TIMESTAMP = /^[0-9]{1,12}$/;

/** The configured signing secret, or null when none is set (blank counts as none). */
export function phoneWebhookSecret(): string | null {
  return process.env.PHONE_INC_WEBHOOK_SECRET?.trim() || null;
}

export function isValidPhoneIncSignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: Uint8Array;
  nowSeconds?: number;
}): boolean {
  const { secret, timestamp, signature, rawBody } = input;
  if (!timestamp || !TIMESTAMP.test(timestamp)) return false;
  if (!signature || !SIGNATURE.test(signature)) return false;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected =
    "v1=" + createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
  return constantTimeEqual(signature, expected);
}

/**
 * DEPRECATED, removed in the next release: before this signature check the
 * guard compared the raw secret to `?token=` in the webhook URL, and a shop
 * that set its own value there would otherwise go dark on upgrade (Phone.inc
 * does not retry a 401). It authenticates nothing about the body.
 */
export function hasLegacyUrlToken(request: Request, secret: string): boolean {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim();
    return Boolean(token) && constantTimeEqual(token as string, secret);
  } catch {
    return false;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  // timingSafeEqual throws on unequal lengths; the length is not secret.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
