import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Ønskeliste-server-lag (H1) — toggle (add/remove), id-liste, produkt-liste.
 * Mocket prisma.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    wishlistItem: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function reset() {
  vi.resetModules();
  for (const fn of Object.values(mocks.prisma.wishlistItem)) fn.mockReset();
  mocks.prisma.wishlistItem.create.mockResolvedValue({});
  mocks.prisma.wishlistItem.delete.mockResolvedValue({});
}

describe("toggleWishlist", () => {
  beforeEach(reset);

  it("tilføjer når ikke på listen", async () => {
    mocks.prisma.wishlistItem.findUnique.mockResolvedValue(null);
    const { toggleWishlist } = await import("@/lib/wishlist");
    const r = await toggleWishlist("u1", "p1");
    expect(r.wishlisted).toBe(true);
    expect(mocks.prisma.wishlistItem.create).toHaveBeenCalledWith({
      data: { userId: "u1", productId: "p1" },
    });
  });

  it("fjerner når allerede på listen", async () => {
    mocks.prisma.wishlistItem.findUnique.mockResolvedValue({ id: "w1" });
    const { toggleWishlist } = await import("@/lib/wishlist");
    const r = await toggleWishlist("u1", "p1");
    expect(r.wishlisted).toBe(false);
    expect(mocks.prisma.wishlistItem.delete).toHaveBeenCalledWith({ where: { id: "w1" } });
  });
});

describe("getWishlistProductIds / listWishlistProducts", () => {
  beforeEach(reset);

  it("returnerer produkt-id'er", async () => {
    mocks.prisma.wishlistItem.findMany.mockResolvedValue([
      { productId: "p1" },
      { productId: "p2" },
    ]);
    const { getWishlistProductIds } = await import("@/lib/wishlist");
    expect(await getWishlistProductIds("u1")).toEqual(["p1", "p2"]);
  });

  it("mapper til produkter (kun ikke-slettede)", async () => {
    mocks.prisma.wishlistItem.findMany.mockResolvedValue([
      { product: { id: "p1", name: "A" } },
    ]);
    const { listWishlistProducts } = await import("@/lib/wishlist");
    const products = await listWishlistProducts("u1");
    expect(products[0].id).toBe("p1");
    const where = mocks.prisma.wishlistItem.findMany.mock.calls[0][0].where;
    expect(where.product).toEqual({ deletedAt: null });
  });
});
