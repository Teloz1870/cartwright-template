import { NextRequest, NextResponse } from "next/server";

import {
  dumpDatabase,
  previewCounts,
  serializeBackup,
  uploadBackupToBlob,
  backupFilename,
} from "@/lib/backup/dump";

/**
 * Planlagt logisk backup → Vercel Blob (PRIVATE). Auth via CRON_SECRET.
 * ?dryRun=1 = kun counts (ingen dump/upload). Kræver TURSO_* + BLOB_READ_WRITE_TOKEN
 * i miljøet (på Vercel-projektet). Schedule: 02:00 UTC (vercel.json).
 *
 * Komplementerer Tursos egne fysiske backups med en portabel logisk dump.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  try {
    if (dryRun) {
      const { host, counts } = await previewCounts();
      return NextResponse.json({ ok: true, dryRun: true, host, counts });
    }
    const payload = await dumpDatabase();
    const json = serializeBackup(payload);
    const filename = backupFilename(payload.createdAt);
    const { pathname } = await uploadBackupToBlob(json, filename);
    return NextResponse.json({
      ok: true,
      pathname,
      tableCount: payload.tableCount,
      bytes: json.length,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "backup failed" },
      { status: 500 },
    );
  }
}
