import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * priceCart (lib/shipping/price-cart.ts) is the one price of a cart: order
 * creation, the cart and checkout pages and every agent quote use it (SHIP0-b).
 * It must equal the old flat-rate breakdown exactly when a shop has no zones,
 * and charge the zone's rate when it has.
 */
const mocks = vi.hoisted(() => ({
  features: { shippingZones: false } as { shippingZones?: boolean },
  findMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { shippingZone: { findMany: mocks.findMany } } }));
vi.mock("@/lib/brand", () => ({ getBrand: async () => ({ features: mocks.features }) }));
vi.mock("@/brand.config", () => ({
  brand: { policies: { country: "DK", shippingDefaultDkk: 4900, shippingFreeThresholdDkk: 49900 } },
}));

const rate = (p: Record<string, unknown>) => ({
  id: "r",
  name: "Rate",
  freeThresholdDkk: null,
  minWeightGram: null,
  maxWeightGram: null,
  deliveryDaysMin: 1,
  deliveryDaysMax: 2,
  ...p,
});

beforeEach(() => {
  vi.resetModules();
  mocks.features.shippingZones = false;
  mocks.findMany.mockReset();
});

async function price(lines: { unitPriceDkk: number; quantity: number; weightGram?: number | null }[], discount = null as never) {
  const { priceCart } = await import("@/lib/shipping/price-cart");
  return priceCart(lines, discount);
}

describe("priceCart", () => {
  it("with zones off, equals the flat-rate breakdown exactly, and names no rate", async () => {
    const { calcPriceBreakdown } = await import("@/lib/pricing");
    for (const [lines, discount] of [
      [[{ unitPriceDkk: 12500, quantity: 2 }], null],
      [[{ unitPriceDkk: 30000, quantity: 2 }], null], // over the free threshold
      [[{ unitPriceDkk: 30000, quantity: 2 }], { type: "percent", value: 50 }], // threshold is before the discount
    ] as const) {
      const { shippingRateName, shippingRate, ...breakdown } = await price([...lines], discount as never);
      expect(breakdown).toEqual(calcPriceBreakdown([...lines], discount as never));
      expect(shippingRateName).toBeNull();
      expect(shippingRate).toBeNull();
    }
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("with zones on, charges the zone's rate and names it", async () => {
    mocks.features.shippingZones = true;
    mocks.findMany.mockResolvedValue([{ countries: '["DK"]', rates: [rate({ id: "gls", name: "GLS", feeDkk: 3900 })] }]);
    expect(await price([{ unitPriceDkk: 12500, quantity: 2 }])).toMatchObject({
      subtotalDkk: 25000,
      discountDkk: 0,
      shippingDkk: 3900,
      totalDkk: 28900,
      shippingRateName: "GLS",
      shippingRate: { rateId: "gls", feeDkk: 3900 },
    });
  });

  it("weighs the parcel from every line, so a heavy cart pays the heavy band", async () => {
    mocks.features.shippingZones = true;
    mocks.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        rates: [
          rate({ id: "light", name: "Light", feeDkk: 3900, minWeightGram: 0, maxWeightGram: 9999 }),
          rate({ id: "pallet", name: "Pallet", feeDkk: 49500, minWeightGram: 10000, maxWeightGram: null }),
        ],
      },
    ]);
    const heavy = await price([
      { unitPriceDkk: 50000, quantity: 3, weightGram: 3000 },
      { unitPriceDkk: 1000, quantity: 1, weightGram: 1500 },
    ]);
    expect(heavy).toMatchObject({ shippingDkk: 49500, shippingRateName: "Pallet" });
  });

  it("an unweighed line never lowers the band: the known weight is a floor", async () => {
    mocks.features.shippingZones = true;
    mocks.findMany.mockResolvedValue([
      {
        countries: '["DK"]',
        rates: [
          rate({ id: "light", name: "Light", feeDkk: 3900, minWeightGram: 0, maxWeightGram: 9999 }),
          rate({ id: "pallet", name: "Pallet", feeDkk: 49500, minWeightGram: 10000, maxWeightGram: null }),
        ],
      },
    ]);
    const r = await price([
      { unitPriceDkk: 50000, quantity: 1, weightGram: 20000 },
      { unitPriceDkk: 1000, quantity: 1, weightGram: null }, // an accessory with no weight
    ]);
    expect(r).toMatchObject({ shippingDkk: 49500, shippingRateName: "Pallet" });
  });

  it("a zone's free threshold is checked on the subtotal before the discount, as the flat rate is", async () => {
    mocks.features.shippingZones = true;
    mocks.findMany.mockResolvedValue([
      { countries: '["DK"]', rates: [rate({ id: "gls", name: "GLS", feeDkk: 3900, freeThresholdDkk: 50000 })] },
    ]);
    const r = await price([{ unitPriceDkk: 60000, quantity: 1 }], { type: "percent", value: 50 } as never);
    expect(r).toMatchObject({ subtotalDkk: 60000, discountDkk: 30000, shippingDkk: 0, totalDkk: 30000 });
  });

  it("refuses when the zones cannot be read, instead of charging the flat rate", async () => {
    mocks.features.shippingZones = true;
    mocks.findMany.mockRejectedValue(new Error("db down"));
    const { ShippingUnavailableError } = await import("@/lib/shipping/zones");
    await expect(price([{ unitPriceDkk: 12500, quantity: 1 }])).rejects.toBeInstanceOf(ShippingUnavailableError);
  });
});
