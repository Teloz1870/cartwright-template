import "server-only";

import { cache } from "react";

import { brand } from "@/brand.config";
import { getBrand } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { calcShipping } from "@/lib/pricing";

/**
 * What an order pays for shipping (SHIP0-b). With the runtime flag
 * `shippingZones` off, or no zone for the country, or a zone with no rates, it
 * is the flat rate (lib/pricing.calcShipping), so a shop that never set up zones
 * is byte-identical to before. With a zone, it is that zone's cheapest rate for
 * the parcel's weight; deliveryDaysMin/Max is its delivery time.
 *
 * A zone table that cannot be read is NOT the flat rate (PAY1): the order would
 * be charged a price the shop never set. It throws ShippingUnavailableError, and
 * order creation refuses until the table can be read.
 */

export class ShippingUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The shipping rates could not be read", { cause });
    this.name = "ShippingUnavailableError";
  }
}

export class ShippingChoiceError extends Error {
  constructor(readonly rateId: string) {
    super("That delivery option is not available for this order");
    this.name = "ShippingChoiceError";
  }
}

export type ShippingQuote = {
  feeDkk: number;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
  source: "flat" | "zone";
  rateName?: string;
  /** The ShippingRate charged (source "zone" only). */
  rateId?: string;
  /** Zone rates only: what the customer gets, the carrier and the label's template. */
  carrierCode?: string | null;
  shipmentTemplateId?: number | null;
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

type BandRate = { feeDkk: number; minWeightGram: number | null; maxWeightGram: number | null };

/**
 * The rate for a parcel no band contains. Never the cheapest of all, which is
 * the lightest band's price for a parcel the shop set a heavier price for.
 * In a gap between bands it is the next heavier band (the cheapest of those);
 * heavier than every band it is the heaviest band. A shop that wants another
 * price for its heaviest parcels adds a band without an upper limit.
 */
function outsideEveryBand<R extends BandRate>(rates: R[], weight: number, cheapest: (rs: R[]) => R): R {
  const heavier = rates.filter((r) => (r.minWeightGram ?? 0) >= weight);
  if (heavier.length) {
    // The NEAREST heavier band: a cheaper band further up is not this parcel's.
    const nearest = Math.min(...heavier.map((r) => r.minWeightGram ?? 0));
    return cheapest(heavier.filter((r) => (r.minWeightGram ?? 0) === nearest));
  }
  const top = (r: BandRate) => r.maxWeightGram ?? Number.POSITIVE_INFINITY;
  const heaviest = Math.max(...rates.map(top));
  return cheapest(rates.filter((r) => top(r) === heaviest));
}

/**
 * The zone table, read once per request (React's cache: a product page with
 * many variants prices them all from one read). Outside a render it reads
 * every time. A read that fails is ShippingUnavailableError.
 */
const readZones = cache(async () => {
  try {
    return await prisma.shippingZone.findMany({ include: { rates: true } });
  } catch (err) {
    throw new ShippingUnavailableError(err);
  }
});

type ZoneRow = Awaited<ReturnType<typeof readZones>>[number];

function zoneFor(zones: ZoneRow[], country?: string): ZoneRow | undefined {
  const code = (country ?? brand.policies.country).toUpperCase();
  return zones.find((z) => parseCountries(z.countries).includes(code));
}

/**
 * Whether zone rates, not the flat policy, price this shop's orders: the flag is
 * on (or unknown) and a zone with rates covers the shop's country. Promises
 * built on the flat policy ("free shipping over 499 kr") are only true when it
 * is false. Unreadable zones count as true: better no promise than a wrong one.
 */
export async function zonePricingApplies(): Promise<boolean> {
  const resolved = await getBrand();
  if (resolved.source !== "unavailable" && !resolved.features?.shippingZones) return false;
  try {
    const zone = zoneFor(await readZones());
    return Boolean(zone && usable(zone.rates).length > 0);
  } catch {
    return true;
  }
}

/**
 * The rates checkout may charge. A pickup rate needs a pickup point, and the
 * picker does not exist yet (SHIP0-b part 2b), so pickup rates are neither
 * offered nor charged: a zone with only pickup rates prices as no zone.
 */
function usable<R extends { kind: string }>(rates: R[]): R[] {
  return rates.filter((r) => r.kind !== "pickup");
}

type ShippingInput = {
  /** ISO-2. Orders carry no country yet, so it is the shop's own unless given. */
  country?: string;
  subtotalDkk: number;
  weightGram?: number;
};

/**
 * What this parcel may be sent with: the flat rate, or the zone rates that fit
 * its weight, cheapest first (each fee is its fee for THIS cart: 0 once its
 * free-shipping threshold is met). These are the options of checkout's
 * delivery step; resolveShipping charges one of them.
 */
export async function shippingChoices(
  opts: ShippingInput,
): Promise<{ source: "flat"; quote: ShippingQuote } | { source: "zone"; options: ShippingQuote[] }> {
  // The runtime flag (an admin toggle in /admin/features), not the build-time
  // config. When the runtime settings cannot be read, the flag is unknown: an
  // override may have turned zones on that the config default says are off.
  // (Same reading as getFeatureGateState, through getBrand.)
  const resolved = await getBrand();
  const gate = { available: resolved.source !== "unavailable", features: resolved.features };
  if (gate.available && !gate.features?.shippingZones) {
    return { source: "flat", quote: flat(opts.subtotalDkk) };
  }

  const zone = zoneFor(await readZones(), opts.country);
  const rates = zone ? usable(zone.rates) : [];
  // No zone for the country: the flat rate, whatever the flag says.
  if (rates.length === 0) return { source: "flat", quote: flat(opts.subtotalDkk) };
  // A zone exists but the flag is unknown: charging either price could be wrong (PAY1).
  if (!gate.available) {
    throw new ShippingUnavailableError(new Error("Runtime feature flags unavailable"));
  }

  const weight = opts.weightGram ?? 0;
  const eligible = rates.filter(
    (r) =>
      (r.minWeightGram == null || weight >= r.minWeightGram) &&
      (r.maxWeightGram == null || weight <= r.maxWeightGram),
  );
  // A rate's fee for THIS cart: 0 once its free-shipping threshold is met, so a
  // rate that is free above 500 kr wins over a cheaper base fee on a 600 kr cart.
  const fee = (r: (typeof rates)[number]) =>
    r.freeThresholdDkk != null && opts.subtotalDkk >= r.freeThresholdDkk ? 0 : r.feeDkk;
  const cheapest = (rs: typeof rates) => rs.reduce((a, b) => (fee(a) <= fee(b) ? a : b));
  // Outside every band there is one option, never the cheapest of all (outsideEveryBand).
  const band = eligible.length ? eligible : [outsideEveryBand(rates, weight, cheapest)];
  const options = band
    .map((r) => ({
      feeDkk: fee(r),
      deliveryDaysMin: r.deliveryDaysMin,
      deliveryDaysMax: r.deliveryDaysMax,
      source: "zone" as const,
      rateName: r.name,
      rateId: r.id,
      carrierCode: r.carrierCode,
      shipmentTemplateId: r.shipmentTemplateId,
    }))
    // Cheapest first; a fee tie keeps the shop's order (stable sort).
    .sort((a, b) => a.feeDkk - b.feeDkk);
  return { source: "zone", options };
}

/**
 * What an order pays for shipping: the option the customer chose (`rateId`),
 * or, when none is given (an agent, an older client), the cheapest. A rateId
 * that is not an option for this parcel is ShippingChoiceError, never another
 * rate. With the flat rate a rateId is stale (the options it came from are
 * gone) and refused the same way.
 */
export async function resolveShipping(opts: ShippingInput & { rateId?: string | null }): Promise<ShippingQuote> {
  const choices = await shippingChoices(opts);
  // A choice for a shop that now prices flat (its zone removed, or zones turned
  // off while checkout was open) is stale: refuse it so checkout refreshes,
  // rather than charge the flat rate under the option the customer saw.
  if (choices.source === "flat") {
    if (opts.rateId) throw new ShippingChoiceError(opts.rateId);
    return choices.quote;
  }
  if (!opts.rateId) return choices.options[0];
  const chosen = choices.options.find((o) => o.rateId === opts.rateId);
  if (!chosen) throw new ShippingChoiceError(opts.rateId);
  return chosen;
}
