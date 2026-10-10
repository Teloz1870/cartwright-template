import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron/auth";

import { cleanupExpiredTokens } from "@/lib/gdpr/retention";

/**
 * Daglig oprydning af ALLEREDE udløbne tokens/sessions + forældede gæste-kurve.
 * Rører aldrig aktive data. Auth via CRON_SECRET. ?dryRun=1 = tæl uden at slette.
 * Schedule: 02:00 UTC (vercel.json).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const counts = await cleanupExpiredTokens({ dryRun });
    return NextResponse.json({ ok: true, dryRun, counts });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "cleanup failed" },
      { status: 500 },
    );
  }
}
