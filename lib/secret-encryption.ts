import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import * as Sentry from "@sentry/nextjs";

/**
 * AES-256-GCM symmetrisk kryptering for serverside-secrets der skal kunne
 * dekryptes (modsat password-hashing — vi SKAL bruge værdien til at kalde
 * eksterne API'er, så envejs er ikke en mulighed).
 *
 * Key Encryption Key (KEK) udledes fra AUTH_SECRET via SHA-256 så vi
 * genbruger eksisterende secret-management. Krypterede payloads bærer
 * deres egen IV + auth-tag, så vi kan rotere KEK senere via re-encryption
 * uden at miste eksisterende data.
 *
 * Format: base64( IV(12) || authTag(16) || ciphertext )
 */

function getKek(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET mangler — kræves som KEK for secret-encryption",
    );
  }
  // SHA-256 til at få deterministisk 256-bit nøgle ud af variable-length secret
  return createHash("sha256").update(secret).digest();
}

/**
 * Krypter plaintext med AES-256-GCM. Returnerer base64-encoded string
 * der kan gemmes i DB.
 *
 * Throws hvis AUTH_SECRET mangler — bevidst, så vi opdager
 * mis-konfiguration tidligt.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const iv = randomBytes(12); // GCM-standard 96-bit IV
  const cipher = createCipheriv("aes-256-gcm", getKek(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 128-bit
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * Dekrypter et payload tidligere lavet af encryptSecret. Returnerer null
 * hvis dekryptering fejler (corrupted ciphertext, forkert KEK, etc.) — det
 * lader caller fall-through til env-fallback i stedet for at crashe.
 *
 * Bag-kompatibilitet: hvis input IKKE ligner et base64-payload (fx tidligere
 * gemt plaintext der ikke blev krypteret), returnerer vi det uændret. Den
 * heuristik er ikke 100% sikker men dækker migrations-tilfældet hvor gamle
 * plaintext-keys stadig er i DB indtil admin gemmer en ny.
 */
export function decryptSecret(encrypted: string): string | null {
  if (!encrypted) return null;

  // Heuristisk fallback for legacy plaintext keys (sk-ant-/AIza prefix). Dem
  // returnerer vi som-er; næste gang admin opdaterer, krypteres de.
  if (
    encrypted.startsWith("sk-ant-") ||
    encrypted.startsWith("sk_live_") ||
    encrypted.startsWith("AIza")
  ) {
    return encrypted;
  }

  try {
    const buf = Buffer.from(encrypted, "base64");
    if (buf.length < 12 + 16 + 1) return null; // for kort til IV + tag + 1 byte
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getKek(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch (err) {
    // Phase 4: log loud til Sentry. Stille decryption-failure er en
    // catastrophic mis-configuration (AUTH_SECRET rotated, ciphertext
    // korrupteret, etc.) der kan få os til at silent-fallback til env-key
    // som måske er et helt andet (test vs live) → wrong service-key i prod.
    Sentry.captureException(err, {
      tags: { source: "secret-encryption" },
      // Bevidst INGEN ciphertext i extra — vi vil ikke logge encrypted-data
      // i case Sentry-storage bliver hacket.
    });
    return null;
  }
}

/**
 * Constant-time string comparison så vi ikke lækker timing-info hvis
 * caller sammenligner secrets med plain ===.
 */
export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
