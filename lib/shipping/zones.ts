import "server-only";

import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import { calcShipping } from "@/lib/pricing";

/**
 * Zone/vægt-baseret fragt-resolver (Track G). Flag-gated: når
 * features.shippingZones er off — eller der ingen matchende zone/rate er —
 * falder den tilbage til den flade fragt (lib/pricing.calcShipping), så
 * adfærden er byte-identisk med før. deliveryDaysMin/Max driver leveringstid.
 */

export type ShippingQuote = {
  feeDkk: number;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
  source: "flat" | "zone";
  rateName?: string;
};

function flat(subtotalDkk: number): ShippingQuote {
  return {
    feeDkk: calcShipping(subtotalDkk),
    deliveryDaysMin: null,
    deliveryDaysMax: null,
    source: "flat",
  };
}

function parseCountries(raw: string): string[] {
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.map((x) => String(x).toUpperCase()) : [];
  } catch {
    return [];
  }
}

export async function resolveShipping(opts: {
  country: string;
  subtotalDkk: number;
  weightGram?: number;
}): Promise<ShippingQuote> {
  if (!(brand.features as { shippingZones?: boolean }).shippingZones) {
    return flat(opts.subtotalDkk);
  }

  let zones;
  try {
    zones = await prisma.shippingZone.findMany({ include: { rates: true } });
  } catch {
    return flat(opts.subtotalDkk);
  }

  const country = opts.country.toUpperCase();
  const zone = zones.find((z) => parseCountries(z.countries).includes(country));
  if (!zone || zone.rates.length === 0) return flat(opts.subtotalDkk);

  const weight = opts.weightGram ?? 0;
  const eligible = zone.rates.filter(
    (r) =>
      (r.minWeightGram == null || weight >= r.minWeightGram) &&
      (r.maxWeightGram == null || weight <= r.maxWeightGram),
  );
  const candidates = eligible.length ? eligible : zone.rates;
  const rate = candidates.reduce((a, b) => (a.feeDkk <= b.feeDkk ? a : b));

  const fee =
    rate.freeThresholdDkk != null && opts.subtotalDkk >= rate.freeThresholdDkk
      ? 0
      : rate.feeDkk;

  return {
    feeDkk: fee,
    deliveryDaysMin: rate.deliveryDaysMin,
    deliveryDaysMax: rate.deliveryDaysMax,
    source: "zone",
    rateName: rate.name,
  };
}
