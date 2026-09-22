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
  prisma: {
    shippingZone: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/brand.config", () => ({
  brand: {
    features: mocks.features,
    policies: { shippingFreeThresholdDkk: 49900, shippingDefaultDkk: 4900 },
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

  it("weight outside every tier → falls back to ALL rates, picks cheapest", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        // every tier caps below the parcel weight → no eligible rate
        rates: [
          rate({ name: "Tier-A", feeDkk: 6900, minWeightGram: 0, maxWeightGram: 100 }),
          rate({ name: "Tier-B", feeDkk: 3900, minWeightGram: 0, maxWeightGram: 200 }),
        ],
      },
    ]);
    const q = await resolve({ country: "DK", subtotalDkk: 10000, weightGram: 99999 });
    expect(q.source).toBe("zone");
    // eligible.length === 0 → candidates = all rates → cheapest = Tier-B
    expect(q.rateName).toBe("Tier-B");
    expect(q.feeDkk).toBe(3900);
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

  it("DB throw (findMany rejects) → flat fallback, never propagates", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockRejectedValue(new Error("db down"));
    const q = await resolve({ country: "DK", subtotalDkk: 10000 });
    expect(q.source).toBe("flat");
    expect(q.feeDkk).toBe(4900);
  });
});
