import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { withAudit, type AuditActor } from "@/lib/audit";
import { REDACTED } from "./pii-map";

/**
 * GDPR sletteret (art. 17) — SOFT, eksplicit-typet anonymisering. Aldrig
 * automatisk; udløses kun af en admin (AI-tool gdpr.erase_user). Følger
 * lib/gdpr/pii-map.ts: anonymisér PII, BEHOLD finansielle/lovlige felter
 * (ordrebeløb, stripePaymentIntentId — bogføringspligt), slet uverificerede
 * leads/ACP-sessions. Hver request logges i DataErasureRequest + AuditLog.
 *
 * Mutationerne er EKSPLICITTE typede Prisma-kald (ikke dynamiske felt-skrivninger
 * ud fra strenge) — sikrere og umuligt at ramme et utilsigtet felt.
 */

/** Deterministisk, salted email-hash: bevarer unikhed/linkage uden at afsløre adressen. */
function hashEmail(email: string): string {
  const salt = process.env.AUTH_SECRET ?? "cartwright-erasure-salt";
  const h = createHash("sha256")
    .update(`${salt}:${email.toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
  return `erased-${h}@anonymized.invalid`;
}

export type EraseResult =
  | { ok: true; requestId: string; summary: Record<string, number> }
  | { ok: false; error: string };

export async function anonymizeCustomer(
  userId: string,
  actor: AuditActor,
): Promise<EraseResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return { ok: false, error: `Ingen bruger med id '${userId}'.` };

  const email = user.email;
  const emailHash = hashEmail(email);

  // Opret request-rækken FØRST, så selv en fejl er sporet.
  const request = await prisma.dataErasureRequest.create({
    data: { userId, email, status: "pending", requestedBy: actor },
  });

  try {
    const summary = await withAudit(
      {
        actor,
        tool: "gdpr.erase",
        args: { userId, requestId: request.id },
        before: () => ({ email }),
      },
      async () => {
        const counts: Record<string, number> = {};

        // Ordrer: anonymisér modtager-PII, BEHOLD beløb + stripePaymentIntentId.
        const orders = await prisma.order.updateMany({
          where: { OR: [{ userId }, { email }] },
          data: {
            email: emailHash,
            shippingName: REDACTED,
            shippingAddress: REDACTED,
            shippingZip: REDACTED,
            shippingCity: REDACTED,
            phoneNumber: null,
          },
        });
        counts.ordersAnonymized = orders.count;

        // Reviews: anonymisér forfatter, behold rating/body (offentligt indhold).
        const reviews = await prisma.productReview.updateMany({
          where: { OR: [{ userId }, { authorEmail: email }] },
          data: { authorName: REDACTED, authorEmail: emailHash },
        });
        counts.reviewsAnonymized = reviews.count;

        // Leads + ACP-sessions: ingen lovlig grund til at beholde → slet helt.
        counts.leadsDeleted = (await prisma.lead.deleteMany({ where: { email } })).count;
        counts.acpSessionsDeleted = (
          await prisma.acpCheckoutSession.deleteMany({ where: { buyerEmail: email } })
        ).count;

        // API-keys: tilbagekald (login/adgang).
        const keys = await prisma.apiKey.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        counts.apiKeysRevoked = keys.count;

        // AuditLog: nul ip (argsJson redactes allerede ved skrivning).
        const audit = await prisma.auditLog.updateMany({
          where: { actor: `user:${userId}` },
          data: { ip: null },
        });
        counts.auditIpsCleared = audit.count;

        // User til sidst.
        await prisma.user.update({
          where: { id: userId },
          data: {
            email: emailHash,
            name: REDACTED,
            phoneNumber: null,
            shippingName: null,
            shippingAddress: null,
            shippingZip: null,
            shippingCity: null,
            passwordHash: null,
          },
        });
        counts.userAnonymized = 1;

        return counts;
      },
    );

    await prisma.dataErasureRequest.update({
      where: { id: request.id },
      data: {
        status: "done",
        summaryJson: JSON.stringify(summary),
        completedAt: new Date(),
      },
    });

    return { ok: true, requestId: request.id, summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Anonymisering fejlede.";
    await prisma.dataErasureRequest
      .update({ where: { id: request.id }, data: { status: "failed", errorMsg: msg } })
      .catch(() => {});
    return { ok: false, error: msg };
  }
}
