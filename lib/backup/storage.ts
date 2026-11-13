/**
 * Which Blob token a database backup is uploaded with (BACKUP-CRON-500).
 *
 * Kept apart from `dump.ts` so the admin setup guide (lib/setup-status.ts)
 * reads the same answer the job acts on without importing the database
 * client. No "server-only": the operator CLI (scripts/backup-turso.ts) reaches
 * it through dump.ts.
 *
 * A Vercel Blob store is either public or private, and a backup is uploaded as
 * a PRIVATE blob because it holds PII — which only a private store accepts.
 * `BLOB_READ_WRITE_TOKEN` is also the token every media upload in the engine
 * writes PUBLIC blobs with, so on a shop that has a media store it points at a
 * public store, and a backup sent there is refused. Measured 2026-10-24: the
 * nightly backup answered 500 on all three canaries — two had no Blob token at
 * all, and Solbrillen's only store (`solbrillen-uploads`) is public, holding
 * zero blobs.
 *
 * So a backup has its own variable, `BACKUP_BLOB_READ_WRITE_TOKEN` (the
 * read-write token of a private store), tried first. `BLOB_READ_WRITE_TOKEN`
 * stays the fallback, so a shop whose single store is private keeps backing up
 * as before.
 */
export const BACKUP_BLOB_TOKEN_ENV = "BACKUP_BLOB_READ_WRITE_TOKEN";
export const SHARED_BLOB_TOKEN_ENV = "BLOB_READ_WRITE_TOKEN";

/**
 * Where the setup guide and the not-configured log line send an admin:
 * cartwright.app's backup page, which carries docs/backup-restore.md's steps
 * (synced in cartwright-app#421; `#scheduled` is the heading id it renders).
 * The shop's own repo holds the copy that matches its engine version, at
 * docs/backup-restore.md. Not Vercel's private-storage page: it creates the
 * store from the linked project with `--yes`, or connects it for OIDC, which
 * gives it the default BLOB_* names with Preview ticked — what the runbook
 * forbids.
 */
export const BACKUP_RUNBOOK_URL = "https://cartwright.app/docs/deployment/backup-restore#scheduled";

export type BackupBlobToken = {
  token: string;
  /** The variable the token came from — safe to log; the token itself never is. */
  envName: typeof BACKUP_BLOB_TOKEN_ENV | typeof SHARED_BLOB_TOKEN_ENV;
};

/**
 * A secret from the environment as the job uses it: non-printable characters,
 * surrounding whitespace and one pair of quotes removed. An empty, blank or
 * quoted-blank value is null, so it falls through to the next variable.
 */
export function readToken(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  return cleaned || null;
}

/** The token a backup is uploaded with, or null when the shop has none. */
export function resolveBackupBlobToken(
  env: Record<string, string | undefined> = process.env,
): BackupBlobToken | null {
  for (const envName of [BACKUP_BLOB_TOKEN_ENV, SHARED_BLOB_TOKEN_ENV] as const) {
    const token = readToken(env[envName]);
    if (token) return { token, envName };
  }
  return null;
}
