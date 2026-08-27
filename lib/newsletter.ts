import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Newsletter-backend. UI'et (NewsletterSignup) var en mock — dette gør den rigtig:
 * fanger tilmeldinger + giver admin en liste + CSV-eksport (til kundens ESP).
 *
 * Single-opt-in som default (brugeren indsender selv formularen = samtykke);
 * hver subscriber får et token til unsubscribe-link (GDPR). Double-opt-in +
 * welcome-mail er en upgrade (token + confirm-route findes allerede) når shoppen
 * har en mailer konfigureret — se docs.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SubscribeResult =
  | { ok: true; status: string }
  | { ok: false; error: string };

export async function subscribe(
  emailRaw: string,
  source?: string,
): Promise<SubscribeResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Ugyldig email-adresse." };

  const existing = await prisma.subscriber.findUnique({ where: { email } });
  if (existing && existing.status !== "unsubscribed") {
    return { ok: true, status: existing.status }; // idempotent
  }

  const token = randomUUID();
  await prisma.subscriber.upsert({
    where: { email },
    update: {
      status: "confirmed",
      token,
      unsubscribedAt: null,
      confirmedAt: new Date(),
      source: source ?? existing?.source ?? null,
    },
    create: {
      email,
      status: "confirmed",
      token,
      source: source ?? null,
      confirmedAt: new Date(),
    },
  });
  return { ok: true, status: "confirmed" };
}

export async function unsubscribe(
  token: string,
): Promise<{ ok: true; email: string } | { ok: false }> {
  const sub = await prisma.subscriber.findUnique({ where: { token } });
  if (!sub) return { ok: false };
  await prisma.subscriber.update({
    where: { token },
    data: { status: "unsubscribed", unsubscribedAt: new Date() },
  });
  return { ok: true, email: sub.email };
}

/** Bekræft en pending subscriber (double-opt-in-sti — bruges hvis status sættes pending). */
export async function confirm(
  token: string,
): Promise<{ ok: true; email: string } | { ok: false }> {
  const sub = await prisma.subscriber.findUnique({ where: { token } });
  if (!sub) return { ok: false };
  await prisma.subscriber.update({
    where: { token },
    data: { status: "confirmed", confirmedAt: new Date() },
  });
  return { ok: true, email: sub.email };
}

export async function listSubscribers() {
  return prisma.subscriber.findMany({ orderBy: { createdAt: "desc" } });
}

export async function subscriberStats() {
  const [confirmed, unsubscribed, total] = await Promise.all([
    prisma.subscriber.count({ where: { status: "confirmed" } }),
    prisma.subscriber.count({ where: { status: "unsubscribed" } }),
    prisma.subscriber.count(),
  ]);
  return { confirmed, unsubscribed, total };
}

export function subscribersToCsv(
  subs: { email: string; status: string; source: string | null; createdAt: Date }[],
): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = subs.map((s) =>
    [esc(s.email), esc(s.status), esc(s.source ?? ""), esc(s.createdAt.toISOString())].join(","),
  );
  return ["email,status,source,createdAt", ...rows].join("\n");
}
