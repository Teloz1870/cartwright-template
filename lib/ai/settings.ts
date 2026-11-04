import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-encryption";

/**
 * AI provider settings — central source-of-truth for hvilken model `chatModel()`
 * returnerer i hvert intent. Holdes adskilt fra `lib/ai/client.ts` så imports
 * fra UI-komponenter (forms, status pill) ikke pulled hele Anthropic-SDK'en
 * ind via tree-shake-uvenlige ESM-imports.
 *
 * Mirror pattern fra getAnthropicApiKey():
 *   - DB-singleton (IntegrationSettings id=1) er primær kilde
 *   - .env fallback til hver felt hvis DB ikke har værdi
 *   - 30s in-memory cache så chat-burst ikke spammer DB
 *   - invalidateAiSettingsCache() kaldes fra /admin/integrations/actions.ts
 *     når admin gemmer nye settings → ændring slår igennem instant
 */

export type AiProvider = "anthropic" | "local" | "auto";
export type LocalAiFallbackMode = "off" | "on-error" | "after-3-failures";

export type AiSettings = {
  provider: AiProvider;
  anthropicModel: string;
  anthropicApiKey: string | null; // dekrypteret, null hvis ikke konfigureret
  localAiEndpoint: string | null; // typisk "http://localhost:11434/v1"
  localAiModel: string | null; // fx "gemma4:e4b"
  localAiFallbackMode: LocalAiFallbackMode;
  lastDegradedAt: Date | null;
  /** Convenience-flag for UI: kan provider faktisk bruges right now? */
  anthropicConfigured: boolean;
  localConfigured: boolean;
};

const CACHE_TTL_MS = 30_000;
let cached: { value: AiSettings; expiresAt: number } | null = null;

const DEFAULT_SETTINGS: AiSettings = {
  provider: "anthropic",
  anthropicModel: "claude-haiku-4-5",
  anthropicApiKey: null,
  localAiEndpoint: null,
  localAiModel: null,
  localAiFallbackMode: "on-error",
  lastDegradedAt: null,
  anthropicConfigured: false,
  localConfigured: false,
};

/**
 * Læs alle AI-relaterede settings i ét hop. Bruges af chatModel(),
 * LocalAiForm, AiStatusPill, og health-endpointet. Returnerer aldrig null —
 * fallback til hardcoded defaults sikrer at chat-flow ikke kan briste fordi
 * en kolonne mangler.
 */
export async function getAiSettings(): Promise<AiSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let row: {
    aiProvider: string | null;
    anthropicModel: string | null;
    anthropicApiKey: string | null;
    localAiEndpoint: string | null;
    localAiModel: string | null;
    localAiFallbackMode: string | null;
    lastDegradedAt: Date | null;
  } | null = null;

  try {
    row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: {
        aiProvider: true,
        anthropicModel: true,
        anthropicApiKey: true,
        localAiEndpoint: true,
        localAiModel: true,
        localAiFallbackMode: true,
        lastDegradedAt: true,
      },
    });
  } catch {
    // DB ikke tilgængelig — falder tilbage til env
  }

  const dbAnthropicKey = row?.anthropicApiKey
    ? decryptSecret(row.anthropicApiKey)
    : null;
  const anthropicApiKey = dbAnthropicKey ?? process.env.ANTHROPIC_API_KEY ?? null;

  const localAiEndpoint =
    row?.localAiEndpoint?.trim() ||
    process.env.OLLAMA_BASE_URL?.trim() ||
    null;
  const localAiModel =
    row?.localAiModel?.trim() || process.env.OLLAMA_MODEL?.trim() || null;

  const value: AiSettings = {
    provider: normalizeProvider(row?.aiProvider) ?? DEFAULT_SETTINGS.provider,
    anthropicModel:
      row?.anthropicModel?.trim() || DEFAULT_SETTINGS.anthropicModel,
    anthropicApiKey,
    localAiEndpoint,
    localAiModel,
    localAiFallbackMode:
      normalizeFallbackMode(row?.localAiFallbackMode) ??
      DEFAULT_SETTINGS.localAiFallbackMode,
    lastDegradedAt: row?.lastDegradedAt ?? null,
    anthropicConfigured: !!anthropicApiKey,
    localConfigured: !!(localAiEndpoint && localAiModel),
  };

  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/**
 * Invalider cachen øjeblikkeligt. Kaldes fra /admin/integrations/actions.ts
 * når admin gemmer ny provider-config, så ændringen slår igennem instant.
 */
export function invalidateAiSettingsCache(): void {
  cached = null;
}

/**
 * Skrives når auto-fallback detekterer at local provider er nede.
 * Bruges af AiStatusPill til at vise "degraded" badge i 1 time efter sidste
 * fejl, så admin ved at deres local-config har et problem at fixe.
 */
export async function markLocalDegraded(): Promise<void> {
  try {
    await prisma.integrationSettings.upsert({
      where: { id: 1 },
      update: { lastDegradedAt: new Date() },
      create: { id: 1, lastDegradedAt: new Date() },
    });
    invalidateAiSettingsCache();
  } catch (err) {
    // Audit-skrivning må aldrig fejle hele requesten
    console.error("[ai-settings] markLocalDegraded failed:", err);
  }
}

function normalizeProvider(value: string | null | undefined): AiProvider | null {
  if (value === "anthropic" || value === "local" || value === "auto") {
    return value;
  }
  return null;
}

function normalizeFallbackMode(
  value: string | null | undefined,
): LocalAiFallbackMode | null {
  if (value === "off" || value === "on-error" || value === "after-3-failures") {
    return value;
  }
  return null;
}
