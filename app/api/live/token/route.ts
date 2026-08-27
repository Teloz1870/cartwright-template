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
        error: failureMessage(canStart.reason),
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
      { error: "Ingen voice-tools tilgængelige. Opdater settings." },
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
            : "Kunne ikke oprette voice-session. Prøv igen.",
      },
      { status: 502 },
    );
  }
}

function failureMessage(
  reason: "disabled" | "no-api-key" | "daily-cap-reached",
): string {
  switch (reason) {
    case "disabled":
      return "Voice shop er ikke aktiveret på denne butik.";
    case "no-api-key":
      return "Voice shop er ikke konfigureret endnu (mangler Gemini API key).";
    case "daily-cap-reached":
      return "Voice shop har nået dagens grænse. Prøv igen i morgen.";
  }
}

function secondsUntil(at: Date): number {
  return Math.max(1, Math.ceil((at.getTime() - Date.now()) / 1000));
}
