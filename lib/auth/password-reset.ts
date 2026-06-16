import "server-only";

import { randomBytes, createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/mailer";

const TTL_MS = 60 * 60 * 1000; // 1 time

/**
 * HMAC-SHA256-hash af reset-tokenet, peberet med AUTH_SECRET (samme princip som
 * API-keys i lib/api-auth.ts): DB gemmer KUN hashen, det rå token findes kun i
 * reset-linket, så en DB-leak alene giver ingen brugbare reset-links.
 */
function hashToken(token: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET mangler — kan ikke hashe reset-token");
  }
  return createHmac("sha256", secret).update(token).digest("hex");
}

/**
 * Anmod om password-reset for en email. Afslører ALDRIG om kontoen findes
 * (kalderen viser altid samme "hvis emailen findes…"-besked). Sender kun en mail
 * hvis en bruger faktisk eksisterer. Gælder alle brugere (kunde + admin) — også
 * magic-link-only konti, som derved kan SÆTTE et password.
 */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return; // tavst — læk ikke at kontoen ikke findes

  const token = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  const url = `${brand.url}/account/reset-password?token=${token}`;
  await sendPasswordResetEmail({ email, url });
}

export type ConsumeResult = { ok: true } | { ok: false; error: string };

/**
 * Indløs et reset-token og sæt et nyt password. Validerer at tokenet findes,
 * ikke er brugt og ikke er udløbet, og er single-use (sætter usedAt). newPassword
 * antages allerede længde-valideret af kalderen (resetPasswordSchema).
 */
export async function consumePasswordResetToken(
  token: string,
  newPassword: string,
): Promise<ConsumeResult> {
  if (!token) return { ok: false, error: "Linket er ugyldigt eller udløbet." };

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      error: "Linket er ugyldigt eller udløbet. Bed om et nyt.",
    };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true };
}
