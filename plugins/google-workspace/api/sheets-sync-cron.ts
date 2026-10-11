import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron/auth";

import { syncProductsWithSheet } from "@/plugins/google-workspace/lib/sheets-sync";

/**
 * Google Sheets catalog sync cron. Auth via CRON_SECRET. The job is inert when
 * brand.features.sheetsSync is off or no spreadsheet id / Google connection is
 * configured.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  const result = await syncProductsWithSheet();
  return NextResponse.json(result);
}
