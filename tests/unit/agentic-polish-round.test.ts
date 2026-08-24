import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The agentic-polish round (post-v0.46.0): honest ergonomics for agents.
 * Contracts pinned here:
 *
 *  1. Unknown /api/* paths answer problem+json 404 (never the HTML 404) —
 *     the API surface speaks its own error format edge to edge.
 *  2. /auth.md documents the REAL auth model, is mcpPublic-gated, and opens
 *     with YAML frontmatter (title/description/canonical/last-updated).
 *  3. /pricing.md exists only in webshop mode (a website-mode brand sells
 *     nothing — a pricing file would be a false advertisement) and carries
 *     currency + live price range.
 *  4. /.well-known/ai-catalog.json lists only surfaces the profile runs:
 *     pricing appears iff ecommerce is enabled; the whole file is
 *     mcpPublic-gated like the rest of the discovery surface.
 *  5. categories.list's `includeEmpty` filters zero-product categories but
 *     defaults to the historical include-everything behaviour.
 *  6. products.search `offset` pages the lexical (public) search window
 *     instead of always returning the head of the list.
 */

const mocks = vi.hoisted(() => ({
  brand: {
    url: "https://shop.example",
    storeName: "Test Shop",
    defaultLocale: "en",
    locales: ["da", "en"],
    tagline: "A test shop",
    metadata: { description: "A test shop" },
    policies: { currency: "DKK", country: "DK", pricesIncludeVat: true },
    ecommerceEnabled: true,
    features: { mcpPublic: true },
  } as Record<string, unknown>,
  gate: { available: true, features: { mcpPublic: true } },
  prisma: {
    product: { aggregate: vi.fn(), findMany: vi.fn() },
    category: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/brand", () => ({
  getBrand: async () => mocks.brand,
  getFeatureGateState: async () => mocks.gate,
}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: vi.fn() }));

const ctx = {
  actor: "system:public-agent",
  ip: "10.0.0.9",
  userAgent: "agent/1.0",
} as never;

beforeEach(() => {
  mocks.brand.ecommerceEnabled = true;
  mocks.gate = { available: true, features: { mcpPublic: true } };
  mocks.prisma.product.aggregate.mockReset();
  mocks.prisma.product.findMany.mockReset();
  mocks.prisma.category.findMany.mockReset();
});

describe("unknown /api paths answer problem+json", () => {
  it("404s with the API's own error format, pointing at the spec", async () => {
    const route = await import("@/app/api/[...unknown]/route");
    for (const method of [route.GET, route.POST] as const) {
      const response = method(new Request("https://shop.example/api/v1/nope"));
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(response.headers.get("link")).toContain('rel="service-desc"');
      const body = await response.clone().json();
      expect(body.code).toBe("endpoint_not_found");
      expect(body.instance).toBe("/api/v1/nope");
    }
  });

  it("covers the /api root itself", async () => {
    const route = await import("@/app/api/route");
    const response = route.GET(new Request("https://shop.example/api"));
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });
});

describe("/auth.md", () => {
  it("opens with a leading heading and documents the real auth model", async () => {
    const route = await import("@/app/auth.md/route");
    const response = await route.GET(new Request("https://shop.example/auth.md"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    const body = await response.text();
    // Markdown-detection heuristics require the doc to OPEN with a heading —
    // canonical + freshness live in the footer line instead of frontmatter.
    expect(body.startsWith("# API authentication")).toBe(true);
    expect(body).toContain("Canonical: https://shop.example/auth.md");
    expect(body).toContain("Last updated:");
    expect(body).toContain("Bearer");
    expect(body).toContain("products.search");
    expect(body).toContain("`catalog:read`");
    // Honesty: no OAuth flow is offered, and the file says so explicitly.
    expect(body).toContain("no OAuth");
  });

  it("is gated with the rest of the public agent surface", async () => {
    mocks.gate = { available: true, features: { mcpPublic: false } };
    const route = await import("@/app/auth.md/route");
    const response = await route.GET(new Request("https://shop.example/auth.md"));
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });
});

describe("/pricing.md", () => {
  it("renders currency, VAT treatment and the live range in webshop mode", async () => {
    mocks.prisma.product.aggregate.mockResolvedValue({
      _min: { priceDkk: 9900 },
      _max: { priceDkk: 249900 },
      _count: { _all: 12 },
    });
    const route = await import("@/app/pricing.md/route");
    const response = await route.GET();
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body.startsWith("---\n")).toBe(true);
    expect(body).toContain("99.00 DKK");
    expect(body).toContain("2499.00 DKK");
    expect(body).toContain("include VAT");
  });

  it("is a real 404 in website mode — no false pricing advertisement", async () => {
    mocks.brand.ecommerceEnabled = false;
    const route = await import("@/app/pricing.md/route");
    const response = await route.GET();
    expect(response.status).toBe(404);
  });

  it("fails soft when the DB is unavailable", async () => {
    mocks.prisma.product.aggregate.mockRejectedValue(new Error("db down"));
    const route = await import("@/app/pricing.md/route");
    const response = await route.GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("being stocked");
  });
});

describe("/.well-known/ai-catalog.json", () => {
  it("lists agent resources, pricing only when the shop sells", async () => {
    const route = await import("@/app/.well-known/ai-catalog.json/route");
    const withShop = await (await route.GET()).json();
    const rels = withShop.resources.map((r: { rel: string }) => r.rel);
    expect(rels).toContain("mcp-server");
    expect(rels).toContain("auth");
    expect(rels).toContain("pricing");
    // Trust manifest: top-level AND on every entry, pointing at the real
    // canonical trust routes.
    expect(withShop.trustManifest.privacy).toBe("https://shop.example/en/privacy");
    for (const resource of withShop.resources) {
      expect(resource.trustManifest.contact).toBe("https://shop.example/en/contact");
    }

    mocks.brand.ecommerceEnabled = false;
    const withoutShop = await (await route.GET()).json();
    const rels2 = withoutShop.resources.map((r: { rel: string }) => r.rel);
    expect(rels2).not.toContain("pricing");
  });

  it("is mcpPublic-gated", async () => {
    mocks.gate = { available: true, features: { mcpPublic: false } };
    const route = await import("@/app/.well-known/ai-catalog.json/route");
    expect((await route.GET()).status).toBe(404);
  });
});

describe("categories.list includeEmpty", () => {
  const rows = [
    { id: "c1", slug: "beans", name: "Beans", description: "d", _count: { products: 4 } },
    { id: "c2", slug: "mugs", name: "Mugs", description: null, _count: { products: 0 } },
  ];

  it("defaults to the historical include-everything behaviour", async () => {
    mocks.prisma.category.findMany.mockResolvedValue(rows);
    const { listCategories } = await import("@/lib/tools/categories");
    const result = (await listCategories.handler({}, ctx)) as Array<{ slug: string }>;
    expect(result.map((c) => c.slug)).toEqual(["beans", "mugs"]);
  });

  it("filters zero-product categories when includeEmpty is false", async () => {
    mocks.prisma.category.findMany.mockResolvedValue(rows);
    const { listCategories } = await import("@/lib/tools/categories");
    const result = (await listCategories.handler({ includeEmpty: false }, ctx)) as Array<{
      slug: string;
    }>;
    expect(result.map((c) => c.slug)).toEqual(["beans"]);
  });
});

describe("products.search offset pagination", () => {
  const product = (i: number) => ({
    id: `p${i}`,
    slug: `product-${i}`,
    name: `Product ${String(i).padStart(2, "0")}`,
    brand: null,
    description: "roast",
    priceDkk: 1000 + i,
    stock: 3,
    featured: false,
    frameColor: null,
    lensColor: null,
    images: "[]",
    imageUrl: null,
    category: { slug: "beans", name: "Beans" },
  });

  it("pages the anonymous lexical search window", async () => {
    mocks.prisma.product.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => product(i)),
    );
    const { searchProducts } = await import("@/lib/tools/products");
    const page = (await searchProducts.handler(
      { q: "roast", limit: 3, offset: 3 } as never,
      ctx,
    )) as Array<{ id: string }>;
    expect(page.map((p) => p.id)).toEqual(["p3", "p4", "p5"]);
  });

  it("passes skip/take to the DB when there is no free-text query", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([product(7)]);
    const { searchProducts } = await import("@/lib/tools/products");
    await searchProducts.handler({ limit: 5, offset: 10 } as never, ctx);
    const arg = mocks.prisma.product.findMany.mock.calls[0][0];
    expect(arg.skip).toBe(10);
    expect(arg.take).toBe(5);
  });
});
