import { NextRequest, NextResponse } from "next/server";

import { syncProductsWithSheet } from "@/lib/sheets/sync";

/**
 * Google Sheets catalog sync cron. Auth via CRON_SECRET. The job is inert when
 * brand.features.sheetsSync is off or no spreadsheet id / Google connection is
 * configured.
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

  const result = await syncProductsWithSheet();
  return NextResponse.json(result);
}
