import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron/auth";
import { getFeatures } from "@/lib/brand";
import { readShipmondoConfig, readShipmondoSendMode } from "../lib/config";
import { reconcileTracking } from "../lib/reconcile";
import { SWEEP_BUDGET_MS, sendUnsentOrders } from "../lib/send-order";

/**
 * The safety net behind the sending at payment and the tracking webhook
 * (mounted at /api/cron/shipmondo-orders): sends paid orders that have not
 * reached Shipmondo (one it refused, one paid while it was down), then fetches
 * the tracking of sent orders whose webhook was missed (../lib/reconcile.ts).
 * Auth via CRON_SECRET, as every engine cron. A shop that sends by hand
 * (SHIPMONDO_SEND_MODE="manual", ../lib/config.ts) gets only the tracking half:
 * the sweep sends nothing, so no order reaches Shipmondo unless someone sent it.
 *
 * Not in vercel.json: Vercel's Hobby plan allows only daily crons, which is
 * too slow to be the way orders reach a warehouse. Call it every few minutes
 * from a scheduler (a Vercel Pro cron, or any external one with the secret).
 */
export async function GET(request: NextRequest) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;
  const features = await getFeatures();
  if (!features.shipmondo) return NextResponse.json({ ok: true, reason: "shipmondo-disabled" });
  const config = readShipmondoConfig();
  if (!config) return NextResponse.json({ ok: true, reason: "shipmondo-not-configured" });
  try {
    // One budget for both halves: send what has not gone, then fetch tracking the webhook missed.
    const deadline = Date.now() + SWEEP_BUDGET_MS;
    if (readShipmondoSendMode() === "manual") {
      const tracking = await reconcileTracking({ config, deadline });
      return NextResponse.json({ ok: tracking.failed.length === 0, sending: "manual", tracking });
    }
    const summary = await sendUnsentOrders("system:shipmondo-cron", { config, budgetMs: SWEEP_BUDGET_MS });
    const tracking = await reconcileTracking({ config, deadline });
    return NextResponse.json({ ok: summary.failed.length === 0 && tracking.failed.length === 0, ...summary, tracking });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "failed" },
      { status: 500 },
    );
  }
}
