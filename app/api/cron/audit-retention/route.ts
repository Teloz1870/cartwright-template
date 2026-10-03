import { NextRequest, NextResponse } from "next/server";

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
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
