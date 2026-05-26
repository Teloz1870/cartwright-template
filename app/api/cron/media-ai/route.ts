import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  GeminiApiError,
  GeminiRateLimit,
  GeminiSafetyBlock,
} from "@/lib/ai/gemini";
import { generateAltTextFromUrl } from "@/lib/media/alt-text";

/**
 * Phase 10 Slice 2 — async alt-text/SEO/GEO generation cron.
 *
 * Tager op til MAX_ASSETS_PER_RUN nye uploads med aiStatus="pending" og kalder
 * Gemini vision for at producere alt-tekst + caption + geoSnippet + farver.
 * Skrives tilbage på MediaAsset-rækken.
 *
 * Status-flow:
 *   pending → ok      (Gemini-kald lykkedes, alt-felter udfyldt)
 *   pending → failed  (transient fejl — aiAttempts inkrementeres)
 *   pending → skipped (efter 3 failed-forsøg, eller hvis video/uunderstøttet mime)
 *
 * Schedule: hver 5. min via vercel.json. Auth via CRON_SECRET-header.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ASSETS_PER_RUN = 20;
const MAX_ATTEMPTS = 3;
const SUPPORTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const pending = await prisma.mediaAsset.findMany({
    where: {
      aiStatus: "pending",
      aiAttempts: { lt: MAX_ATTEMPTS },
    },
    take: MAX_ASSETS_PER_RUN,
    orderBy: { createdAt: "asc" },
  });

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const results: Array<{
    assetId: string;
    outcome: "ok" | "failed" | "skipped";
    reason?: string;
  }> = [];

  for (const asset of pending) {
    // Video skippes i denne phase — første-frame extraction kommer i 10.1.
    if (asset.durationSec != null || !SUPPORTED_IMAGE_MIMES.has(asset.mime)) {
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          aiStatus: "skipped",
          aiLastError:
            asset.durationSec != null
              ? "video alt-text not supported until phase 10.1"
              : `unsupported mime: ${asset.mime}`,
        },
      });
      results.push({ assetId: asset.id, outcome: "skipped" });
      continue;
    }

    try {
      const generated = await generateAltTextFromUrl({
        url: asset.url,
        mime: asset.mime,
      });
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          aiStatus: "ok",
          aiModel: "gemini-2.5-flash",
          aiLastError: null,
          altDa: generated.alt.da,
          altEn: generated.alt.en,
          title: generated.title,
          caption: generated.caption,
          geoSnippet: generated.geoSnippet,
          dominantColors: JSON.stringify(generated.dominantColors),
          suggestedSlug: generated.suggestedFilename,
        },
      });
      results.push({ assetId: asset.id, outcome: "ok" });
    } catch (err) {
      const message = errorMessage(err);
      const attempts = asset.aiAttempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      // Vi forlader aiStatus="pending" indtil attempts er brugt op; så plukker
      // næste cron-tick rækken op igen (WHERE aiAttempts < MAX_ATTEMPTS).
      // Når exhausted → skipped, og admin kan manuelt reset via /admin/media
      // (Slice 3).
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          aiStatus: exhausted ? "skipped" : "pending",
          aiAttempts: attempts,
          aiLastError: message.slice(0, 500),
        },
      });
      results.push({
        assetId: asset.id,
        outcome: exhausted ? "skipped" : "failed",
        reason: message,
      });

      // Rate-limit → afbryd batchen, ingen idé at hamre videre på Gemini
      if (err instanceof GeminiRateLimit) {
        break;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}

function errorMessage(err: unknown): string {
  if (
    err instanceof GeminiApiError ||
    err instanceof GeminiRateLimit ||
    err instanceof GeminiSafetyBlock
  ) {
    return `${err.name}: ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
