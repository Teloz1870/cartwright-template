import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  signAgentCard,
  verifyAgentCard,
  generateAgentCardKeyPair,
  type AgentCardPayload,
  type SignedAgentCard,
} from "@/lib/a2a/agent-card";

/**
 * Master Plan §4 Phase 8 — tests for AgentCard signing + verification.
 *
 * Covers canonicalisation determinism, signature round-trip, tamper
 * detection, key-pair generation, and a few edge cases.
 */

const SAMPLE_PAYLOAD: AgentCardPayload = {
  version: 1,
  shopId: "teloz.net",
  shopName: "Teloz",
  issuedAt: "2026-05-24T20:00:00.000Z",
  expiresAt: null,
  capabilities: [
    {
      id: "catalogue-feed",
      name: "Catalogue feed (per 1000 records)",
      anchorPriceMinor: 5900,
      floorPriceMinor: 4000,
      currency: "DKK",
    },
  ],
  paymentRails: ["stripe"],
  negotiationPolicy: { concessionRate: 0.5, maxRounds: 5 },
};

describe("canonicalJson", () => {
  it("is deterministic regardless of key insertion order", () => {
    const a = { b: 1, a: 2 };
    const b = { a: 2, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("preserves array order (arrays are ordered data)", () => {
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it("handles nested objects", () => {
    const a = { outer: { b: 1, a: 2 } };
    const b = { outer: { a: 2, b: 1 } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("handles primitives via JSON.stringify defaults", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("x")).toBe('"x"');
  });
});

describe("signAgentCard + verifyAgentCard", () => {
  it("round-trips: signed card verifies as valid", () => {
    const { privateKeyPem } = generateAgentCardKeyPair();
    const signResult = signAgentCard(SAMPLE_PAYLOAD, privateKeyPem);
    const card: SignedAgentCard = {
      payload: SAMPLE_PAYLOAD,
      signature: signResult.signature,
      publicKey: signResult.publicKey,
    };
    expect(verifyAgentCard(card)).toBe(true);
  });

  it("detects payload tampering", () => {
    const { privateKeyPem } = generateAgentCardKeyPair();
    const signResult = signAgentCard(SAMPLE_PAYLOAD, privateKeyPem);
    const tamperedCard: SignedAgentCard = {
      payload: { ...SAMPLE_PAYLOAD, shopName: "EvilTeloz" },
      signature: signResult.signature,
      publicKey: signResult.publicKey,
    };
    expect(verifyAgentCard(tamperedCard)).toBe(false);
  });

  it("detects signature tampering", () => {
    const { privateKeyPem } = generateAgentCardKeyPair();
    const signResult = signAgentCard(SAMPLE_PAYLOAD, privateKeyPem);
    // Flip one byte in the signature
    const sigBytes = Buffer.from(signResult.signature, "base64");
    sigBytes[0] ^= 0xff;
    const card: SignedAgentCard = {
      payload: SAMPLE_PAYLOAD,
      signature: sigBytes.toString("base64"),
      publicKey: signResult.publicKey,
    };
    expect(verifyAgentCard(card)).toBe(false);
  });

  it("detects substitution of a different signer's public key", () => {
    const keyA = generateAgentCardKeyPair();
    const keyB = generateAgentCardKeyPair();
    const signResult = signAgentCard(SAMPLE_PAYLOAD, keyA.privateKeyPem);
    const cardWithWrongKey: SignedAgentCard = {
      payload: SAMPLE_PAYLOAD,
      signature: signResult.signature,
      publicKey: Buffer.from(keyB.publicKeyPem, "utf8").toString("base64"),
    };
    expect(verifyAgentCard(cardWithWrongKey)).toBe(false);
  });

  it("returns false (not throw) on malformed signature/key", () => {
    const card: SignedAgentCard = {
      payload: SAMPLE_PAYLOAD,
      signature: "not-base64-at-all!@#$",
      publicKey: "also-broken",
    };
    expect(verifyAgentCard(card)).toBe(false);
  });
});

describe("generateAgentCardKeyPair", () => {
  it("produces a PEM-formatted private + public key", () => {
    const { privateKeyPem, publicKeyPem } = generateAgentCardKeyPair();
    expect(privateKeyPem).toMatch(/-----BEGIN PRIVATE KEY-----/);
    expect(privateKeyPem).toMatch(/-----END PRIVATE KEY-----/);
    expect(publicKeyPem).toMatch(/-----BEGIN PUBLIC KEY-----/);
    expect(publicKeyPem).toMatch(/-----END PUBLIC KEY-----/);
  });

  it("each call produces a different key pair", () => {
    const a = generateAgentCardKeyPair();
    const b = generateAgentCardKeyPair();
    expect(a.privateKeyPem).not.toBe(b.privateKeyPem);
    expect(a.publicKeyPem).not.toBe(b.publicKeyPem);
  });
});
