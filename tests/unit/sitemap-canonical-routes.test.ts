import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(),
  categoryFindMany: vi.fn(),
  productFindMany: vi.fn(),
  postFindMany: vi.fn(),
  listPublishedPageSummaries: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/db", () => ({
  prisma: {
    category: { findMany: mocks.categoryFindMany },
    product: { findMany: mocks.productFindMany },
    post: { findMany: mocks.postFindMany },
  },
}));
vi.mock("@/lib/public-pages", () => ({
  listPublishedPageSummaries: mocks.listPublishedPageSummaries,
}));

const updatedAt = new Date("2026-08-23T12:00:00.000Z");

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.getBrand.mockResolvedValue({
    url: "https://shop.example/",
    locales: ["da", "en"],
    ecommerceEnabled: true,
    features: { blog: true, mcpPublic: true },
  });
  mocks.categoryFindMany.mockResolvedValue([{ slug: "frames" }]);
  mocks.productFindMany.mockResolvedValue([
    { slug: "aviator", createdAt: updatedAt },
  ]);
  mocks.postFindMany.mockResolvedValue([{ slug: "launch", updatedAt }]);
  mocks.listPublishedPageSummaries.mockResolvedValue([
    { slug: "om-os", title: "About", metaDescription: null, updatedAt },
    { slug: "privacy", title: "Privacy", metaDescription: null, updatedAt },
    { slug: "faq", title: "FAQ", metaDescription: null, updatedAt },
  ]);
});

describe("sitemap canonical route contracts", () => {
  it("publishes locale-prefixed canonical routes and direct trust URLs", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain("https://shop.example/da");
    expect(urls).toContain("https://shop.example/en");
    expect(urls).toContain("https://shop.example/da/privacy");
    expect(urls).toContain("https://shop.example/en/contact");
    expect(urls).not.toContain("https://shop.example/en/info/om-os");
    expect(urls).toContain("https://shop.example/da/info/faq");
    expect(urls).toContain("https://shop.example/en/product/aviator");
    expect(urls).toContain("https://shop.example/da/category/frames");
    expect(urls).toContain("https://shop.example/en/developers");
    expect(urls).toContain("https://shop.example/da/blog/launch");
    expect(urls).not.toContain("https://shop.example/info/privacy");
    expect(urls).not.toContain("https://shop.example/product/aviator");
    expect(new Set(urls).size).toBe(urls.length);
    expect(mocks.productFindMany).toHaveBeenCalledWith({
      select: { slug: true, createdAt: true },
      where: { stock: { gt: 0 }, deletedAt: null },
    });
  });

  it("keeps the no-database site sitemap on routes that physically ship", async () => {
    const { default: staticSitemap } = await import("@/app/sitemap.static");
    const urls = (await staticSitemap()).map((entry) => entry.url);

    expect(urls).toEqual(
      expect.arrayContaining([
        "https://shop.example/da",
        "https://shop.example/en",
        "https://shop.example/da/about",
        "https://shop.example/en/privacy",
        "https://shop.example/da/info/terms",
        "https://shop.example/en/info/cookies",
      ]),
    );
    expect(urls.some((url) => url.includes("/developers"))).toBe(false);
    expect(urls.some((url) => url.includes("/contact"))).toBe(false);
  });
});
