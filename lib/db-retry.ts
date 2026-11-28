import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";

/**
 * One rule for a busy database, shared by every writer that waits one out:
 * lib/woo/ledger.ts (the webshop module's import ledger) and
 * lib/migration/store.ts (the admin module's /admin/migration writes). It sits
 * in the db module because both of those ship with it, and a light scaffold
 * prunes lib/woo while it keeps lib/migration (scaffold/manifest.json). It holds
 * no client: the caller passes the one it writes with, so a script that runs
 * the ledger outside Next never loads lib/db through it.
 */

export const DB_RETRY_ATTEMPTS = 5;
/** Grows per attempt: a file database answers BUSY within milliseconds (busy_timeout 0, measured), so retries with no pause would all meet the same lock. */
export const DB_RETRY_BACKOFF_MS = 50;

const RETRYABLE = /^(?:P2034|SQLITE_BUSY\w*|40001|40P01|55P03)\b/;

/**
 * Whether a transaction may run again from the top: BUSY, a serialization
 * failure or deadlock, a lock wait that timed out. Prisma hides the driver's
 * code: a libSQL BUSY arrives as P1008 on a model call, P2010 on a raw one and a
 * bare driver error from COMMIT (measured on Prisma 7.10.1). So it is read where
 * the driver put it, and never from a Prisma message, which can quote shop data.
 * Everything else stops, also P2028: a transaction too slow for its timeout stays so.
 */
export function isRetryableDbError(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth > 4) return false;
  const { code, originalCode, originalMessage, cause, meta } = error as { code?: unknown; originalCode?: unknown; originalMessage?: unknown; cause?: unknown; meta?: { driverAdapterError?: unknown } };
  return [code, originalCode, originalMessage].some((v) => typeof v === "string" && RETRYABLE.test(v)) || isRetryableDbError(meta?.driverAdapterError, depth + 1) || isRetryableDbError(cause, depth + 1);
}

/**
 * Runs `transaction` — one whole transaction, built afresh on each call — and
 * waits out a refusal `isRetryableDbError` names, bounded, with a pause that
 * grows per attempt. Anything else is thrown as it came, on the first attempt.
 * Safe to run again only because a refused transaction rolled back: pass a
 * transaction, never a bare statement (see `retryingTransaction`).
 */
export async function withDbRetry<T>(transaction: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await transaction();
    } catch (error) {
      if (attempt >= DB_RETRY_ATTEMPTS || !isRetryableDbError(error)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, DB_RETRY_BACKOFF_MS * attempt));
  }
}

/**
 * A write in a transaction of its own, also when it is one statement, with a
 * BUSY waited out. On a libSQL file another process writes to (`next dev`
 * beside `pnpm woo:import`, a self-hosted ALLOW_SQLITE_IN_PRODUCTION site), a
 * write refused BUSY outside a transaction leaves its connection unable to
 * commit, and the next write on the client reports success — count 1 — commits
 * nothing and keeps the write lock (measured on @libsql/client 0.17.4, as
 * lib/woo/ledger.ts `casLedger` found). A transaction's connection goes with its
 * rollback, so `write` runs again from the top on a fresh one.
 */
export function retryingTransaction<T>(db: Pick<PrismaClient, "$transaction">, write: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return withDbRetry(() => db.$transaction(write));
}
