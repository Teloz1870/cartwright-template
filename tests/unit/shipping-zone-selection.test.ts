import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * resolveShipping zone/weight/cheapest-rate SELECTION branches (Track G).
 *
 * shipping-fulfillment.test.ts covers the happy paths (flag off → flat, single
 * zone-match, free-threshold, no-zone). This table locks the DEFENSIVE selection
 * logic in lib/shipping/zones.ts that the charge path relies on but that was
 * untested: weight-tier filtering, the weight-outside-all-tiers fall-back to ALL
 * zone rates, the cheapest-rate `reduce`, malformed-countries JSON, an empty
 * rates[] on a matched zone, and the DB-throw → flat fallback. A regression in
 * any of these mis-charges shipping (fee is added to the order total), so this is
 * protect-live coverage, not gold-plating. Test-only → byte-identical → smoke n/a.
 *
 * Mirrors the mock harness in shipping-fulfillment.test.ts (prisma + brand.config).
 */

const mocks = vi.hoisted(() => ({
  features: { shippingZones: false } as { shippingZones?: boolean },
  source: "db" as string,
  prisma: {
    shippingZone: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
// The flag is the runtime one (SHIP0-b): getBrand().features, not brand.config.
vi.mock("@/lib/brand", () => ({ getBrand: async () => ({ features: mocks.features, source: mocks.source }) }));
vi.mock("@/brand.config", () => ({
  brand: {
    features: mocks.features,
    policies: { country: "DK", shippingFreeThresholdDkk: 49900, shippingDefaultDkk: 4900 },
  },
}));

type RateRow = {
  name: string;
  feeDkk: number;
  freeThresholdDkk: number | null;
  minWeightGram: number | null;
  maxWeightGram: number | null;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
};

function rate(p: Partial<RateRow> & { name: string; feeDkk: number }): RateRow {
  return {
    freeThresholdDkk: null,
    minWeightGram: null,
    maxWeightGram: null,
    deliveryDaysMin: 2,
    deliveryDaysMax: 4,
    ...p,
  };
}

function reset() {
  vi.resetModules();
  mocks.features.shippingZones = false;
  mocks.source = "db";
  mocks.prisma.shippingZone.findMany.mockReset();
}

async function resolve(opts: { country: string; subtotalDkk: number; weightGram?: number }) {
  const { resolveShipping } = await import("@/lib/shipping/zones");
  return resolveShipping(opts);
}

describe("resolveShipping — zone/weight/cheapest selection", () => {
  beforeEach(reset);

  it("weight inside a tier → that tier's rate (skips lighter+heavier tiers)", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        rates: [
          rate({ name: "Light", feeDkk: 2900, minWeightGram: 0, maxWeightGram: 999 }),
          rate({ name: "Medium", feeDkk: 4900, minWeightGram: 1000, maxWeightGram: 4999 }),
          rate({ name: "Heavy", feeDkk: 8900, minWeightGram: 5000, maxWeightGram: null }),
        ],
      },
    ]);
    const q = await resolve({ country: "DK", subtotalDkk: 10000, weightGram: 2000 });
    expect(q.source).toBe("zone");
    expect(q.rateName).toBe("Medium");
    expect(q.feeDkk).toBe(4900);
  });

  it("weight on a tier boundary is inclusive (min and max are >=/<=)", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        // The boundary tier ("Light") is deliberately the EXPENSIVE one so that
        // inclusive-vs-exclusive flips the answer: if maxWeightGram were treated
        // as exclusive, weight=1000 would match no tier → empty-eligible fallback
        // → cheapest of all rates → the cheaper "Heavy". Asserting "Light" here
        // therefore proves the `<=` boundary is genuinely inclusive (not masked
        // by the fallback path), per the adversarial-verifier hardening.
        rates: [
          rate({ name: "Light", feeDkk: 8900, minWeightGram: 0, maxWeightGram: 1000 }),
          rate({ name: "Heavy", feeDkk: 2900, minWeightGram: 1001, maxWeightGram: null }),
        ],
      },
    ]);
    // weight === maxWeightGram of "Light" → still eligible for Light (inclusive)
    const q = await resolve({ country: "DK", subtotalDkk: 10000, weightGram: 1000 });
    expect(q.rateName).toBe("Light");
    expect(q.feeDkk).toBe(8900);
  });

  it("missing weight is treated as 0g → matches the lightest tier", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        rates: [
          rate({ name: "Light", feeDkk: 2900, minWeightGram: 0, maxWeightGram: 999 }),
          rate({ name: "Heavy", feeDkk: 8900, minWeightGram: 1000, maxWeightGram: null }),
        ],
      },
    ]);
    const q = await resolve({ country: "DK", subtotalDkk: 10000 }); // no weightGram
    expect(q.rateName).toBe("Light");
  });

  it("heavier than every band → the heaviest band, never the cheapest (a 30 kg parcel does not pay the 0-5 kg rate)", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        rates: [
          rate({ name: "Small", feeDkk: 4900, minWeightGram: 0, maxWeightGram: 5000 }),
          rate({ name: "Large", feeDkk: 29900, minWeightGram: 5001, maxWeightGram: 20000 }),
        ],
      },
    ]);
    const q = await resolve({ country: "DK", subtotalDkk: 10000, weightGram: 30000 });
    expect(q).toMatchObject({ source: "zone", rateName: "Large", feeDkk: 29900 });
  });

  it("in a gap between bands → the next heavier band", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        rates: [
          rate({ name: "Small", feeDkk: 4900, minWeightGram: 0, maxWeightGram: 5000 }),
          rate({ name: "Large", feeDkk: 29900, minWeightGram: 6000, maxWeightGram: 20000 }),
          // Cheaper but further up: not this parcel's band.
          rate({ name: "Pallet", feeDkk: 19900, minWeightGram: 20001, maxWeightGram: null }),
        ],
      },
    ]);
    const q = await resolve({ country: "DK", subtotalDkk: 10000, weightGram: 5500 });
    expect(q).toMatchObject({ rateName: "Large", feeDkk: 29900 });
  });

  it("compares rates after their free-shipping thresholds: a rate free above 500 kr wins on a 600 kr cart", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        rates: [
          rate({ name: "Budget", feeDkk: 3900 }),
          rate({ name: "Standard", feeDkk: 4900, freeThresholdDkk: 50000 }),
        ],
      },
    ]);
    expect(await resolve({ country: "DK", subtotalDkk: 60000 })).toMatchObject({ rateName: "Standard", feeDkk: 0 });
    expect(await resolve({ country: "DK", subtotalDkk: 40000 })).toMatchObject({ rateName: "Budget", feeDkk: 3900 });
  });

  it("multiple eligible rates → cheapest wins regardless of order", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        // both unweighted (null bounds) → both eligible for any weight
        rates: [
          rate({ name: "Express", feeDkk: 7900 }),
          rate({ name: "Standard", feeDkk: 3900 }),
          rate({ name: "Economy", feeDkk: 1900 }),
        ],
      },
    ]);
    const q = await resolve({ country: "DK", subtotalDkk: 10000, weightGram: 500 });
    expect(q.rateName).toBe("Economy");
    expect(q.feeDkk).toBe(1900);
  });

  it("cheapest-rate `reduce` keeps the FIRST rate on a fee tie (a.feeDkk <= b.feeDkk)", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        rates: [
          rate({ name: "First", feeDkk: 3900, deliveryDaysMin: 1, deliveryDaysMax: 2 }),
          rate({ name: "Second", feeDkk: 3900, deliveryDaysMin: 5, deliveryDaysMax: 7 }),
        ],
      },
    ]);
    const q = await resolve({ country: "DK", subtotalDkk: 10000, weightGram: 100 });
    expect(q.feeDkk).toBe(3900);
    expect(q.rateName).toBe("First");
    expect(q.deliveryDaysMin).toBe(1);
  });

  it("free-threshold zeroes the fee of the SELECTED (cheapest-eligible) rate", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        rates: [
          rate({ name: "Cheap", feeDkk: 1900, freeThresholdDkk: 50000 }),
          rate({ name: "Pricey", feeDkk: 9900, freeThresholdDkk: null }),
        ],
      },
    ]);
    // Cheap is selected (lowest fee); subtotal clears its threshold → fee 0
    const q = await resolve({ country: "DK", subtotalDkk: 60000, weightGram: 100 });
    expect(q.rateName).toBe("Cheap");
    expect(q.feeDkk).toBe(0);
  });

  it("free-threshold NOT reached → fee stands", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      { countries: '["DK"]', rates: [rate({ name: "Std", feeDkk: 3900, freeThresholdDkk: 50000 })] },
    ]);
    const q = await resolve({ country: "DK", subtotalDkk: 49999, weightGram: 100 });
    expect(q.feeDkk).toBe(3900);
  });

  it("matched zone with empty rates[] → flat fallback", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([{ countries: '["DK"]', rates: [] }]);
    const q = await resolve({ country: "DK", subtotalDkk: 10000 });
    expect(q.source).toBe("flat");
    expect(q.feeDkk).toBe(4900);
  });

  it("country match is case-insensitive on BOTH sides", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      { countries: '["dk","se"]', rates: [rate({ name: "Std", feeDkk: 3900 })] },
    ]);
    const q = await resolve({ country: "Dk", subtotalDkk: 10000 });
    expect(q.source).toBe("zone");
    expect(q.feeDkk).toBe(3900);
  });

  it("malformed countries JSON → no match → flat fallback (parse is fail-soft)", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      { countries: "not-json", rates: [rate({ name: "Std", feeDkk: 3900 })] },
    ]);
    const q = await resolve({ country: "DK", subtotalDkk: 10000 });
    expect(q.source).toBe("flat");
  });

  it("non-array countries JSON (object) → no match → flat fallback", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      { countries: '{"DK":true}', rates: [rate({ name: "Std", feeDkk: 3900 })] },
    ]);
    const q = await resolve({ country: "DK", subtotalDkk: 10000 });
    expect(q.source).toBe("flat");
  });

  it("first matching zone is used when several zones list the country", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      { countries: '["DK"]', rates: [rate({ name: "Zone-1", feeDkk: 3900 })] },
      { countries: '["DK"]', rates: [rate({ name: "Zone-2", feeDkk: 1000 })] },
    ]);
    const q = await resolve({ country: "DK", subtotalDkk: 10000, weightGram: 100 });
    // .find() returns the first matching zone — Zone-2's cheaper rate is NOT considered
    expect(q.rateName).toBe("Zone-1");
    expect(q.feeDkk).toBe(3900);
  });

  it("DB throw (findMany rejects) → refuses, never the flat rate (PAY1: no price the shop did not set)", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockRejectedValue(new Error("db down"));
    const { ShippingUnavailableError } = await import("@/lib/shipping/zones");
    await expect(resolve({ country: "DK", subtotalDkk: 10000 })).rejects.toBeInstanceOf(ShippingUnavailableError);
  });

  it("runtime flags unreadable: no zone for the country is the flat rate; a zone is a refusal, never a guess", async () => {
    mocks.source = "unavailable"; // the config default says off, but an override may say on
    const { ShippingUnavailableError } = await import("@/lib/shipping/zones");
    mocks.prisma.shippingZone.findMany.mockResolvedValue([]);
    expect(await resolve({ country: "DK", subtotalDkk: 10000 })).toMatchObject({ source: "flat", feeDkk: 4900 });
    mocks.prisma.shippingZone.findMany.mockResolvedValue([{ countries: '["DK"]', rates: [rate({ name: "GLS", feeDkk: 3900 })] }]);
    await expect(resolve({ country: "DK", subtotalDkk: 10000 })).rejects.toBeInstanceOf(ShippingUnavailableError);
  });

  it("with the flag off, the zone table is not even read", async () => {
    mocks.prisma.shippingZone.findMany.mockRejectedValue(new Error("db down"));
    const q = await resolve({ country: "DK", subtotalDkk: 10000 });
    expect(q).toMatchObject({ source: "flat", feeDkk: 4900 });
    expect(mocks.prisma.shippingZone.findMany).not.toHaveBeenCalled();
  });

  it("charges the shop's own country when none is given, and names the rate charged", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      { countries: '["SE"]', rates: [{ ...rate({ name: "Sverige", feeDkk: 9900 }), id: "se" }] },
      { countries: '["DK"]', rates: [{ ...rate({ name: "GLS", feeDkk: 3900 }), id: "dk-gls" }] },
    ]);
    const { resolveShipping } = await import("@/lib/shipping/zones");
    expect(await resolveShipping({ subtotalDkk: 10000 })).toMatchObject({ source: "zone", feeDkk: 3900, rateId: "dk-gls", rateName: "GLS" });
  });

  it("zonePricingApplies: true only when zone rates, not the flat policy, price the shop's orders", async () => {
    const { zonePricingApplies } = await import("@/lib/shipping/zones");
    expect(await zonePricingApplies()).toBe(false); // flag off: no read at all
    expect(mocks.prisma.shippingZone.findMany).not.toHaveBeenCalled();

    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([{ countries: '["SE"]', rates: [rate({ name: "SE", feeDkk: 9900 })] }]);
    expect(await zonePricingApplies()).toBe(false); // no zone for the shop's country
    mocks.prisma.shippingZone.findMany.mockResolvedValue([{ countries: '["DK"]', rates: [rate({ name: "GLS", feeDkk: 3900 })] }]);
    expect(await zonePricingApplies()).toBe(true);
    mocks.prisma.shippingZone.findMany.mockRejectedValue(new Error("db down"));
    expect(await zonePricingApplies()).toBe(true); // unknown: no promise rather than a wrong one
  });

  it("the customer's choice: any rate that fits the parcel; one that does not is refused, never swapped", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        rates: [
          { ...rate({ name: "Express", feeDkk: 9900 }), id: "express", kind: "delivery", carrierCode: "gls", shipmentTemplateId: 11 },
          { ...rate({ name: "GLS", feeDkk: 3900 }), id: "gls", kind: "delivery", carrierCode: "gls", shipmentTemplateId: 22 },
          { ...rate({ name: "Pallet", feeDkk: 49500, minWeightGram: 20000 }), id: "pallet", kind: "delivery", carrierCode: null, shipmentTemplateId: null },
        ],
      },
    ]);
    const { resolveShipping, shippingChoices, ShippingChoiceError } = await import("@/lib/shipping/zones");
    const choices = await shippingChoices({ subtotalDkk: 10000, weightGram: 1000 });
    expect(choices.source === "zone" && choices.options.map((o) => o.rateId)).toEqual(["gls", "express"]); // cheapest first, pallet does not fit
    expect(await resolveShipping({ subtotalDkk: 10000, weightGram: 1000, rateId: "express" })).toMatchObject({
      feeDkk: 9900,
      rateName: "Express",
      carrierCode: "gls",
      shipmentTemplateId: 11,
    });
    expect(await resolveShipping({ subtotalDkk: 10000, weightGram: 1000 })).toMatchObject({ rateId: "gls" }); // no choice: cheapest
    await expect(resolveShipping({ subtotalDkk: 10000, weightGram: 1000, rateId: "pallet" })).rejects.toBeInstanceOf(ShippingChoiceError);
    await expect(resolveShipping({ subtotalDkk: 10000, weightGram: 1000, rateId: "nope" })).rejects.toBeInstanceOf(ShippingChoiceError);

    // The shop removes its zones (or turns them off) while checkout is open: the choice is stale.
    mocks.prisma.shippingZone.findMany.mockResolvedValue([]);
    await expect(resolveShipping({ subtotalDkk: 10000, rateId: "gls" })).rejects.toBeInstanceOf(ShippingChoiceError);
    expect(await resolveShipping({ subtotalDkk: 10000 })).toMatchObject({ source: "flat" });
  });

  it("pickup rates are neither offered nor charged until the pickup-point picker exists", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        rates: [
          { ...rate({ name: "Pakkeshop", feeDkk: 2900 }), id: "shop", kind: "pickup", carrierCode: "gls" },
          { ...rate({ name: "Til døren", feeDkk: 5900 }), id: "door", kind: "delivery", carrierCode: "gls" },
        ],
      },
    ]);
    const { resolveShipping, shippingChoices, zonePricingApplies } = await import("@/lib/shipping/zones");
    const choices = await shippingChoices({ subtotalDkk: 10000 });
    expect(choices.source === "zone" && choices.options.map((o) => o.rateId)).toEqual(["door"]);
    expect(await resolveShipping({ subtotalDkk: 10000 })).toMatchObject({ rateId: "door", feeDkk: 5900 });

    // A zone with only pickup rates prices as no zone at all.
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      { countries: '["DK"]', rates: [{ ...rate({ name: "Pakkeshop", feeDkk: 2900 }), id: "shop", kind: "pickup", carrierCode: "gls" }] },
    ]);
    expect(await resolveShipping({ subtotalDkk: 10000 })).toMatchObject({ source: "flat", feeDkk: 4900 });
    expect(await zonePricingApplies()).toBe(false);
  });
});
