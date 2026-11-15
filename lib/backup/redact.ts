/**
 * An error's message with a backup's secrets cut out (BACKUP-CRON-500).
 *
 * Shared by /api/cron/backup (function log + response) and the operator CLIs
 * (scripts/backup-turso.ts and scripts/restore-turso.ts, terminal or CI log), so
 * none prints what another redacts. No "server-only": the CLIs import it from a
 * plain tsx script.
 *
 * Cut out: every secret passed in (the Blob token the upload used), the Turso
 * token as libsql received it — `readToken`, so a quoted TURSO_AUTH_TOKEN is
 * matched without its quotes — and any `authToken=` query value, because
 * libsql quotes back, whole, a TURSO_DATABASE_URL that fails its URI pattern
 * (one with no scheme, say), and that URL may carry `?authToken=…`. The match
 * ignores case: libsql reads only `authToken`, but a value pasted under
 * another spelling is still a secret. Only `message` is read, so an error's
 * `cause` never reaches a log; anything thrown that is not an Error becomes
 * "backup failed".
 */
import { readToken } from "./storage";

export function backupErrorMessage(
  err: unknown,
  secrets: Array<string | null | undefined> = [],
): string {
  let message = err instanceof Error ? err.message : "backup failed";
  for (const secret of [...secrets, readToken(process.env.TURSO_AUTH_TOKEN)]) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message.replace(/(authToken=)[^&\s'"]+/gi, "$1[redacted]");
}
