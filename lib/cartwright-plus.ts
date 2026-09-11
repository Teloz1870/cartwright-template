import "server-only";

import { createPublicKey, verify as edVerify, type KeyObject } from "node:crypto";

/**
 * Cartwright Plus access-key verification (engine side).
 *
 * A Plus key is proof of membership (priority support, upgrade guidance,
 * Pro playbooks, SEO/GEO Lab beta) — it is NOT DRM. The trust-based
 * enforcement rule: a canceled or unverifiable key never shuts down a
 * storefront, checkout, or any already-installed code. Verification only
 * gates the Plus *membership* surfaces.
 *
 * Key format:
 *
 *   cw_plus_v1.<base64url(JSON payload)>.<base64url(ed25519 signature)>
 *
 * The Ed25519 signature is over the raw payload bytes (the decoded first
 * segment), signed by cartwright.app's private key. Every fork can verify
 * offline with the public key; only cartwright.app can mint keys.
 *
 * v1 scope (deliberately lean):
 * - Key storage is ENV-ONLY (`CARTWRIGHT_PLUS_KEY`). The repo has no generic
 *   key-value settings store (typed models are preferred, see
 *   prisma/schema.prisma), and this PR is schema-free by design. A DB-backed
 *   paste-key flow for nontechnical owners is a follow-up.
 * - No caching layer: status is resolved on page load only (the admin Plus
 *   page). The design's 6h online-verification cache + 7d offline grace
 *   window is a follow-up; until then "grace" only occurs when the
 *   verification endpoint itself reports it.
 * - No automatic re-verification cron, and nothing is ever auto-disabled.
 */

/** Prefix every v1 key starts with. */
export const PLUS_KEY_PREFIX = "cw_plus_v1";

/**
 * Placeholder until the owner mints the production Ed25519 keypair on
 * cartwright.app. While this placeholder is active (and no
 * `CARTWRIGHT_PLUS_PUBLIC_KEY` env is set), offline verification returns
 * `{ ok: false, reason: "no-public-key" }` — it can never accept a key.
 * Replacing it is a one-line PR: paste the base64 SPKI DER (or PEM) of the
 * production public key.
 */
export const PLUS_PUBLIC_KEY_PLACEHOLDER = "REPLACE_WITH_PRODUCTION_PLUS_PUBLIC_KEY";

export type PlusKeyPayload = {
  v: number;
  plan: string;
  /** Stripe customer id (cus_…). */
  customer: string;
  /** Stripe subscription id (sub_…). */
  subscription: string;
  /** Unix seconds. */
  issuedAt: number;
  /** Signing-key id, e.g. "2026-01" — enables future key rotation. */
  kid: string;
};

export type OfflineVerifyResult =
  | { ok: true; payload: PlusKeyPayload }
  | {
      ok: false;
      reason: "no-public-key" | "bad-format" | "bad-payload" | "bad-signature";
    };

export type OnlineStatus = "active" | "grace" | "inactive" | "offline";
export type OnlineVerifyResult = { status: OnlineStatus };

export type PlusStatus =
  | "unconfigured" // no CARTWRIGHT_PLUS_KEY set
  | "invalid" // key set but fails offline verification (or no public key yet)
  | "active" // offline-valid + cartwright.app confirms the subscription
  | "grace" // offline-valid + cartwright.app reports grace (e.g. payment retry)
  | "inactive" // offline-valid but cartwright.app reports canceled/unpaid
  | "offline"; // offline-valid but cartwright.app unreachable — fail-soft

export type PlusStatusResult = {
  status: PlusStatus;
  /** Masked preview of the configured key (never the full key). */
  keyPreview: string | null;
  /** Present when the key passed offline verification. */
  payload: PlusKeyPayload | null;
  /** Present when status === "invalid" — why offline verification failed. */
  offlineReason?: Exclude<OfflineVerifyResult, { ok: true }>["reason"];
};

const VERIFY_ENDPOINT = "https://cartwright.app/api/v1/license/verify";
const VERIFY_TIMEOUT_MS = 5_000;

/* ── Key parsing & offline verification ─────────────────────────────────── */

function b64urlDecode(segment: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  try {
    return Buffer.from(segment, "base64url");
  } catch {
    return null;
  }
}

/**
 * Resolve the Ed25519 public key used for offline verification.
 * `CARTWRIGHT_PLUS_PUBLIC_KEY` may be base64-encoded SPKI DER or a full PEM
 * block. Returns null while only the placeholder is available.
 */
function resolvePublicKey(): KeyObject | null {
  const raw = process.env.CARTWRIGHT_PLUS_PUBLIC_KEY?.trim() || PLUS_PUBLIC_KEY_PLACEHOLDER;
  if (raw === PLUS_PUBLIC_KEY_PLACEHOLDER) return null;
  try {
    if (raw.includes("-----BEGIN")) {
      return createPublicKey(raw);
    }
    return createPublicKey({
      key: Buffer.from(raw, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    return null;
  }
}

function parsePayload(bytes: Buffer): PlusKeyPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const p = parsed as Record<string, unknown>;
  if (
    typeof p.v !== "number" ||
    typeof p.plan !== "string" ||
    typeof p.customer !== "string" ||
    typeof p.subscription !== "string" ||
    typeof p.issuedAt !== "number" ||
    typeof p.kid !== "string"
  ) {
    return null;
  }
  return p as PlusKeyPayload;
}

/**
 * Verify a Plus key offline: structural parse + Ed25519 signature check over
 * the raw payload bytes. Pure — no network, no DB.
 */
export function verifyPlusKeyOffline(key: string): OfflineVerifyResult {
  const parts = key.trim().split(".");
  if (parts.length !== 3 || parts[0] !== PLUS_KEY_PREFIX) {
    return { ok: false, reason: "bad-format" };
  }
  const payloadBytes = b64urlDecode(parts[1]);
  const sigBytes = b64urlDecode(parts[2]);
  if (!payloadBytes || !sigBytes) return { ok: false, reason: "bad-format" };

  const payload = parsePayload(payloadBytes);
  if (!payload) return { ok: false, reason: "bad-payload" };

  const publicKey = resolvePublicKey();
  if (!publicKey) return { ok: false, reason: "no-public-key" };

  let valid = false;
  try {
    // Ed25519: algorithm must be null/undefined (the curve fixes the hash).
    valid = edVerify(null, payloadBytes, publicKey, sigBytes);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "bad-signature" };

  return { ok: true, payload };
}

/* ── Online verification ────────────────────────────────────────────────── */

/**
 * Ask cartwright.app whether the subscription behind this key is still
 * active. Fail-soft: any network error, timeout, non-2xx or malformed
 * response maps to `{ status: "offline" }` — never to inactive. Only an
 * explicit "inactive" from the endpoint reports a lapsed membership.
 */
export async function verifyPlusKeyOnline(key: string): Promise<OnlineVerifyResult> {
  try {
    const res = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { status: "offline" };
    const data: unknown = await res.json();
    const status =
      data && typeof data === "object" && "status" in data
        ? (data as { status: unknown }).status
        : null;
    if (status === "active" || status === "grace" || status === "inactive") {
      return { status };
    }
    return { status: "offline" };
  } catch {
    return { status: "offline" };
  }
}

/* ── Status resolution ──────────────────────────────────────────────────── */

/** Resolve the configured key. v1: env-only (see module doc). */
export function resolvePlusKey(): string | null {
  const key = process.env.CARTWRIGHT_PLUS_KEY?.trim();
  return key ? key : null;
}

/** Masked preview for the admin UI — never exposes the full key. */
export function maskPlusKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 16) return `${trimmed.slice(0, 4)}…`;
  return `${trimmed.slice(0, 12)}…${trimmed.slice(-4)}`;
}

/**
 * Full status resolution for the admin Plus page. No caching in v1 — this
 * runs at page load only (see module doc for the follow-up plan).
 */
export async function getPlusStatus(): Promise<PlusStatusResult> {
  const key = resolvePlusKey();
  if (!key) {
    return { status: "unconfigured", keyPreview: null, payload: null };
  }

  const offline = verifyPlusKeyOffline(key);
  if (!offline.ok) {
    return {
      status: "invalid",
      keyPreview: maskPlusKey(key),
      payload: null,
      offlineReason: offline.reason,
    };
  }

  const online = await verifyPlusKeyOnline(key);
  return {
    status: online.status,
    keyPreview: maskPlusKey(key),
    payload: offline.payload,
  };
}
