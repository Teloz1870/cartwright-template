import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Phase 10 Slice 7b — stateless review-token til unauth post-purchase mails.
 *
 * Token = base64url(HMAC-SHA256(orderId + ":" + paidAtIso, AUTH_SECRET)) + "." + payload
 * Payload = base64url(orderId + ":" + paidAtIso)
 *
 * Stateless: ingen DB-row pre-allokeres. Server validerer signaturen mod
 * AUTH_SECRET ved POST. paidAt-snapshot binder token til ordrens betalingstid,
 * så hvis ordren refunderes/cancelleres senere, kan vi (i fremtiden) afvise
 * token ved at sammenligne mod current state.
 */

const SEP = ".";

export function signReviewToken(orderId: string, paidAt: Date): string {
  const payload = `${orderId}:${paidAt.toISOString()}`;
  const sig = hmac(payload);
  return `${b64url(payload)}${SEP}${b64url(sig)}`;
}

export function verifyReviewToken(
  token: string,
): { orderId: string; paidAtIso: string } | null {
  const parts = token.split(SEP);
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  let payload: string;
  let sig: Buffer;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
    sig = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  const expectedSig = hmac(payload);
  if (sig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(sig, expectedSig)) return null;

  const [orderId, paidAtIso] = payload.split(":");
  if (!orderId || !paidAtIso) return null;
  return { orderId, paidAtIso };
}

function hmac(payload: string): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET er ikke sat — kan ikke signere review-token");
  }
  return createHmac("sha256", secret).update(payload).digest();
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}
