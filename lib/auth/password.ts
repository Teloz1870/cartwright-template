import { randomBytes } from "node:crypto";

/**
 * Admin/credential password-utilities. Rene, node-only helpers (node:crypto +
 * streng-validering) — INGEN secrets/DB, så IKKE `server-only`: prisma/seed.ts
 * (et standalone tsx-script) importerer generateStrongPassword, og server-only
 * ville kaste der. node:crypto gør den allerede umulig at bundle i en klient.
 *
 * Brugt af seed (genererer et stærkt default-admin-password i stedet for en
 * hardcodet streng) og af /admin/konto's skift-password-action.
 */

/**
 * Genererer et stærkt, tilfældigt password. 15 bytes → 20 base64url-tegn
 * (~120 bits entropi). Bruges når ingen ADMIN_PASSWORD/DEMO_ADMIN_PASSWORD er
 * sat, så en frisk shop ALDRIG får et gæt-bart default som "admin1234".
 */
export function generateStrongPassword(): string {
  return randomBytes(15).toString("base64url");
}

const MIN_LENGTH = 12;

export type PasswordCheck = { ok: true } | { ok: false; error: string };

/**
 * Minimal styrke-validering for et nyt password. Bevidst enkel (længde) — nok
 * til at afvise svage/tomme valg uden at irritere med komplekse regler.
 */
export function validatePasswordStrength(password: string): PasswordCheck {
  if (typeof password !== "string" || password.trim().length === 0) {
    return { ok: false, error: "Adgangskode må ikke være tom." };
  }
  if (password.length < MIN_LENGTH) {
    return {
      ok: false,
      error: `Adgangskoden skal være mindst ${MIN_LENGTH} tegn.`,
    };
  }
  return { ok: true };
}
