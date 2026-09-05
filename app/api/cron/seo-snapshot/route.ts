import { NextRequest, NextResponse } from "next/server";
import { getFeatures } from "@/lib/brand";

import { brand } from "@/brand.config";
import { geoShareOfVoice, defaultGeoPrompts } from "@/lib/seo/geo-tracker";

/**
 * Ugentlig SEO/GEO-måling. No-op'er medmindre features.seoAutopilot +
 * cartwrightPlus. Måler in-house GEO share-of-voice (GSC kræver OAuth — stub).
 * Auth via CRON_SECRET. Schedule fx ugentligt (vercel.json).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Resolved, not static. /admin/plus activates by writing a DB override
  // (app/admin/plus/actions.ts:36 → applyFeatureOverride) and never touches
  // brand.config.ts — so on every shop that has actually activated Plus the
  // compile-time value stays false forever. This route read that value, took
  // the disabled branch, and answered `200 {"ok":true,…}`: a green cron log
  // for a job that collected nothing, week after week.
  const features = await getFeatures();
  if (!features.seoAutopilot || !features.cartwrightPlus) {
    return NextResponse.json({ ok: true, reason: "seoAutopilot-disabled-or-not-pro" });
  }

  try {
    const geo = await geoShareOfVoice(defaultGeoPrompts());
    return NextResponse.json({ ok: true, geo });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "failed" },
      { status: 500 },
    );
  }
}
