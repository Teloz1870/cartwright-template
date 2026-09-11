import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Shipping zones + fulfillment (Track G). resolveShipping (flag off → flat, on →
 * zone-rate) + createFulfillmentOrders (routing + idempotens). Mocket prisma +
 * brand.config + mailer.
 */

const mocks = vi.hoisted(() => ({
  features: { shippingZones: false },
  prisma: {
    shippingZone: { findMany: vi.fn() },
    order: { findUnique: vi.fn() },
    fulfillmentOrder: { findFirst: vi.fn(), create: vi.fn() },
  },
  withAudit: vi.fn(),
  shouldUseResend: vi.fn(),
  getResendApiKey: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/brand.config", () => ({
  brand: {
    url: "https://shop.dk",
    storeName: "Shop",
    emails: { from: "a@b.dk", fromName: "Shop" },
    features: mocks.features,
    policies: { shippingFreeThresholdDkk: 49900, shippingDefaultDkk: 4900 },
  },
}));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/mailer/resend", () => ({
  shouldUseResend: mocks.shouldUseResend,
  getResendApiKey: mocks.getResendApiKey,
}));

function reset() {
  vi.resetModules();
  mocks.features.shippingZones = false;
  mocks.prisma.shippingZone.findMany.mockReset();
  mocks.prisma.order.findUnique.mockReset();
  mocks.prisma.fulfillmentOrder.findFirst.mockReset().mockResolvedValue(null);
  mocks.prisma.fulfillmentOrder.create.mockReset().mockResolvedValue({});
  mocks.withAudit.mockReset().mockImplementation(async (_m: unknown, fn: () => Promise<unknown>) => fn());
  mocks.shouldUseResend.mockReset().mockResolvedValue(false);
  mocks.getResendApiKey.mockReset().mockResolvedValue(null);
}

describe("resolveShipping", () => {
  beforeEach(reset);

  it("flag off → flad fragt", async () => {
    const { resolveShipping } = await import("@/lib/shipping/zones");
    const q = await resolveShipping({ country: "DK", subtotalDkk: 10000 });
    expect(q.source).toBe("flat");
    expect(q.feeDkk).toBe(4900);
  });

  it("flag on + zone-match → rate + leveringstid", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      {
        countries: '["DK","SE"]',
        rates: [{ name: "Std", feeDkk: 3900, freeThresholdDkk: null, minWeightGram: null, maxWeightGram: null, deliveryDaysMin: 2, deliveryDaysMax: 4 }],
      },
    ]);
    const { resolveShipping } = await import("@/lib/shipping/zones");
    const q = await resolveShipping({ country: "dk", subtotalDkk: 10000 });
    expect(q.source).toBe("zone");
    expect(q.feeDkk).toBe(3900);
    expect(q.deliveryDaysMin).toBe(2);
  });

  it("flag on + fri-fragt-grænse nået → 0", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([
      { countries: '["DK"]', rates: [{ name: "Std", feeDkk: 3900, freeThresholdDkk: 50000, minWeightGram: null, maxWeightGram: null, deliveryDaysMin: 2, deliveryDaysMax: 4 }] },
    ]);
    const { resolveShipping } = await import("@/lib/shipping/zones");
    const q = await resolveShipping({ country: "DK", subtotalDkk: 60000 });
    expect(q.feeDkk).toBe(0);
  });

  it("flag on + ingen zone → flad fragt", async () => {
    mocks.features.shippingZones = true;
    mocks.prisma.shippingZone.findMany.mockResolvedValue([{ countries: '["SE"]', rates: [{ feeDkk: 1 }] }]);
    const { resolveShipping } = await import("@/lib/shipping/zones");
    const q = await resolveShipping({ country: "DK", subtotalDkk: 10000 });
    expect(q.source).toBe("flat");
  });
});

describe("createFulfillmentOrders", () => {
  beforeEach(reset);

  it("router varer til leverandør + opretter én fulfillment-ordre", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: "o1",
      shippingName: "Kim", shippingAddress: "Vej 1", shippingZip: "1000", shippingCity: "Kbh",
      items: [
        { productName: "A", quantity: 1, product: { supplierId: "s1", supplier: { id: "s1", name: "Sup", email: null, mode: "manual" } } },
        { productName: "B", quantity: 2, product: { supplierId: "s1", supplier: { id: "s1", name: "Sup", email: null, mode: "manual" } } },
        { productName: "C", quantity: 1, product: { supplierId: null, supplier: null } },
      ],
    });
    const { createFulfillmentOrders } = await import("@/lib/fulfillment");
    const r = await createFulfillmentOrders("o1", "user:test");
    expect(r.created).toBe(1);
    const data = mocks.prisma.fulfillmentOrder.create.mock.calls[0][0].data;
    expect(data.supplierId).toBe("s1");
    expect(JSON.parse(data.lineJson)).toHaveLength(2);
  });

  it("er idempotent (eksisterende fulfillment-ordre springes over)", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: "o1", shippingName: "", shippingAddress: "", shippingZip: "", shippingCity: "",
      items: [{ productName: "A", quantity: 1, product: { supplierId: "s1", supplier: { id: "s1", name: "Sup", email: null, mode: "manual" } } }],
    });
    mocks.prisma.fulfillmentOrder.findFirst.mockResolvedValue({ id: "existing" });
    const { createFulfillmentOrders } = await import("@/lib/fulfillment");
    const r = await createFulfillmentOrders("o1", "user:test");
    expect(r.created).toBe(0);
    expect(mocks.prisma.fulfillmentOrder.create).not.toHaveBeenCalled();
  });
});
