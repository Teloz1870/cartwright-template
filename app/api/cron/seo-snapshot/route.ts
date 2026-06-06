import { NextRequest, NextResponse } from "next/server";

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

  const features = brand.features as { seoAutopilot?: boolean; cartwrightPlus?: boolean };
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
