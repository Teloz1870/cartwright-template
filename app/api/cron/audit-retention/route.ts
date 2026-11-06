import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron/auth";

import { pruneAuditLog } from "@/lib/gdpr/retention";

/**
 * AuditLog-retention. DEFAULT-OFF: no-op medmindre brand.policies
 * .auditRetentionDays er sat. Sletter rows ældre end retention-vinduet. Auth via
 * CRON_SECRET. ?dryRun=1 = tæl uden at slette. Schedule: 02:30 UTC (vercel.json).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const result = await pruneAuditLog({ dryRun });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "prune failed" },
      { status: 500 },
    );
  }
}
