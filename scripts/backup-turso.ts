/**
 * Logisk backup af Turso/libSQL → JSON, valgfrit uploadet til Vercel Blob
 * (PRIVATE). Tynd CLI-wrapper omkring lib/backup/dump.ts (delt med
 * /api/cron/backup). Komplementerer Tursos egne fysiske backups med en portabel
 * logisk dump + MediaAsset-inventar.
 *
 * Usage:
 *   # Dry-run (DEFAULT) — counts pr. tabel, skriver INTET:
 *   TURSO_DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" \
 *     npx tsx scripts/backup-turso.ts
 *
 *   # Skriv lokal dump (backups/backup-<ts>.json):
 *     … npx tsx scripts/backup-turso.ts --write
 *
 *   # Skriv OG upload til Vercel Blob (privat; kræver BLOB_READ_WRITE_TOKEN):
 *     … BLOB_READ_WRITE_TOKEN="…" npx tsx scripts/backup-turso.ts --write --upload
 *
 * SIKKERHED: køres IKKE mod prod af CI/agenter — operatør-kommando. Default er
 * dry-run. Backup-filen rummer PII → opbevares privat, commit ALDRIG.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  dumpDatabase,
  previewCounts,
  serializeBackup,
  uploadBackupToBlob,
  backupFilename,
} from "../lib/backup/dump";

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--write");
const UPLOAD = args.has("--upload");

function info(msg: string) {
  console.log(`ℹ️   ${msg}`);
}
function ok(msg: string) {
  console.log(`✅  ${msg}`);
}

async function main() {
  info(`Mode: ${DRY_RUN ? "DRY-RUN (skriver intet)" : UPLOAD ? "WRITE + UPLOAD" : "WRITE (lokal)"}`);

  if (DRY_RUN) {
    const { host, counts } = await previewCounts();
    info(`Target DB: libsql://${host}`);
    for (const [t, n] of Object.entries(counts)) info(`  ${t}: ${n} rækker`);
    ok("Dry-run færdig — intet skrevet. Kør med --write for at gemme.");
    return;
  }

  const payload = await dumpDatabase();
  info(`Target DB: libsql://${payload.host} — ${payload.tableCount} tabeller`);
  for (const [t, n] of Object.entries(payload.counts)) info(`  ${t}: ${n} rækker`);

  const json = serializeBackup(payload);
  const filename = backupFilename(payload.createdAt);
  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const filepath = join(dir, filename);
  writeFileSync(filepath, json, "utf8");
  ok(`Skrev lokal dump: ${filepath} (${(json.length / 1024).toFixed(0)} KB)`);

  if (UPLOAD) {
    const { pathname } = await uploadBackupToBlob(json, filename);
    ok(`Uploadet til Vercel Blob (private): ${pathname}`);
  }
}

main().catch((err) => {
  console.error(`\n❌  ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
