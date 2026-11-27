import "server-only";

import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { setFxRateOverrides, type FxRatesOverridePayload } from "@/lib/money";
import { setCachedDbFxRates } from "@/lib/fx/rates";

export const ECB_DAILY_RATES_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

const FX_SOURCE = "ecb-eurofxref-daily";

export type RefreshFxRatesResult =
  | {
      ok: true;
      fetchedAt: string;
      source: typeof FX_SOURCE;
      rates: Record<string, number>;
      updatedCurrencies: string[];
    }
  | {
      ok: false;
      reason: string;
      error?: string;
    };

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "statusText" | "text">>;

function roundRate(rate: number): number {
  return Number(rate.toFixed(8));
}

export function parseEcbEuroRates(xml: string): Record<string, number> {
  const rates: Record<string, number> = { EUR: 1 };
  const cubeTags = xml.match(/<Cube\b[^>]*\/>/g) ?? [];

  for (const tag of cubeTags) {
    const currency = tag.match(/\bcurrency=["']([A-Z]{3})["']/)?.[1];
    const rateRaw = tag.match(/\brate=["']([0-9.]+)["']/)?.[1];
    const rate = rateRaw ? Number(rateRaw) : Number.NaN;
    if (!currency || !Number.isFinite(rate) || rate <= 0) continue;
    rates[currency] = rate;
  }

  return rates;
}

function buildBaseCurrencyRates(
  ecbRatesPerEur: Record<string, number>,
): Record<string, number> | null {
  const base = brand.policies.currency.trim().toUpperCase();
  const supportedCurrencies = brand.policies.supportedCurrencies ?? {};
  const basePerEur = ecbRatesPerEur[base];
  if (!Number.isFinite(basePerEur) || basePerEur <= 0) return null;

  const rates: Record<string, number> = {};
  for (const rawCurrency of Object.keys(supportedCurrencies)) {
    const currency = rawCurrency.trim().toUpperCase();
    if (currency === base) {
      rates[currency] = 1;
      continue;
    }

    const targetPerEur = ecbRatesPerEur[currency];
    if (!Number.isFinite(targetPerEur) || targetPerEur <= 0) continue;
    rates[currency] = roundRate(targetPerEur / basePerEur);
  }

  return rates;
}

export async function refreshFxRates(options?: {
  fetchImpl?: FetchLike;
}): Promise<RefreshFxRatesResult> {
  const fetchImpl = options?.fetchImpl ?? fetch;

  let xml: string;
  try {
    const response = await fetchImpl(ECB_DAILY_RATES_URL, {
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: "fx-source-http-error",
        error: `${response.status} ${response.statusText}`.trim(),
      };
    }
    xml = await response.text();
  } catch (err) {
    return {
      ok: false,
      reason: "fx-source-unreachable",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const ecbRates = parseEcbEuroRates(xml);
  const rates = buildBaseCurrencyRates(ecbRates);
  if (!rates) {
    return {
      ok: false,
      reason: "base-currency-missing-from-source",
      error: `ECB feed does not include base currency ${brand.policies.currency}`,
    };
  }

  const fetchedAt = new Date().toISOString();
  const payload: FxRatesOverridePayload = {
    fetchedAt,
    base: brand.policies.currency.trim().toUpperCase(),
    source: FX_SOURCE,
    rates,
  };
  const fxRatesJson = JSON.stringify(payload);

  try {
    await prisma.integrationSettings.upsert({
      where: { id: 1 },
      update: { fxRatesJson },
      create: { id: 1, fxRatesJson },
    });
  } catch (err) {
    return {
      ok: false,
      reason: "fx-rates-db-write-failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  setFxRateOverrides(payload);
  setCachedDbFxRates(payload);

  return {
    ok: true,
    fetchedAt,
    source: FX_SOURCE,
    rates,
    updatedCurrencies: Object.keys(rates),
  };
}
