import "server-only";

import {
  GeminiApiError,
  GeminiRateLimit,
  GeminiSafetyBlock,
  getGoogleGeminiApiKey,
} from "@/lib/ai/gemini";
import { buildAltTextPrompt } from "@/lib/ai/prompts/alt-text";

/**
 * Phase 10 Slice 2 — Gemini vision-to-text for upload-metadata.
 *
 * Bruger gemini-2.5-flash (multimodal, billig) med JSON-mode for struktureret
 * output. Kaldes async fra /api/cron/media-ai (Slice 2) — IKKE fra upload-routen
 * synkront, så admin-upload-latency forbliver <1.5s.
 *
 * Video skippes i denne phase (durationSec != null) — første-frame extraction
 * tilføjes i Phase 10.1. For nu sættes aiStatus="skipped" for videoer.
 */

const GEMINI_VISION_MODEL = "gemini-2.5-flash";
const GEMINI_VISION_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 30_000;

export type AltTextResult = {
  alt: { da: string; en: string };
  title: string;
  caption: string;
  geoSnippet: string | null;
  dominantColors: string[];
  suggestedFilename: string;
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    alt: {
      type: "OBJECT",
      properties: {
        da: { type: "STRING" },
        en: { type: "STRING" },
      },
      required: ["da", "en"],
    },
    title: { type: "STRING" },
    caption: { type: "STRING" },
    geoSnippet: { type: "STRING" },
    dominantColors: {
      type: "ARRAY",
      items: { type: "STRING" },
      minItems: 3,
      maxItems: 3,
    },
    suggestedFilename: { type: "STRING" },
  },
  required: [
    "alt",
    "title",
    "caption",
    "dominantColors",
    "suggestedFilename",
  ],
} as const;

/**
 * Henter billedet fra (typisk Vercel Blob) URL og kalder Gemini med inline_data
 * base64. Returnerer struktureret AltTextResult. Kaster GeminiApiError /
 * GeminiSafetyBlock / GeminiRateLimit på fejl.
 */
export async function generateAltTextFromUrl(args: {
  url: string;
  mime: string;
}): Promise<AltTextResult> {
  const apiKey = await getGoogleGeminiApiKey();
  if (!apiKey) {
    throw new GeminiApiError(
      "No Google Gemini API key — set one in /admin/integrations or via GOOGLE_GEMINI_API_KEY in .env",
    );
  }

  // Fetch billede-bytes (URL er public — Vercel Blob er hostet med access:"public")
  const imageBytes = await fetchImageBytes(args.url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_VISION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildAltTextPrompt() },
              {
                inline_data: {
                  mime_type: args.mime,
                  data: imageBytes.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
        },
      }),
      signal: controller.signal,
    });

    const rawBody = await response.text();

    if (response.status === 429) {
      throw new GeminiRateLimit();
    }

    if (!response.ok) {
      console.error(
        `[alt-text] HTTP ${response.status} from Gemini vision API:`,
        rawBody.slice(0, 500),
      );
      throw new GeminiApiError(
        `Gemini vision API returned HTTP ${response.status}`,
        response.status,
      );
    }

    type GeminiVisionResponse = {
      candidates?: Array<{
        finishReason?: string;
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      promptFeedback?: { blockReason?: string };
    };

    let payload: GeminiVisionResponse;
    try {
      payload = JSON.parse(rawBody) as GeminiVisionResponse;
    } catch {
      throw new GeminiApiError("Gemini response was not valid JSON");
    }

    if (
      payload.promptFeedback?.blockReason ||
      payload.candidates?.some((c) =>
        c.finishReason?.toUpperCase().includes("SAFETY"),
      )
    ) {
      throw new GeminiSafetyBlock();
    }

    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new GeminiApiError(
        "Gemini vision response did not contain text payload",
      );
    }

    return parseAltTextJson(text);
  } catch (error) {
    if (
      error instanceof GeminiRateLimit ||
      error instanceof GeminiSafetyBlock ||
      error instanceof GeminiApiError
    ) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new GeminiApiError("Gemini vision API request timed out");
    }
    throw new GeminiApiError(
      error instanceof Error ? error.message : "Gemini vision API request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImageBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new GeminiApiError(
      `Kunne ikke hente billede fra ${url.slice(0, 80)} (HTTP ${res.status})`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

function parseAltTextJson(raw: string): AltTextResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GeminiApiError("Gemini alt-text response var ikke valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new GeminiApiError("Gemini alt-text response var ikke et objekt");
  }

  const obj = parsed as Record<string, unknown>;
  const alt = obj.alt as { da?: unknown; en?: unknown } | undefined;
  const dominantColors = Array.isArray(obj.dominantColors)
    ? obj.dominantColors.filter((c): c is string => typeof c === "string")
    : [];

  if (
    !alt ||
    typeof alt.da !== "string" ||
    typeof alt.en !== "string" ||
    typeof obj.title !== "string" ||
    typeof obj.caption !== "string" ||
    typeof obj.suggestedFilename !== "string" ||
    dominantColors.length !== 3
  ) {
    throw new GeminiApiError(
      "Gemini alt-text response manglede påkrævede felter",
    );
  }

  return {
    alt: { da: clip(alt.da, 125), en: clip(alt.en, 125) },
    title: clip(obj.title, 120),
    caption: clip(obj.caption, 200),
    geoSnippet:
      typeof obj.geoSnippet === "string" && obj.geoSnippet.length > 0
        ? clip(obj.geoSnippet, 300)
        : null,
    dominantColors: dominantColors.map(normalizeHex),
    suggestedFilename: sanitizeFilename(obj.suggestedFilename),
  };
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function normalizeHex(s: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(s.trim());
  return m ? `#${m[1].toLowerCase()}` : s;
}

function sanitizeFilename(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
