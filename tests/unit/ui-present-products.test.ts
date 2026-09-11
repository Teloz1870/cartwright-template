import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Hul B — ui.present_products. Tester at modellen-valgte layout + produkt-
 * rækkefølge bevares, brand-null mappes til "", manglende slugs filtreres,
 * og metadata (scope/skipAudit) er korrekt for et customer-facing read-tool.
 * prisma + image-shim er mocket.
 */

const mocks = vi.hoisted(() => ({
  prisma: { product: { findMany: vi.fn() } },
  resolveProductImageUrls: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/media/shim", () => ({
  resolveProductImageUrls: mocks.resolveProductImageUrls,
}));

import { presentProducts } from "@/lib/tools/ui";
import type { ToolCtx } from "@/lib/tools/types";

const ctx = { actor: "test", ip: null, userAgent: null } as unknown as ToolCtx;

beforeEach(() => {
  mocks.prisma.product.findMany.mockReset();
  mocks.resolveProductImageUrls.mockReset().mockReturnValue(["img.jpg"]);
});

describe("ui.present_products — metadata", () => {
  it("er et read-only customer-tool", () => {
    expect(presentProducts.name).toBe("ui.present_products");
    expect(presentProducts.scope).toBe("catalog:read");
    expect(presentProducts.skipAudit).toBe(true);
  });
});

describe("ui.present_products — handler", () => {
  it("bevarer modellens valgte rækkefølge og layout", async () => {
    // DB returnerer omvendt rækkefølge; tool'et skal re-ordne efter input.
    mocks.prisma.product.findMany.mockResolvedValue([
      { slug: "b", name: "B", brand: "Br", priceDkk: 200, stock: 1, category: {} },
      { slug: "a", name: "A", brand: "Ar", priceDkk: 100, stock: 5, category: {} },
    ]);

    const res = (await presentProducts.handler(
      { layout: "comparison", productSlugs: ["a", "b"] },
      ctx,
    )) as { layout: string; note: string | null; products: { slug: string }[] };

    expect(res.layout).toBe("comparison");
    expect(res.note).toBeNull();
    expect(res.products.map((p) => p.slug)).toEqual(["a", "b"]);
  });

  it("mapper brand-null til tom streng og bruger første billede", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      { slug: "a", name: "A", brand: null, priceDkk: 100, stock: 0, category: {} },
    ]);
    mocks.resolveProductImageUrls.mockReturnValue(["first.jpg", "second.jpg"]);

    const res = (await presentProducts.handler(
      { layout: "spotlight", productSlugs: ["a"], note: "Mit bud" },
      ctx,
    )) as { note: string | null; products: { brand: string; firstImage: string | null }[] };

    expect(res.note).toBe("Mit bud");
    expect(res.products[0].brand).toBe("");
    expect(res.products[0].firstImage).toBe("first.jpg");
  });

  it("dedupérer gentagne slugs (undgår dublerede React-keys)", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      { slug: "a", name: "A", brand: "Ar", priceDkk: 100, stock: 5, category: {} },
    ]);

    const res = (await presentProducts.handler(
      { layout: "grid", productSlugs: ["a", "a", "a"] },
      ctx,
    )) as { products: { slug: string }[] };

    expect(res.products.map((p) => p.slug)).toEqual(["a"]);
  });

  it("filtrerer slugs væk der ikke findes i DB", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      { slug: "a", name: "A", brand: "Ar", priceDkk: 100, stock: 5, category: {} },
    ]);

    const res = (await presentProducts.handler(
      { layout: "grid", productSlugs: ["a", "ghost"] },
      ctx,
    )) as { products: { slug: string }[] };

    expect(res.products.map((p) => p.slug)).toEqual(["a"]);
  });
});
