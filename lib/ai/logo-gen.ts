import "server-only";

import {
  composeWithReferenceImages,
  getGoogleGeminiApiKey,
  GeminiApiError,
  GeminiRateLimit,
  GeminiSafetyBlock,
} from "@/lib/ai/gemini";

/**
 * HOP2 — Gemini logo-generator. Tekst-til-billede (raster) via det
 * eksisterende `gemini-2.5-flash-image`-kald (composeWithReferenceImages med
 * 0 reference-billeder = ren text-to-image). Fail-soft: returnerer
 * { ok:false } i stedet for at kaste, så UI kan vise en pæn besked når
 * Gemini-key mangler eller safety blokerer.
 */

export type LogoGenResult =
  | { ok: true; buffer: Buffer; mime: "image/png" }
  | { ok: false; error: string };

function buildInstruction(prompt: string): string {
  return [
    "Generate a clean, professional brand LOGO as a single raster image.",
    "Requirements: centered mark on a transparent or solid white background,",
    "minimal, modern, high-contrast, legible at small sizes (favicon to header).",
    "No surrounding UI, no mockup, no watermark, no extra text unless requested.",
    "",
    `Logo concept: ${prompt}`,
  ].join("\n");
}

export async function generateLogoImage(prompt: string): Promise<LogoGenResult> {
  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, error: "Tom prompt." };

  const key = await getGoogleGeminiApiKey();
  if (!key) {
    return {
      ok: false,
      error:
        "Ingen Google Gemini-key. Sæt en i /admin/integrations eller GOOGLE_GEMINI_API_KEY i .env.",
    };
  }

  try {
    const buffer = await composeWithReferenceImages({
      instruction: buildInstruction(trimmed),
      references: [],
    });
    return { ok: true, buffer, mime: "image/png" };
  } catch (error) {
    if (error instanceof GeminiSafetyBlock) {
      return { ok: false, error: "Gemini blokerede prompten (safety). Prøv en anden formulering." };
    }
    if (error instanceof GeminiRateLimit) {
      return { ok: false, error: "Gemini rate-limit ramt. Prøv igen om lidt." };
    }
    if (error instanceof GeminiApiError) {
      return { ok: false, error: "Gemini-kaldet fejlede. Prøv igen." };
    }
    return { ok: false, error: "Uventet fejl under logo-generering." };
  }
}
