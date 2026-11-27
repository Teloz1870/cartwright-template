import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-encryption";

/**
 * Voice-shop settings — central source-of-truth for Gemini Live config.
 *
 * Mirror pattern fra lib/ai/settings.ts (Local-AI planen):
 *   - DB-singleton (IntegrationSettings id=1) er primær kilde
 *   - .env fallback (GOOGLE_GENAI_API_KEY) hvis DB ikke har key
 *   - 30s in-memory cache så token-mint-burst ikke spammer DB
 *   - invalidateVoiceShopCache() kaldes fra /admin/integrations/actions.ts
 *
 * Voice-features kræver ALT af:
 *   1. brand.features.voiceShop === true (compile-time gate)
 *   2. settings.voiceShopEnabled === true (admin-toggle)
 *   3. settings.apiKey !== null (Google Gemini API key konfigureret)
 *   4. Daily-cap ikke nået
 *
 * canStartVoiceSession() konsoliderer alle tre runtime-checks så token-endpoint
 * og UI-button kan dele samme afvisningslogik.
 */

// Default tool-subset — discovery > transaction. orders.create defererres til
// voice-confirmation-UX er bevist i praksis. Admin kan udvide via UI.
// Navnene skal matche eksisterende CUSTOMER_TOOL_ALLOWLIST i lib/ai/client.ts.
const DEFAULT_ALLOWED_TOOLS = [
  "products.search",
  "products.get",
  "cart.add",
  "cart.get_summary",
  "discounts.try_apply",
] as const;

export type VoiceShopSettings = {
  enabled: boolean;
  apiKey: string | null; // dekrypteret, null hvis ikke konfigureret
  model: string;
  voice: string;
  allowedTools: string[];
  maxMinutesPerSession: number;
  maxMinutesPerDay: number;
  visionEnabled: boolean;
  /** Sand hvis enabled + API-key er sat. UI bruger til at vise mic-knap. */
  configured: boolean;
};

export type CanStartResult =
  | { ok: true; minutesRemainingToday: number }
  | {
      ok: false;
      reason: "disabled" | "no-api-key" | "daily-cap-reached";
      retryAt?: Date;
    };

const CACHE_TTL_MS = 30_000;
let cached: { value: VoiceShopSettings; expiresAt: number } | null = null;

const DEFAULT_SETTINGS: VoiceShopSettings = {
  enabled: false,
  apiKey: null,
  model: "gemini-2.5-flash-live",
  voice: "Puck",
  allowedTools: [...DEFAULT_ALLOWED_TOOLS],
  maxMinutesPerSession: 5,
  maxMinutesPerDay: 60,
  visionEnabled: true,
  configured: false,
};

export async function getVoiceShopSettings(): Promise<VoiceShopSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let row: {
    voiceShopEnabled: boolean | null;
    voiceShopModel: string | null;
    voiceShopVoice: string | null;
    voiceShopAllowedToolsJson: string | null;
    voiceShopMaxMinutesPerSession: number | null;
    voiceShopMaxMinutesPerDay: number | null;
    voiceShopVisionEnabled: boolean | null;
    googleGeminiApiKey: string | null;
  } | null = null;

  try {
    row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: {
        voiceShopEnabled: true,
        voiceShopModel: true,
        voiceShopVoice: true,
        voiceShopAllowedToolsJson: true,
        voiceShopMaxMinutesPerSession: true,
        voiceShopMaxMinutesPerDay: true,
        voiceShopVisionEnabled: true,
        googleGeminiApiKey: true,
      },
    });
  } catch {
    // DB ikke tilgængelig — fallback til env
  }

  const dbKey = row?.googleGeminiApiKey
    ? decryptSecret(row.googleGeminiApiKey)
    : null;
  const apiKey = dbKey ?? process.env.GOOGLE_GENAI_API_KEY ?? null;

  const allowedTools = parseAllowedTools(row?.voiceShopAllowedToolsJson);

  const value: VoiceShopSettings = {
    enabled: row?.voiceShopEnabled ?? false,
    apiKey,
    model: row?.voiceShopModel?.trim() || DEFAULT_SETTINGS.model,
    voice: row?.voiceShopVoice?.trim() || DEFAULT_SETTINGS.voice,
    allowedTools,
    maxMinutesPerSession:
      row?.voiceShopMaxMinutesPerSession ?? DEFAULT_SETTINGS.maxMinutesPerSession,
    maxMinutesPerDay:
      row?.voiceShopMaxMinutesPerDay ?? DEFAULT_SETTINGS.maxMinutesPerDay,
    visionEnabled: row?.voiceShopVisionEnabled ?? true,
    configured: !!(row?.voiceShopEnabled && apiKey),
  };

  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export function invalidateVoiceShopCache(): void {
  cached = null;
}

/**
 * Læs daily-usage row + check om voice-session kan starte.
 *
 * Returnerer struktureret afvisning hvor relevant så token-endpoint kan
 * mappe direkte til HTTP-status (disabled→404, no-api-key→503,
 * daily-cap-reached→429-with-retry-at).
 */
export async function canStartVoiceSession(): Promise<CanStartResult> {
  const settings = await getVoiceShopSettings();

  if (!settings.enabled) {
    return { ok: false, reason: "disabled" };
  }
  if (!settings.apiKey) {
    return { ok: false, reason: "no-api-key" };
  }

  const usage = await readDailyUsage();
  const remaining = settings.maxMinutesPerDay - usage.minutesUsed;
  if (remaining <= 0) {
    return {
      ok: false,
      reason: "daily-cap-reached",
      retryAt: startOfNextDay(),
    };
  }

  return { ok: true, minutesRemainingToday: remaining };
}

/**
 * Atomisk-ish inkrement af daily-usage. Sessionen poster minutter brugt når
 * den slutter (session-end-endpoint). Date-flip nulstiller counter automatisk.
 *
 * Note: SQLite har ikke ægte atomic JSON-update. To samtidige session-ends
 * kan teoretisk race; cap er soft. Til v1's threat-model (single-shop,
 * single-admin) er det acceptabelt. Multi-instance prod skifter til
 * dedikeret VoiceShopDailyUsage-tabel med row-level locking.
 */
export async function incrementDailyUsage(minutes: number): Promise<void> {
  if (minutes <= 0) return;

  const today = todayKey();
  const row = await prisma.integrationSettings.findUnique({
    where: { id: 1 },
    select: { voiceShopLastDailyUsageJson: true },
  });

  const current = parseDailyUsage(row?.voiceShopLastDailyUsageJson);
  const next =
    current.date === today
      ? { date: today, minutesUsed: current.minutesUsed + minutes }
      : { date: today, minutesUsed: minutes };

  await prisma.integrationSettings.upsert({
    where: { id: 1 },
    update: { voiceShopLastDailyUsageJson: JSON.stringify(next) },
    create: {
      id: 1,
      voiceShopLastDailyUsageJson: JSON.stringify(next),
    },
  });
  invalidateVoiceShopCache();
}

/**
 * Læs nuværende daily-usage uden mutation. Bruges af status-pill og
 * canStartVoiceSession. Date-flip håndteres ved at returnere {date:today,
 * minutesUsed:0} hvis stored date ikke matcher.
 */
export async function readDailyUsage(): Promise<{
  date: string;
  minutesUsed: number;
}> {
  const row = await prisma.integrationSettings.findUnique({
    where: { id: 1 },
    select: { voiceShopLastDailyUsageJson: true },
  });
  const parsed = parseDailyUsage(row?.voiceShopLastDailyUsageJson);
  if (parsed.date !== todayKey()) {
    return { date: todayKey(), minutesUsed: 0 };
  }
  return parsed;
}

function parseAllowedTools(json: string | null | undefined): string[] {
  if (!json) return [...DEFAULT_ALLOWED_TOOLS];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed as string[];
    }
  } catch {
    // fall through
  }
  return [...DEFAULT_ALLOWED_TOOLS];
}

function parseDailyUsage(json: string | null | undefined): {
  date: string;
  minutesUsed: number;
} {
  if (!json) return { date: todayKey(), minutesUsed: 0 };
  try {
    const parsed = JSON.parse(json) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "date" in parsed &&
      "minutesUsed" in parsed &&
      typeof (parsed as { date: unknown }).date === "string" &&
      typeof (parsed as { minutesUsed: unknown }).minutesUsed === "number"
    ) {
      return parsed as { date: string; minutesUsed: number };
    }
  } catch {
    // fall through
  }
  return { date: todayKey(), minutesUsed: 0 };
}

function todayKey(): string {
  // ISO date i UTC. Cap-vinduet er per-UTC-day; godt nok til v1.
  return new Date().toISOString().slice(0, 10);
}

function startOfNextDay(): Date {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow;
}
