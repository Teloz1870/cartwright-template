import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron/auth";

import { getBrand } from "@/lib/brand";
import { refreshFxRates } from "@/lib/fx/refresh";

/**
 * Daily FX-rate refresh cron. Auth via CRON_SECRET. No-op unless
 * brand.features.fxAutoUpdate is on, so forks keep static anchors by default.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  const mergedBrand = await getBrand();
  if (!(mergedBrand.features as { fxAutoUpdate?: boolean }).fxAutoUpdate) {
    return NextResponse.json({
      ok: true,
      reason: "fxAutoUpdate-feature-disabled",
    });
  }

  const result = await refreshFxRates();
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        refreshed: false,
        reason: result.reason,
        error: result.error,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    refreshed: true,
    fetchedAt: result.fetchedAt,
    source: result.source,
    updatedCurrencies: result.updatedCurrencies,
  });
}
