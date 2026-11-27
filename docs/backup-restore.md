# Backup & restore runbook

Cartwright's data lives in **Turso (libSQL)** (DB) + **Vercel Blob** (media).
Turso has its own physical backups; this adds a **portable logical backup** (a
JSON dump of every table) you control, plus a documented restore path.

The code blocks in this runbook hold commands only, never a comment. In an
interactive zsh, the macOS default shell, `#` starts a comment only when the
`interactive_comments` option is set, and it is off by default: a comment typed
or pasted after a command becomes that command's arguments.

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

A dry run, the default, counts the rows of each table and writes nothing:

```bash
TURSO_DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" \
  npx tsx scripts/backup-turso.ts
```

`--write` writes a local dump to `backups/backup-<ts>.json`, and `--upload`
also uploads it to the private backup store (see "Scheduled" below). `…` stands
for the two `TURSO_*` variables above:

```bash
… npx tsx scripts/backup-turso.ts --write
BACKUP_BLOB_READ_WRITE_TOKEN="…" … npx tsx scripts/backup-turso.ts --write --upload
```

For the token, see "Fetch a nightly backup" under Restore. A failure prints the
error with the Turso token, the Blob token and any `authToken=` value cut out.

Get `TURSO_*` from Vercel → project → Settings → Environment Variables.

### Scheduled

`/api/cron/backup` runs daily at 02:00 UTC (`vercel.json`), uploading a private
Blob. It needs `CRON_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and
**`BACKUP_BLOB_READ_WRITE_TOKEN`** on the Vercel project.

**The backup store must be private.** A Vercel Blob store is public or private,
fixed when it is created, and a backup (which holds PII) is uploaded as a private
blob, which needs a private store. Media uploads write public blobs, so a shop's
media store (`BLOB_READ_WRITE_TOKEN`) is usually public. If the shop's only
store is private, there is nothing to do: backups fall back to
`BLOB_READ_WRITE_TOKEN`. If its media store is public, or it has no store at
all, give backups a private store of their own.

Set that store up **without connecting it to the project**. Connecting a store
is what writes Blob variables into a project — the store's token and, for OIDC,
`BLOB_STORE_ID` — and every connect flow preselects Preview. A store that is
never connected touches none of them: you add one variable yourself, in
Production only, under the exact name the engine reads. Run each command in the
directory linked to the project unless the step says otherwise; `<team>` is the
team's slug and `<store_id>` the `store_…` id that step 2 prints.

1. List every variable in **every** environment: `vercel env ls`, with no
   environment argument (`vercel env ls production` hides Preview and
   Development), or project → Settings → Environment Variables showing all
   environments. Note each `BLOB_*` and `BACKUP_*` row and its environments.
2. Create the store from an empty directory that is linked to no project, so
   the CLI has no project to connect it to. Choose its region now, because it
   cannot be changed later. Without `--region` the store is created in `iad1`
   (Washington, D.C.), and a backup holds the shop's customer data. A shop in
   the EU should keep that data in the EU (GDPR), so pass an EU region: `fra1`
   (Frankfurt), `arn1` (Stockholm), `cdg1` (Paris) or `dub1` (Dublin). Vercel's
   [region list](https://vercel.com/docs/regions#region-list) has them all; a
   Blob store can be created in any of them.

   ```bash
   (d=$(mktemp -d) && cd "$d" &&
     env -u VERCEL_ORG_ID -u VERCEL_PROJECT_ID -u NOW_ORG_ID -u NOW_PROJECT_ID \
       vercel blob create-store <project>-backups --access private --region <region> --scope <team>)
   ```

   The parentheses run it in a subshell, so your shell stays in the linked
   directory. The `&&` chain stops before `vercel` runs if the empty directory
   cannot be made or entered. `env -u` removes the variables that link even an
   empty directory to a project: `VERCEL_ORG_ID` with `VERCEL_PROJECT_ID`, or
   the older `NOW_ORG_ID` with `NOW_PROJECT_ID`. The command prints
   `Blob store created: <name> (store_…) in <region>` and nothing about linking
   (Vercel CLI 54.4.1 connects a new store only when the directory is linked).
   Then check the store. This must print `Access: Private` and, under
   `Region:`, the region you chose:

   ```bash
   vercel blob get-store <store_id> --scope <team>
   ```

3. In the linked directory, add the store's read-write token as a
   Production-only Secret, without printing it:

   ```bash
   vercel api /v1/storage/stores/<store_id> --scope <team> | jq -e '.store.access == "private"' &&
     TOKEN=$(vercel api /v1/storage/stores/<store_id>/secrets --scope <team> \
       | jq -je --arg id <store_id> '.rwToken | strings | select(ascii_downcase | startswith("vercel_blob_rw_" + ($id | ltrimstr("store_") | ascii_downcase) + "_"))') &&
     printf %s "$TOKEN" | vercel env add BACKUP_BLOB_READ_WRITE_TOKEN production --sensitive
   unset TOKEN
   ```

   The chain stops at the first check that fails. The first `jq` prints `true`
   only for a private store, so a `<store_id>` copied from the public media
   store stops there. The second passes the token on only if it is a read-write
   token of `<store_id>` itself: a read-write token carries its store's id, the
   part after `vercel_blob_rw_`, which is where Vercel's SDK and CLI read it
   from. So a failed call never stores an empty or `null` value, nor another
   store's token. That endpoint is not in Vercel's REST reference: it is the
   call Vercel's own Terraform provider makes for `vercel_blob_store_secrets`,
   "the default Blob read/write token for the store". If it fails, use the
   fallback below; until then the new store is connected to nothing and
   changes nothing.
4. List again with `vercel env ls` (every environment). Exactly one row is new,
   `BACKUP_BLOB_READ_WRITE_TOKEN` in Production only, and every row from step 1
   is unchanged. Then check that the backup store is connected to no project.
   This must print `true`:

   ```bash
   vercel blob list-stores --all --json --scope <team> | jq -e --arg id <store_id> '.stores[] | select(.id == $id) | .projects == []'
   ```

   It works in any directory. Plain `vercel blob list-stores` is no check: it
   lists only the stores connected to the project in `.vercel/project.json`,
   and in a directory linked with `vercel link --repo` (`.vercel/repo.json`, no
   `project.json`) it lists every store of the team, connected or not.
5. Redeploy production. The "Database backup storage" row of the setup guide
   (`/admin/integrations` → Setup-guide) must then say **ok**. If you know
   `CRON_SECRET`'s value (a Secret cannot be read back from Vercel),
   `GET /api/cron/backup?dryRun=1` (below) must answer
   `"storage":"BACKUP_BLOB_READ_WRITE_TOKEN"`. Either way, the next 02:00 UTC
   run must log `"outcome":"ok"`.

**Fallback: connect the store under a prefix.** Only if step 3's call fails.
Dashboard → the store → **Projects** → **Connect to Project** → the project.
Vercel preselects **Production and Preview**: untick **Preview** and leave
Development off, so only Production is ticked, because a preview deploy of any
pushed branch must never hold this token. Under **Advanced Options**, change the
prefix from `BLOB` to exactly **`BACKUP_BLOB`** (no trailing underscore), and
turn on Sensitive if it is offered. Then do step 4 with two changes. Its
`vercel env ls` check covers more: the token row must be named
`BACKUP_BLOB_READ_WRITE_TOKEN` and be in Production only, and any new row in
Preview must be removed. Its last check does not apply, because this store is now
meant to be connected: instead, check that it is connected to this one project
and no other (`vercel blob list-stores --all --scope <team>` lists each store
with the projects it is connected to). If a `BLOB_STORE_ID` appeared,
delete it. If the one from step 1 changed, set it back to the media store's id
(the same listing gives each store's id). Do all of this before you redeploy. The
token's name is inferred, not documented: Vercel's docs say only that the prefix
can be changed, and `<prefix>_READ_WRITE_TOKEN` follows from the default
(`BLOB` → `BLOB_READ_WRITE_TOKEN`) and from how Vercel's Terraform provider
derives the name. If step 4 shows any other name, the engine never reads it. If
the dashboard shows that row's value, add it yourself as above
(`vercel env add BACKUP_BLOB_READ_WRITE_TOKEN production --sensitive`).
Otherwise, disconnect the store (its **Projects** tab → ⋯), check that
`vercel env ls` matches step 1 again, and leave backups off until step 3 works.

**Never connect the backup store under the default `BLOB` names.** Media
uploads call `put()` without a token, and `@vercel/blob` then authenticates with
Vercel's OIDC token plus `BLOB_STORE_ID` before it tries `BLOB_READ_WRITE_TOKEN`.
A `BLOB_STORE_ID` that names the private backup store would send every public
media upload there, where it is refused. The backup itself is never redirected:
it passes its token explicitly, which the SDK always uses first. That is also
why step 2 runs in an unlinked directory. `vercel blob create-store` has no
prefix option, and in a linked directory it offers to connect the store under
the default `BLOB` names. That offer defaults to Yes (`--yes` answers it), and
it ticks every environment.

With neither variable set, the job answers
`503 {"error":"backup storage not configured"}` and takes no backup; the admin
setup guide (`/admin/integrations` → Setup-guide → "Database backup storage")
shows the same state. Every real run that reaches its end writes one
`[cron/backup] {…}` line to the function log, never a token:

- `"outcome":"ok"`, with `pathname`, `tableCount`, `bytes` (the upload's size in
  UTF-8 bytes, the same figure the response gives) and `storage`, the variable
  it uploaded with;
- `"outcome":"not_configured"`, with `missing` (the variable to set) and
  `detail` (how to set it, with a link to these steps);
- `"outcome":"failed"`, with `stage` (`dump` or `upload`), `storage` and
  `error`; a failed upload adds a `hint`.

A failed dry run writes a `failed` line too: `"stage":"dump"`, `"dryRun":true`
and `error`, but no `storage`. A successful dry run and a call the `CRON_SECRET`
gate refuses write none. If Vercel stops a run (at the 300 s `maxDuration`, or
when it runs out of memory), the run writes no line of its own and only Vercel's
timeout or error line shows. So a night with neither an `ok` line nor a `failed`
line took no backup either.

Preview without writing: `GET /api/cron/backup?dryRun=1` (with
`Authorization: Bearer $CRON_SECRET`) — it returns the row counts and
`storage`, the variable a real run would upload with (`null` if none).

## Restore

Restore is **destructive** and **never automatic** — `scripts/restore-turso.ts`
requires an explicit `--confirm`; without it, it's a dry-run.

### Fetch a nightly backup

The nightly job stores `backups/backup-<ts>.json` as a private blob in the
backup store. Fetch it with that store's token, passed explicitly. Without
`--rw-token`, the CLI authenticates with `BLOB_STORE_ID` plus Vercel's OIDC
token, or with `BLOB_READ_WRITE_TOKEN`, from your environment or `.env.local`,
and those name the media store, if there is one. `BACKUP_BLOB_READ_WRITE_TOKEN`
is a Secret, so its value cannot be read back from Vercel; take the token from
the store again instead. The store id is in
`vercel blob list-stores --all --scope <team>`.

First list the backups, with the token taken from the store. `<ts>` is the
backup's UTC date and time (`2026-10-24T02-00-03-123Z`), so the year and month
in the prefix, as below, narrow the list to one month. Keep it narrow: a page
holds at most 1000 names (`--limit`) and nothing deletes old backups, so after
about 1000 nights the one you want need not be on the first page. When there is
a next page, the CLI prints the command for it without the token; add
`--rw-token "$TOKEN"` to that command.

```bash
TOKEN=$(vercel api /v1/storage/stores/<store_id>/secrets --scope <team> \
  | jq -je --arg id <store_id> '.rwToken | strings | select(ascii_downcase | startswith("vercel_blob_rw_" + ($id | ltrimstr("store_") | ascii_downcase) + "_"))') &&
  vercel blob list --prefix backups/backup-<yyyy>-<mm> --limit 1000 --rw-token "$TOKEN"
```

Then, in the same shell, fetch the one you chose by the pathname the list
shows:

```bash
test -n "$TOKEN" && mkdir -p backups &&
  vercel blob get backups/backup-<ts>.json --access private --rw-token "$TOKEN" --output backups/backup-<ts>.json
unset TOKEN
```

Both stop without a token, because an empty `--rw-token` would fall back to the
media store's credentials.

The file holds PII. `backups/` is gitignored; delete the file once the restore
is done.

### Restore into a fresh database

1. Create or pick a **fresh** Turso database and apply the schema to it:

   ```bash
   TURSO_DATABASE_URL="libsql://<TARGET>…" TURSO_AUTH_TOKEN="…" \
     npx tsx scripts/migrate-turso.ts
   ```

2. Dry-run the restore. It shows the tables and their row counts:

   ```bash
   TURSO_DATABASE_URL="libsql://<TARGET>…" TURSO_AUTH_TOKEN="…" \
     npx tsx scripts/restore-turso.ts backups/backup-<ts>.json
   ```

3. Restore for real, into the fresh database, with the same two variables
   (`…`):

   ```bash
   … npx tsx scripts/restore-turso.ts backups/backup-<ts>.json --confirm
   ```

A failure prints the error with the Turso token and any `authToken=` value cut
out, as the backup does.

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
