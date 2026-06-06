import { NextRequest, NextResponse } from "next/server";

import { getBrand } from "@/lib/brand";
import { runDriveBackup } from "@/lib/backup/google-drive";

/**
 * Optional scheduled logical backup -> Google Drive. Auth via CRON_SECRET.
 * No-op unless brand.features.googleDrive resolves true.
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

  const brand = await getBrand();
  if (!(brand.features as { googleDrive?: boolean }).googleDrive) {
    return NextResponse.json({
      ok: true,
      reason: "googleDrive-feature-disabled",
    });
  }

  const result = await runDriveBackup();
  if (!result.ok) {
    return NextResponse.json({
      ok: true,
      backedUp: false,
      error: result.error,
    });
  }

  return NextResponse.json({
    ok: true,
    backedUp: true,
    file: result.file,
    folderId: result.folderId,
    tableCount: result.tableCount,
    bytes: result.bytes,
  });
}
