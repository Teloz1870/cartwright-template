# Backup & restore runbook

Cartwright's data lives in **Turso (libSQL)** (DB) + **Vercel Blob** (media).
Turso has its own physical backups; this adds a **portable logical backup** (a
JSON dump of every table) you control, plus a documented restore path.

## What gets backed up

- **Database**: every table as JSON rows (`scripts/backup-turso.ts` /
  `/api/cron/backup` → `lib/backup/dump.ts`). Includes a called-out
  `mediaAssetInventory` (the `MediaAsset` rows = URLs + metadata for Blob files).
- **NOT** the Blob binaries themselves — those live in Vercel Blob, which has its
  own redundancy. The inventory lets you re-link them on restore.

> ⚠️ A dump contains **PII**. It is written to `backups/` (gitignored) and, when
> uploaded, stored as a **private** Vercel Blob. Never commit it, never make it
> public.

## Backup

### Manual (operator)

```bash
# Dry-run (default) — counts per table, writes nothing:
TURSO_DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" \
  npx tsx scripts/backup-turso.ts

# Write a local dump:
… npx tsx scripts/backup-turso.ts --write          # → backups/backup-<ts>.json

# Write + upload to Vercel Blob (private):
BLOB_READ_WRITE_TOKEN="…" … npx tsx scripts/backup-turso.ts --write --upload
```

Get `TURSO_*` from Vercel → project → Settings → Environment Variables.

### Scheduled

`/api/cron/backup` runs daily at 02:00 UTC (`vercel.json`), uploading a private
Blob. It needs `CRON_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`BLOB_READ_WRITE_TOKEN` on the Vercel project. Preview without writing:
`GET /api/cron/backup?dryRun=1` (with `Authorization: Bearer $CRON_SECRET`).

## Restore

Restore is **destructive** and **never automatic** — `scripts/restore-turso.ts`
requires an explicit `--confirm`; without it, it's a dry-run.

```bash
# 1. Create / target a FRESH Turso DB. Apply the schema first:
TURSO_DATABASE_URL="libsql://<TARGET>…" TURSO_AUTH_TOKEN="…" \
  npx tsx scripts/migrate-turso.ts

# 2. Dry-run the restore (shows tables + counts):
TURSO_DATABASE_URL="libsql://<TARGET>…" TURSO_AUTH_TOKEN="…" \
  npx tsx scripts/restore-turso.ts backups/backup-<ts>.json

# 3. Restore for real (into the fresh DB):
… npx tsx scripts/restore-turso.ts backups/backup-<ts>.json --confirm
```

The restore disables `foreign_keys` during insert (order-independent), re-enables
after, and skips `_prisma_migrations` (the ledger comes from `migrate-turso`).

### Media

Blob files are not in the dump. If the Blob store is intact, the restored
`MediaAsset.url` rows still point at the live CDN URLs — nothing to do. If you
lost the Blob store, re-upload from your own mirror and update the `url` /
`blobPathname` columns.

## Verify a restore

1. `npx tsx scripts/backup-turso.ts` (dry-run) against the restored DB → counts
   match the backup.
2. Boot the app against the restored DB and smoke-test `/da` + `/admin`.

## Safety notes

- These scripts are **operator commands** — they are not run by CI or agents, and
  the cron only writes (never restores).
- Default modes are non-destructive (backup dry-run; restore dry-run).
- Always restore into a **fresh** DB, never over a live one.
