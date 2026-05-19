import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-encryption";

const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;
const CACHE_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;

let cachedGeminiKey: { value: string | null; expiresAt: number } | null = null;

export class GeminiRateLimit extends Error {
  constructor(message = "Gemini rate limit exceeded") {
    super(message);
    this.name = "GeminiRateLimit";
  }
}

export class GeminiSafetyBlock extends Error {
  constructor(message = "Gemini blocked the image request for safety reasons") {
    super(message);
    this.name = "GeminiSafetyBlock";
  }
}

export class GeminiApiError extends Error {
  constructor(
    message = "Gemini API request failed",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}

type GeminiInlineData = {
  data?: string;
  mime_type?: string;
};

type GeminiPart = {
  inline_data?: GeminiInlineData;
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

/**
 * Hent Google Gemini API-key. Admin-sat DB-key har forrang, med .env som
 * fallback så deploys kan køre uden at integrere admin-UI først.
 */
export async function getGoogleGeminiApiKey(): Promise<string | null> {
  const now = Date.now();
  if (cachedGeminiKey && cachedGeminiKey.expiresAt > now) {
    return cachedGeminiKey.value;
  }

  let dbKey: string | null = null;
  try {
    const row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: { googleGeminiApiKey: true },
    });
    dbKey = row?.googleGeminiApiKey
      ? decryptSecret(row.googleGeminiApiKey)
      : null;
  } catch {
    // DB ikke tilgængelig — falder tilbage til env
  }

  const key = dbKey ?? process.env.GOOGLE_GEMINI_API_KEY ?? null;
  cachedGeminiKey = { value: key, expiresAt: now + CACHE_TTL_MS };
  return key;
}

export function invalidateGeminiKeyCache(): void {
  cachedGeminiKey = null;
}

export async function composeWithReferenceImages(args: {
  instruction: string;
  references: Array<{ bytes: Buffer; mime: string }>;
}): Promise<Buffer> {
  const apiKey = await getGoogleGeminiApiKey();
  if (!apiKey) {
    throw new GeminiApiError(
      "Ingen Google Gemini API-key — sæt en i /admin/integrations eller via GOOGLE_GEMINI_API_KEY i .env",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Gemini accepterer key via header ELLER querystring. Vi bruger header
    // så keyen ikke ender i upstream-proxy access-logs eller browser-history.
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: args.instruction },
              ...args.references.map((reference) => ({
                inline_data: {
                  mime_type: reference.mime,
                  data: reference.bytes.toString("base64"),
                },
              })),
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    const rawBody = await response.text();

    if (response.status === 429) {
      throw new GeminiRateLimit();
    }

    let payload: GeminiResponse | null = null;
    try {
      payload = rawBody ? (JSON.parse(rawBody) as GeminiResponse) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      // Log rawBody server-side til debug, men kast sanitized besked
      // så et evt. echoed API-key i Google's fejl-body ikke lækker til Sentry/UI.
      console.error(
        `[gemini] HTTP ${response.status} from Gemini API:`,
        rawBody.slice(0, 500),
      );
      throw new GeminiApiError(
        `Gemini API returned HTTP ${response.status}`,
        response.status,
      );
    }

    if (isSafetyBlocked(payload)) {
      throw new GeminiSafetyBlock();
    }

    const imageBase64 = payload?.candidates?.[0]?.content?.parts?.find(
      (part) => part.inline_data?.data,
    )?.inline_data?.data;

    if (!imageBase64) {
      throw new GeminiApiError("Gemini response did not include image data");
    }

    return Buffer.from(imageBase64, "base64");
  } catch (error) {
    if (
      error instanceof GeminiRateLimit ||
      error instanceof GeminiSafetyBlock ||
      error instanceof GeminiApiError
    ) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new GeminiApiError("Gemini API request timed out");
    }
    throw new GeminiApiError(
      error instanceof Error ? error.message : "Gemini API request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function isSafetyBlocked(payload: GeminiResponse | null): boolean {
  if (!payload) return false;
  if (payload.promptFeedback?.blockReason) return true;
  return (
    payload.candidates?.some((candidate) =>
      candidate.finishReason?.toUpperCase().includes("SAFETY"),
    ) ?? false
  );
}
