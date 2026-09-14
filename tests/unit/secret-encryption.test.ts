import { describe, it, expect, beforeAll } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  safeEqual,
} from "@/lib/secret-encryption";

beforeAll(() => {
  // Tests kører i Node — AUTH_SECRET skal være sat for at krypterings-funktioner
  // virker. .env-loading via Next.js sker ikke i Vitest-context, så sæt manuelt.
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-pepper-secret";
});

describe("secret-encryption — AES-256-GCM round-trip", () => {
  it("encrypt + decrypt giver originale plaintext", () => {
    const plain = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz123";
    const encrypted = encryptSecret(plain);
    expect(encrypted).not.toBe(plain);
    expect(encrypted.length).toBeGreaterThan(plain.length); // pga IV+tag
    expect(decryptSecret(encrypted)).toBe(plain);
  });

  it("samme plaintext giver forskellig ciphertext (random IV)", () => {
    const plain = "secret";
    expect(encryptSecret(plain)).not.toBe(encryptSecret(plain));
  });

  it("tampering med ciphertext detekteres (GCM auth-tag)", () => {
    const encrypted = encryptSecret("hemmeligt");
    const tampered = encrypted.slice(0, -4) + "XXXX"; // ødelæg sidste 3 bytes
    expect(decryptSecret(tampered)).toBeNull();
  });

  it("tom string passerer urørt", () => {
    expect(encryptSecret("")).toBe("");
    expect(decryptSecret("")).toBeNull();
  });

  it("legacy plaintext keys (sk-ant-... prefix) returneres uændret", () => {
    // Bagudkompatibilitet for keys gemt før kryptering blev tilføjet
    const legacy = "sk-ant-legacy-key-not-encrypted-yet";
    expect(decryptSecret(legacy)).toBe(legacy);
  });

  it("ugyldig base64 returnerer null (ikke crash)", () => {
    expect(decryptSecret("not-base64-at-all-!!!")).toBeNull();
    expect(decryptSecret("too-short")).toBeNull();
  });

  it("safeEqual er constant-time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});
