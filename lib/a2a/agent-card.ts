/**
 * Master Plan §4 Phase 5/8 — Agent Card signing and verification.
 *
 * Buyer agents discover this shop's capabilities by reading the signed
 * Agent Card published at GET /api/agent-card. They verify the signature
 * against the embedded publicKey before trusting any field in the card.
 *
 * Signing scheme: ed25519 (Phase 5 default decision). Uses node:crypto
 * (built-in, no extra dependency). Key material is loaded from env vars
 * (AGENT_CARD_PRIVATE_KEY / AGENT_CARD_PUBLIC_KEY, both base64).
 *
 * Pure module — only imports node:crypto and the AgentCard type.
 */

import { createPrivateKey, createPublicKey, sign, verify, generateKeyPairSync } from "node:crypto";

// ============================================================================
// Public types
// ============================================================================

/**
 * Domain-level representation of an Agent Card. This is what buyer agents
 * receive (as JSON) and what we sign over.
 */
export type AgentCardPayload = {
  /** Card revision number — strictly increases. */
  version: number;
  /** Shop identifier (domain, e.g. "teloz.net"). */
  shopId: string;
  /** Public-facing shop name. */
  shopName: string;
  /** Issued-at timestamp, ISO-8601. */
  issuedAt: string;
  /** Optional expiry. ISO-8601. */
  expiresAt: string | null;
  /** What this shop can sell as agentic capabilities. */
  capabilities: ReadonlyArray<{
    /** Stable identifier (slug). */
    id: string;
    /** Human-readable name. */
    name: string;
    /** Optional anchor/floor in minor currency unit. Null = not pre-priced. */
    anchorPriceMinor: number | null;
    floorPriceMinor: number | null;
    /** Currency code (DKK, EUR, USD …). */
    currency: string;
  }>;
  /** Payment rails the shop accepts (e.g. ["stripe", "manual"]). */
  paymentRails: ReadonlyArray<string>;
  /** Negotiation policy hint for buyer agents. */
  negotiationPolicy: {
    /** Concession-rate per round, 0-1. Informational; engine still enforces. */
    concessionRate: number;
    /** Max rounds before force-reject. */
    maxRounds: number;
  };
};

/** What we serve at GET /api/agent-card. */
export type SignedAgentCard = {
  /** Canonical JSON of the payload (signed-over bytes). */
  payload: AgentCardPayload;
  /** ed25519 signature over canonicalJson(payload), base64. */
  signature: string;
  /** ed25519 public key, base64. Buyer agents use this to verify. */
  publicKey: string;
};

// ============================================================================
// Canonicalization
// ============================================================================

/**
 * Canonical JSON serialiser. Deterministic: same logical payload always
 * produces the same bytes regardless of key insertion order. Required for
 * signatures to round-trip.
 *
 * Algorithm: recursive — for objects, sort keys; for arrays, preserve order
 * (arrays are ordered data); for primitives, JSON.stringify default.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  // Plain object: sort keys.
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

// ============================================================================
// Signing
// ============================================================================

/** Result of signing — both the signature and the public key (for storage). */
export type SignResult = {
  signature: string;
  publicKey: string;
};

/**
 * Sign an Agent Card payload using an ed25519 private key.
 *
 * @param payload The AgentCardPayload to sign.
 * @param privateKeyPem PEM-encoded ed25519 private key.
 * @returns Base64 signature + base64 public key.
 */
export function signAgentCard(
  payload: AgentCardPayload,
  privateKeyPem: string,
): SignResult {
  const keyObj = createPrivateKey(privateKeyPem);
  const message = Buffer.from(canonicalJson(payload), "utf8");
  const sig = sign(null, message, keyObj);
  const publicKeyObj = createPublicKey(keyObj);
  const publicKeyPem = publicKeyObj.export({ type: "spki", format: "pem" }).toString();
  return {
    signature: sig.toString("base64"),
    publicKey: Buffer.from(publicKeyPem, "utf8").toString("base64"),
  };
}

/**
 * Verify a signed Agent Card.
 *
 * @returns true iff the signature is valid for the given payload + public key.
 */
export function verifyAgentCard(card: SignedAgentCard): boolean {
  try {
    const publicKeyPem = Buffer.from(card.publicKey, "base64").toString("utf8");
    const keyObj = createPublicKey(publicKeyPem);
    const message = Buffer.from(canonicalJson(card.payload), "utf8");
    const sigBytes = Buffer.from(card.signature, "base64");
    return verify(null, message, keyObj, sigBytes);
  } catch {
    return false;
  }
}

/**
 * Generate a new ed25519 key pair. PEM-encoded so they can be stored in env
 * vars. The private key is sensitive — store via the same encryption pattern
 * used for other secrets (lib/secret-encryption.ts).
 *
 * Used at setup time (admin command or seed) to produce the initial key pair.
 */
export function generateAgentCardKeyPair(): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}
