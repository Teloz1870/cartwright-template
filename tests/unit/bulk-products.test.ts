import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Bulk product edit (H8) — bulkUpdateProducts bygger den rigtige updateMany-
 * where/data, kr→øre, og afviser tom selektion / tomme updates. Mocket alt.
 */

const mocks = vi.hoisted(() => ({
  prisma: { product: { updateMany: vi.fn() } },
  requireAdmin: vi.fn(),
  withAudit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function reset() {
  vi.resetModules();
  mocks.prisma.product.updateMany.mockReset().mockResolvedValue({ count: 3 });
  mocks.requireAdmin.mockReset().mockResolvedValue({ user: { id: "admin" } });
  // withAudit passthrough: kør handleren
  mocks.withAudit.mockReset().mockImplementation(async (_meta: unknown, fn: () => Promise<unknown>) => fn());
}

describe("bulkUpdateProducts", () => {
  beforeEach(reset);

  it("afviser tom selektion", async () => {
    const { bulkUpdateProducts } = await import("@/app/admin/produkter/bulk-actions");
    const r = await bulkUpdateProducts([], { stock: 5 });
    expect(r.ok).toBe(false);
    expect(mocks.prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("afviser tomme updates", async () => {
    const { bulkUpdateProducts } = await import("@/app/admin/produkter/bulk-actions");
    const r = await bulkUpdateProducts(["p1"], {});
    expect(r.ok).toBe(false);
  });

  it("konverterer kr→øre + sætter where/data + returnerer count", async () => {
    const { bulkUpdateProducts } = await import("@/app/admin/produkter/bulk-actions");
    const r = await bulkUpdateProducts(["p1", "p2"], { priceKr: 199, stock: 10, featured: true });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(3);
    const call = mocks.prisma.product.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: { in: ["p1", "p2"] } });
    expect(call.data).toEqual({ priceDkk: 19900, stock: 10, featured: true });
  });

  it("ignorerer ugyldig pris (≤0)", async () => {
    const { bulkUpdateProducts } = await import("@/app/admin/produkter/bulk-actions");
    const r = await bulkUpdateProducts(["p1"], { priceKr: 0, stock: 4 });
    expect(r.ok).toBe(true);
    const call = mocks.prisma.product.updateMany.mock.calls[0][0];
    expect(call.data.priceDkk).toBeUndefined();
    expect(call.data.stock).toBe(4);
  });
});
