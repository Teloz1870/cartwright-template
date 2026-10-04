import "server-only";

import { prisma } from "@/lib/db";
import { brand } from "@/brand.config";

/**
 * Retention / oprydning. To uafhængige jobs, begge fail-soft og dry-run-bare:
 *
 *  - cleanupExpiredTokens: sletter KUN allerede-udløbne rækker (verification-
 *    tokens, ACP-sessions/idempotency, forældede gæste-kurve). Rører aldrig
 *    aktive data.
 *  - pruneAuditLog: sletter AuditLog ældre end brand.policies.auditRetentionDays.
 *    DEFAULT-OFF (null = no-op) — audit-log er dokumentation/lovligt grundlag.
 */

const DAY_MS = 86_400_000;
const ACP_IDEMPOTENCY_TTL_DAYS = 7;
const STALE_GUEST_CART_DAYS = 30;

export type CleanupOptions = { dryRun?: boolean; now?: Date };
export type CleanupCounts = Record<string, number>;

export async function cleanupExpiredTokens(
  opts: CleanupOptions = {},
): Promise<CleanupCounts> {
  const now = opts.now ?? new Date();
  const dry = opts.dryRun ?? false;
  const acpIdemCutoff = new Date(now.getTime() - ACP_IDEMPOTENCY_TTL_DAYS * DAY_MS);
  const cartCutoff = new Date(now.getTime() - STALE_GUEST_CART_DAYS * DAY_MS);
  const counts: CleanupCounts = {};

  // Udløbne magic-link-tokens.
  const vtWhere = { expires: { lt: now } };
  counts.verificationTokens = dry
    ? await prisma.verificationToken.count({ where: vtWhere })
    : (await prisma.verificationToken.deleteMany({ where: vtWhere })).count;

  // Udløbne ACP-checkout-sessions.
  const acpWhere = { expiresAt: { lt: now } };
  counts.acpCheckoutSessions = dry
    ? await prisma.acpCheckoutSession.count({ where: acpWhere })
    : (await prisma.acpCheckoutSession.deleteMany({ where: acpWhere })).count;

  // ACP idempotency-keys ældre end TTL (response-cache, ingen langtidsværdi).
  const idemWhere = { createdAt: { lt: acpIdemCutoff } };
  counts.acpIdempotencyKeys = dry
    ? await prisma.acpIdempotencyKey.count({ where: idemWhere })
    : (await prisma.acpIdempotencyKey.deleteMany({ where: idemWhere })).count;

  // Forældede GÆSTE-kurve (userId null) — slet items først (FK), så kurven.
  const cartWhere = { userId: null, updatedAt: { lt: cartCutoff } };
  if (dry) {
    counts.staleGuestCarts = await prisma.cart.count({ where: cartWhere });
  } else {
    await prisma.cartItem.deleteMany({ where: { cart: cartWhere } });
    counts.staleGuestCarts = (await prisma.cart.deleteMany({ where: cartWhere })).count;
  }

  return counts;
}

export type AuditPruneResult = {
  retentionDays: number | null;
  deleted: number;
  dryRun: boolean;
};

export async function pruneAuditLog(
  opts: CleanupOptions = {},
): Promise<AuditPruneResult> {
  const now = opts.now ?? new Date();
  const dry = opts.dryRun ?? false;
  const retentionDays = brand.policies.auditRetentionDays ?? null;

  // Default-OFF: ingen retention konfigureret → no-op.
  if (retentionDays == null || retentionDays <= 0) {
    return { retentionDays: null, deleted: 0, dryRun: dry };
  }

  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const where = { createdAt: { lt: cutoff } };
  const deleted = dry
    ? await prisma.auditLog.count({ where })
    : (await prisma.auditLog.deleteMany({ where })).count;

  return { retentionDays, deleted, dryRun: dry };
}
