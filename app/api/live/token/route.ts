import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { checkBotId } from "botid/server";
import {
  canStartVoiceSession,
  getVoiceShopSettings,
} from "@/lib/voice/settings";
import { buildVoiceShopTools } from "@/lib/voice/tools";
import { buildVoiceShopPrompt } from "@/lib/voice/prompts";
import { getBrand } from "@/lib/brand";
import { voiceTokenLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Voice-plan Fase 1.2: ephemeral token endpoint.
 *
 * Server-side flow:
 *   1. Rate-limit per IP (lavt loft — voice koster penge per minut)
 *   2. canStartVoiceSession() — disabled/no-api-key/daily-cap-reached
 *   3. Build tool declarations fra DB-allowed-list (filtreret gennem
 *      CUSTOMER_TOOL_ALLOWLIST som defense-in-depth)
 *   4. Build voice-system-prompt (brand-aware)
 *   5. Google authTokens.create med pre-committed setup-message +
 *      lockAdditionalFields=["tools", "systemInstruction", "responseModalities"]
 *
 * Hvorfor pre-committed setup: browseren kan IKKE ændre system-prompt eller
 * tool-listen efter token er udstedt. Selv hvis en angriber stjæler tokenen
 * og åbner deres egen WS, vil sessionen være bundet til præcis de tools
 * server-side bestemte. Browseren agerer transport; serveren beholder kontrol.
 *
 * Token returneres med 60s start-TTL (browser skal forbinde inden) +
 * maxMinutesPerSession session-lifetime (Google trækker plug efter).
 *
 * Commit 7 udvider med BotID-check (botid/server) i production.
 */

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";

  // BotID-check: anonyme voice-sessions er primær abuse-flade (gratis demo
  // på shop = nem at scripte). Skip i development så lokal udvikling virker
  // uden Vercel-infrastruktur (BotID returnerer alligevel falsk-negative
  // udenfor prod).
  if (process.env.VERCEL_ENV === "production") {
    try {
      const verification = await checkBotId();
      if (verification.isBot) {
        await prisma.auditLog
          .create({
            data: {
              actor: `storefront-voice:bot-rejected-${ip}`,
              tool: "live.token.mint",
              argsJson: JSON.stringify({ reason: "bot-detected" }),
              ok: false,
              errorMsg: "BotID rejected token mint",
              requestId: randomUUID(),
              ip,
              userAgent: request.headers.get("user-agent") ?? null,
              provider: "google",
              modality: "voice",
            },
          })
          .catch(() => {
            // Audit-fejl må ikke blokere 403
          });
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch (err) {
      // BotID-fejl må ikke blokere reale brugere — log og fortsæt
      console.error("[voice/token] BotID check failed:", err);
    }
  }

  const rl = voiceTokenLimiter.check(ip);
  if (!rl.allowed) {
    return rateLimitResponse(rl);
  }

  const canStart = await canStartVoiceSession();
  if (!canStart.ok) {
    return Response.json(
      {
        ...failureBody(canStart.reason),
        reason: canStart.reason,
        retryAt: canStart.retryAt?.toISOString(),
      },
      {
        status: canStart.reason === "daily-cap-reached" ? 429 : 503,
        headers: canStart.retryAt
          ? { "Retry-After": String(secondsUntil(canStart.retryAt)) }
          : {},
      },
    );
  }

  const settings = await getVoiceShopSettings();
  const brand = await getBrand();

  if (!settings.apiKey) {
    return Response.json({ error: "Voice shop not configured." }, { status: 503 });
  }

  const toolBundle = buildVoiceShopTools(settings.allowedTools);
  if (toolBundle.effectiveTools.length === 0) {
    return Response.json(
      { code: "voice_no_tools", error: "No voice tools are available. Update the settings." },
      { status: 503 },
    );
  }

  const systemPrompt = buildVoiceShopPrompt(brand);

  const sessionId = randomUUID();
  const now = Date.now();
  const expireTime = new Date(now + 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(
    now + settings.maxMinutesPerSession * 60 * 1000,
  ).toISOString();

  try {
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });

    // Type-cast nødvendig: @google/genai's authTokens.create signature varierer
    // mellem versioner. Vi bygger payload-shapen Google's REST API forventer
    // (v1alpha) og lader runtime-SDK serialisere.
    const tokenResponse = await (
      ai as unknown as {
        authTokens: {
          create: (input: {
            config: Record<string, unknown>;
          }) => Promise<{ name: string }>;
        };
      }
    ).authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        httpOptions: { apiVersion: "v1alpha" },
        liveConnectConstraints: {
          model: `models/${settings.model}`,
          config: {
            responseModalities: ["AUDIO"],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: toolBundle.geminiTools,
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: settings.voice },
              },
            },
          },
        },
        lockAdditionalFields: [
          "tools",
          "systemInstruction",
          "responseModalities",
        ],
      },
    });

    return Response.json({
      token: tokenResponse.name,
      expiresAt: newSessionExpireTime,
      sessionId,
      model: settings.model,
      voice: settings.voice,
      capabilities: {
        vision: settings.visionEnabled,
        maxMinutes: settings.maxMinutesPerSession,
        minutesRemainingToday: canStart.minutesRemainingToday,
      },
      effectiveTools: toolBundle.effectiveTools,
    });
  } catch (err) {
    console.error("[voice/token] Google auth-token mint failed:", err);
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not start the voice session. Please try again.",
      },
      { status: 502 },
    );
  }
}

/**
 * This route has no locale segment, and the overlay that renders its reply
 * does — `VoiceShopOverlay` names `t("voiceSessionFailed")` as its fallback,
 * which a truthy server string can never fall through to. So the body carries
 * a code for the overlay to translate, and English prose for logs and for
 * anything calling the endpoint directly.
 *
 * Of the three reasons, only `daily-cap-reached` is reachable from a browser:
 * `VoiceShopMount` renders nothing unless `settings.configured`, which is
 * exactly `voiceShopEnabled && apiKey` — the two conditions behind the other
 * two. They stay because a direct POST, or a tab left open across an admin
 * toggle, still reaches them.
 */
function failureBody(
  reason: "disabled" | "no-api-key" | "daily-cap-reached",
): { code: string; error: string } {
  switch (reason) {
    case "disabled":
      return { code: "voice_disabled", error: "Voice shop is not enabled for this store." };
    case "no-api-key":
      return {
        code: "voice_not_configured",
        error: "Voice shop is not configured yet (the Gemini API key is missing).",
      };
    case "daily-cap-reached":
      return {
        code: "voice_daily_cap",
        error: "Voice shop has reached today's limit. Please try again tomorrow.",
      };
  }
}

function secondsUntil(at: Date): number {
  return Math.max(1, Math.ceil((at.getTime() - Date.now()) / 1000));
}
