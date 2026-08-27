import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Hoptify-migration (HOP1) — hybrid: ægte import (palette + produkter) vs demo.
 * Mocket design-import + scraper + prisma + theme + audit.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    category: { findUnique: vi.fn(), create: vi.fn() },
    product: { create: vi.fn() },
    brandingSettings: { upsert: vi.fn() },
  },
  withAudit: vi.fn(),
  invalidateThemeCache: vi.fn(),
  extractDesignTokens: vi.fn(),
  applyDesignPalette: vi.fn(),
  scrapeProduct: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/theme", () => ({ invalidateThemeCache: mocks.invalidateThemeCache }));
vi.mock("@/lib/design-import/extract", () => ({ extractDesignTokens: mocks.extractDesignTokens }));
vi.mock("@/lib/design-import/apply", () => ({ applyDesignPalette: mocks.applyDesignPalette }));
vi.mock("@/lib/scrape/product", () => ({ scrapeProduct: mocks.scrapeProduct }));

const PALETTE = { accent: "#1", accentDeep: "#2", cream: "#3", sand: "#4", ink: "#5", muted: "#6" };

function reset() {
  vi.resetModules();
  mocks.prisma.category.findUnique.mockReset().mockResolvedValue(null);
  mocks.prisma.category.create.mockReset().mockResolvedValue({ id: "cat1" });
  mocks.prisma.product.create.mockReset().mockResolvedValue({});
  mocks.prisma.brandingSettings.upsert.mockReset().mockResolvedValue({});
  mocks.withAudit.mockReset().mockImplementation(async (_m: unknown, fn: () => Promise<unknown>) => fn());
  mocks.invalidateThemeCache.mockReset();
  mocks.extractDesignTokens.mockReset();
  mocks.applyDesignPalette.mockReset().mockResolvedValue({ ok: true });
  mocks.scrapeProduct.mockReset();
}

describe("migrateFromShopify", () => {
  beforeEach(reset);

  it("ægte: importerer palette + produkt, anvender Hoptify-design", async () => {
    mocks.extractDesignTokens.mockResolvedValue({ ok: true, tokens: { palette: PALETTE } });
    mocks.scrapeProduct.mockResolvedValue({
      ok: true,
      product: { name: "Kaffe", description: "Lækker kaffe fra Brasilien", priceKr: 125, imageUrls: ["https://a.dk/1.jpg"] },
    });
    const { migrateFromShopify } = await import("@/lib/hoptify/migrate");
    const r = await migrateFromShopify(
      { storeUrl: "https://x.myshopify.com", productUrls: ["https://x.myshopify.com/products/kaffe"] },
      "user:test",
    );
    expect(r.mode).toBe("real");
    expect(r.paletteApplied).toBe(true);
    expect(r.productsImported).toBe(1);
    expect(r.designApplied).toBe(true);
    expect(mocks.prisma.brandingSettings.upsert.mock.calls[0][0].update.designSlug).toBe("hoptify");
    expect(mocks.prisma.product.create.mock.calls[0][0].data.priceDkk).toBe(12500);
  });

  it("demo: ingen key/URL → design anvendt, mode demo", async () => {
    mocks.extractDesignTokens.mockResolvedValue({ ok: false, error: "FIRECRAWL_API_KEY mangler" });
    const { migrateFromShopify } = await import("@/lib/hoptify/migrate");
    const r = await migrateFromShopify({ storeUrl: "https://x.myshopify.com" }, "user:test");
    expect(r.mode).toBe("demo");
    expect(r.designApplied).toBe(true);
    expect(r.productsImported).toBe(0);
    expect(mocks.prisma.product.create).not.toHaveBeenCalled();
  });
});
