import "server-only";

import { prisma } from "@/lib/db";
import { getFeatures } from "@/lib/brand";
import {
  setFxRateOverrides,
  type FxRatesOverridePayload,
} from "@/lib/money";

const CACHE_TTL_MS = 30_000;

let cachedRates: {
  value: FxRatesOverridePayload | null;
  expiresAt: number;
} | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRates(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;

  const rates: Record<string, number> = {};
  for (const [rawCurrency, rawRate] of Object.entries(value)) {
    const currency = rawCurrency.trim().toUpperCase();
    const rate =
      typeof rawRate === "number"
        ? rawRate
        : typeof rawRate === "string"
          ? Number(rawRate)
          : Number.NaN;

    if (!currency || !Number.isFinite(rate) || rate <= 0) continue;
    rates[currency] = rate;
  }

  return Object.keys(rates).length > 0 ? rates : null;
}

export function parseFxRatesJson(
  json: string | null | undefined,
): FxRatesOverridePayload | null {
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  const fetchedAt =
    typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : null;
  const rates = normalizeRates(parsed.rates);
  if (!fetchedAt || !rates) return null;

  return {
    fetchedAt,
    base: typeof parsed.base === "string" ? parsed.base : undefined,
    source: typeof parsed.source === "string" ? parsed.source : undefined,
    rates,
  };
}

export function setCachedDbFxRates(
  payload: FxRatesOverridePayload | null,
): void {
  cachedRates = {
    value: payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  setFxRateOverrides(payload);
}

export function invalidateDbFxRatesCache(): void {
  cachedRates = null;
  setFxRateOverrides(null);
}

export async function getDbFxRates(options?: {
  force?: boolean;
}): Promise<FxRatesOverridePayload | null> {
  const features = await getFeatures();
  if (!(features as { fxAutoUpdate?: boolean }).fxAutoUpdate) {
    cachedRates = null;
    setFxRateOverrides(null);
    return null;
  }

  const now = Date.now();
  if (!options?.force && cachedRates && cachedRates.expiresAt > now) {
    setFxRateOverrides(cachedRates.value);
    return cachedRates.value;
  }

  try {
    const row = await prisma.integrationSettings.findUnique({
      where: { id: 1 },
      select: { fxRatesJson: true },
    });
    const parsed = parseFxRatesJson(row?.fxRatesJson);
    cachedRates = { value: parsed, expiresAt: now + CACHE_TTL_MS };
    setFxRateOverrides(parsed);
    return parsed;
  } catch {
    // DB unavailable/schema not migrated yet: keep checkout on static anchors.
    cachedRates = { value: null, expiresAt: now + CACHE_TTL_MS };
    setFxRateOverrides(null);
    return null;
  }
}

export async function primeFxRatesFromDb(): Promise<
  FxRatesOverridePayload | null
> {
  return getDbFxRates();
}
