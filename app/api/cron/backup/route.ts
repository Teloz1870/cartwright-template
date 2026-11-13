import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron/auth";

import {
  dumpDatabase,
  previewCounts,
  serializeBackup,
  uploadBackupToBlob,
  backupFilename,
} from "@/lib/backup/dump";
import { BACKUP_BLOB_TOKEN_ENV, BACKUP_RUNBOOK_URL, resolveBackupBlobToken } from "@/lib/backup/storage";
import { backupErrorMessage } from "@/lib/backup/redact";

/**
 * Planlagt logisk backup → Vercel Blob (PRIVATE). Auth via CRON_SECRET.
 * ?dryRun=1 = kun counts (ingen dump/upload) + hvilken token-variabel en backup
 * ville bruge. Kræver TURSO_* + en PRIVAT Blob-store: BACKUP_BLOB_READ_WRITE_TOKEN
 * (fallback BLOB_READ_WRITE_TOKEN) — se lib/backup/storage.ts. Schedule: 02:00 UTC
 * (vercel.json).
 *
 * BACKUP-CRON-500: uden en token svarer den 503 "not configured" FØR dumpet
 * (ikke 500 efter et helt dump), og hver rigtig kørsel der når til ende skrives
 * som én linje `[cron/backup] {json}` i function-loggen (ok, not_configured,
 * failed). Et vellykket dryRun og et kald CRON_SECRET-gaten afviser (401)
 * skriver ingen linje; et fejlet dryRun gør. En kørsel Vercel stopper
 * (maxDuration, hukommelse) skriver ingen — kun Vercels egen linje. Tidligere
 * blev fejlen fanget og returneret uden et ord i loggen, så Vercel viste kun "500".
 *
 * Komplementerer Tursos egne fysiske backups med en portabel logisk dump.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** One greppable line per outcome. Names of variables only — never a value. */
function logOutcome(level: "info" | "error", entry: Record<string, unknown>): void {
  const line = `[cron/backup] ${JSON.stringify(entry)}`;
  if (level === "error") console.error(line);
  else console.info(line);
}

export async function GET(request: NextRequest) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const storage = resolveBackupBlobToken();

  if (dryRun) {
    try {
      const { host, counts } = await previewCounts();
      return NextResponse.json({
        ok: true,
        dryRun: true,
        host,
        counts,
        storage: storage?.envName ?? null,
      });
    } catch (err) {
      logOutcome("error", { outcome: "failed", stage: "dump", dryRun: true, error: backupErrorMessage(err) });
      return NextResponse.json({ ok: false, stage: "dump", error: backupErrorMessage(err) }, { status: 500 });
    }
  }

  if (!storage) {
    logOutcome("error", {
      outcome: "not_configured",
      missing: BACKUP_BLOB_TOKEN_ENV,
      detail:
        "No Blob token for backups, so no backup was taken. Create a PRIVATE Vercel Blob store and " +
        `do not connect it to the project: add its read-write token yourself as ${BACKUP_BLOB_TOKEN_ENV}, ` +
        `Production only, and redeploy. Steps: ${BACKUP_RUNBOOK_URL}`,
    });
    return NextResponse.json(
      { ok: false, error: "backup storage not configured", missing: BACKUP_BLOB_TOKEN_ENV },
      { status: 503 },
    );
  }

  let stage: "dump" | "upload" = "dump";
  try {
    const payload = await dumpDatabase();
    const json = serializeBackup(payload);
    const filename = backupFilename(payload.createdAt);
    // The size that is uploaded, in UTF-8 bytes — a string's length counts UTF-16 units and undercounts æøå.
    const bytes = Buffer.byteLength(json, "utf8");
    stage = "upload";
    const { pathname } = await uploadBackupToBlob(json, filename, storage);
    logOutcome("info", {
      outcome: "ok",
      pathname,
      tableCount: payload.tableCount,
      bytes,
      storage: storage.envName,
    });
    return NextResponse.json({
      ok: true,
      pathname,
      tableCount: payload.tableCount,
      bytes,
    });
  } catch (err) {
    logOutcome("error", {
      outcome: "failed",
      stage,
      storage: storage.envName,
      error: backupErrorMessage(err, [storage.token]),
      ...(stage === "upload"
        ? {
            hint:
              `If the store behind ${storage.envName} is public, that is the cause: a backup is ` +
              `uploaded as a private blob, which needs a private store. A shop whose media store ` +
              `is public needs a second, private store for ${BACKUP_BLOB_TOKEN_ENV}, not connected ` +
              `to the project. Steps: ${BACKUP_RUNBOOK_URL}`,
          }
        : {}),
    });
    return NextResponse.json(
      { ok: false, stage, error: backupErrorMessage(err, [storage.token]) },
      { status: 500 },
    );
  }
}
