import { beforeEach, describe, expect, it, vi } from "vitest";

import { KNOWN_SHADOWED } from "../helpers/known-shadowed";

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
    website: { showAuditFeed: true },
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
      where: { status: "active", deletedAt: null },
    });
  });

  it("keeps a sold-out product in the sitemap and never lists a draft", async () => {
    // The fake applies the sitemap's `where` the way the database would, so
    // the old `stock: { gt: 0 }` filter drops the sold-out row (red) and a
    // missing `status` filter lets the draft through (red) — the assertion is
    // on the URLs the sitemap publishes, not on the query object.
    type Row = { slug: string; createdAt: Date; stock: number; status: string; deletedAt: Date | null };
    type Where = { stock?: { gt: number }; status?: string; deletedAt?: null };
    const rows: Row[] = [
      { slug: "sold-out", createdAt: updatedAt, stock: 0, status: "active", deletedAt: null },
      { slug: "in-stock", createdAt: updatedAt, stock: 4, status: "active", deletedAt: null },
      { slug: "draft", createdAt: updatedAt, stock: 4, status: "draft", deletedAt: null },
      { slug: "gone", createdAt: updatedAt, stock: 4, status: "active", deletedAt: updatedAt },
    ];
    mocks.productFindMany.mockImplementation(async ({ where }: { where: Where }) =>
      rows
        .filter((r) => (where.stock ? r.stock > where.stock.gt : true))
        .filter((r) => (where.status !== undefined ? r.status === where.status : true))
        .filter((r) => ("deletedAt" in where ? r.deletedAt === where.deletedAt : true))
        .map(({ slug, createdAt }) => ({ slug, createdAt })),
    );

    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toContain("https://shop.example/da/product/sold-out");
    expect(urls).toContain("https://shop.example/da/product/in-stock");
    expect(urls).not.toContain("https://shop.example/da/product/draft");
    expect(urls).not.toContain("https://shop.example/da/product/gone");
  });

  it("never lists a locale-shadowed path — a sitemap entry must answer (AUD18-a)", async () => {
    // KNOWN_SHADOWED is the list tests/unit/locale-exempt-routes.test.ts keeps
    // of routes that answer 307 → 404 on purpose. `/manifest` sat here under
    // `engineMarketing` while being one of them, measured live on Teloz
    // 2026-09-21. Both sitemaps are read; the mocks above leave every gate on
    // (`showAuditFeed`, `mcpPublic`, `blog`, the real `profileCapabilities`), so
    // a shadowed entry behind any of them is seen, not skipped.
    const shadowed = Object.keys(KNOWN_SHADOWED);
    expect(shadowed.length).toBeGreaterThan(0);

    const { default: sitemap } = await import("@/app/sitemap");
    const { default: staticSitemap } = await import("@/app/sitemap.static");
    const paths = [...(await sitemap()), ...(await staticSitemap())].map(
      (entry) => new URL(entry.url).pathname,
    );

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => shadowed.includes(p))).toEqual([]);
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
