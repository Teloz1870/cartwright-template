import { NextRequest, NextResponse } from "next/server";
import { getFeatures } from "@/lib/brand";

import { brand } from "@/brand.config";
import { runAbandonedCartJob } from "@/lib/abandoned-cart";

/**
 * Daglig abandoned-cart cron. No-op'er når features.abandonedCart er off. Auth
 * via CRON_SECRET. Sender kun til logged-in kunder med inaktiv kurv (idempotent
 * via AbandonedCartLog). Schedule: 09:00 UTC (vercel.json).
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

  // Kør hvis ENTEN abandonedCart (direkte single-mail) ELLER marketingAutomations
  // (emit cart.abandoned-event til Resend Automations) er on. runAbandonedCartJob
  // vælger send-mode; automations tager forrang når begge er on.
  // Resolved: both flags are runtime-tier, so an admin who turns cart
  // recovery on in /admin/features would otherwise get a cron that answers
  // 200 and sends nothing, forever, with no error anywhere to notice.
  const features = await getFeatures();
  if (!features.abandonedCart && !features.marketingAutomations) {
    return NextResponse.json({ ok: true, reason: "abandoned-cart-disabled" });
  }

  try {
    const run = await runAbandonedCartJob();
    return NextResponse.json({ ok: true, ...run });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "failed" },
      { status: 500 },
    );
  }
}
