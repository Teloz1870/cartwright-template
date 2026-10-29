/**
 * STOREFRONT-DRAFT-FILTER — a draft product is not part of the public catalogue.
 *
 * `Product.status` ("active" | "draft", GAP6 #595) already kept a draft out of
 * the sitemap and the catalogue feed, while the PDP, the search endpoint,
 * /pricing.md, the permalink map, the wishlist and the public agent tools read
 * `deletedAt: null` alone — so a draft had a page with a 200, was searchable
 * and was handed to shoppers and anonymous agents. (The homepage, /produkter,
 * the category page and the wishlist are pinned in their own suites.)
 *
 * The fake `prisma.product` applies the `slug` / `status` / `deletedAt` /
 * `categoryId` / `id` / `permalink` parts of a `where` the way the database
 * would, and refuses any key it does not model — so dropping the filter in a
 * reader turns these red, with no source-grepping.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderPageBody } from "../helpers/page-body";

type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
  const products: Row[] = [];
  const MODELLED = new Set(["slug", "status", "deletedAt", "categoryId", "id", "permalink"]);
  const fits = (value: unknown, wanted: unknown): boolean => {
    if (wanted === null || typeof wanted !== "object") return value === wanted;
    if ("in" in wanted) return (wanted as { in: unknown[] }).in.includes(value);
    if ("not" in wanted) return value !== (wanted as { not: unknown }).not;
    throw new Error(`fake prisma: operator ${JSON.stringify(wanted)} is not modelled`);
  };
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([key, wanted]) => {
      if (!MODELLED.has(key)) throw new Error(`fake prisma: where.${key} is not modelled`);
      return fits(row[key], wanted);
    });
  const select = (where?: Row) => products.filter((row) => matches(row, where));
  const product = {
    findMany: vi.fn(async (q: { where?: Row; take?: number } = {}) => select(q.where).slice(0, q.take)),
    findFirst: vi.fn(async (q: { where?: Row } = {}) => select(q.where)[0] ?? null),
    aggregate: vi.fn(async (q: { where?: Row } = {}) => {
      const prices = select(q.where).map((r) => r.priceDkk as number);
      return {
        _min: { priceDkk: prices.length ? Math.min(...prices) : null },
        _max: { priceDkk: prices.length ? Math.max(...prices) : null },
        _count: { _all: prices.length },
      };
    }),
  };
  const category = {
    findMany: vi.fn(async (q: { include?: { _count?: { select: { products: { where: Row } } } } } = {}) => {
      const where = q.include?._count?.select.products.where;
      return [
        {
          id: "c1",
          slug: "mugs",
          name: "Mugs",
          description: null,
          parentId: null,
          _count: { products: products.filter((p) => p.categoryId === "c1" && matches(p, where)).length },
        },
      ];
    }),
  };
  return {
    products,
    select,
    prisma: { product, category },
    getBrand: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  };
});

vi.mock("@/lib/db", () => ({ prisma: db.prisma }));
vi.mock("@/lib/brand", () => ({ getBrand: db.getBrand }));
vi.mock("@/lib/search/semantic", () => ({ hybridRankProducts: vi.fn(async () => null) }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: db.notFound,
  redirect: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "da",
}));

const pdp = await import("@/app/[locale]/product/[slug]/page");
const searchRoute = await import("@/app/api/products/search/route");
const pricing = await import("@/app/pricing.md/route");
const { loadPermalinkMap, resetPermalinkMapCache } = await import("@/lib/permalinks/resolve-request");
const { searchProducts, getProduct } = await import("@/lib/tools/products");
const { presentProducts } = await import("@/lib/tools/ui");
const { listCategories } = await import("@/lib/tools/categories");

const base: Row = {
  description: "A stoneware mug",
  stock: 3,
  images: "[]",
  featured: true,
  brand: "Kiln",
  frameColor: null,
  lensColor: null,
  attributes: null,
  categoryId: "c1",
  category: { id: "c1", slug: "mugs", name: "Mugs", description: null, parentId: null, translations: null },
  variants: [],
  translations: null,
  deletedAt: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
};
const active: Row = { ...base, id: "p-live", slug: "mug", name: "Mug", priceDkk: 9900, status: "active", permalink: "/shop/mug" };
// Cheapest on purpose: a draft that leaked into /pricing.md would move its range.
const draft: Row = { ...base, id: "p-draft", slug: "draft-mug", name: "Draft Mug", priceDkk: 100, status: "draft", permalink: "/shop/draft-mug" };

const params = (slug: string) => Promise.resolve({ slug, locale: "da" });

beforeEach(() => {
  db.products.splice(0, db.products.length, active, draft);
  vi.clearAllMocks();
  db.getBrand.mockResolvedValue({
    ecommerceEnabled: true,
    url: "https://shop.dk",
    storeName: "Shop",
    defaultLocale: "da",
    locales: ["da"],
    features: {},
    metadata: { description: "Shop description" },
    policies: { currency: "DKK", country: "DK", shippingDefaultDkk: 0, returnDays: 14, pricesIncludeVat: true },
  });
});

describe("PDP — a draft product is not a page", () => {
  it("the page body answers notFound for a draft, as for a deleted product", async () => {
    await expect(pdp.default({ params: params("draft-mug") })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(db.notFound).toHaveBeenCalledTimes(1);
  });

  it("generateMetadata gives the not-found title, never the draft's name", async () => {
    expect((await pdp.generateMetadata({ params: params("draft-mug") })).title).toBe("notFound");
  });

  it("an active product still resolves (the filter does not over-reach)", async () => {
    expect((await pdp.generateMetadata({ params: params("mug") })).title).toBe("Mug");
    await expect(pdp.default({ params: params("mug") })).resolves.toBeTruthy();
    expect(db.notFound).not.toHaveBeenCalled();
  });

  it("the related-products strip of an active product leaves the draft out", async () => {
    let related: Row[] = [];
    // Stop the render right after the related read: what follows is JSON-LD +
    // JSX that needs the whole storefront graph, not this fact.
    db.prisma.product.findMany.mockImplementationOnce(async (q: { where?: Row } = {}) => {
      related = db.select(q.where);
      throw new Error("STOP_AT_RELATED");
    });
    await expect(renderPageBody(pdp.default({ params: params("mug") }))).rejects.toThrow("STOP_AT_RELATED");
    // Guard: the strip did read this category, and only the draft sat in it.
    expect(db.prisma.product.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { categoryId: "c1" } });
    expect(related).toEqual([]);
  });
});

describe("the public catalogue surfaces leave a draft out", () => {
  it("GET /api/products/search, with and without a query", async () => {
    const ids = async (qs: string) => {
      const res = await searchRoute.GET(new Request(`https://shop.dk/api/products/search${qs}`));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { products: Array<{ id: string }> };
      return body.products.map((p) => p.id);
    };
    expect(await ids("")).toEqual(["p-live"]);
    expect(await ids("?q=mug")).toEqual(["p-live"]);
  });

  it("/pricing.md neither counts, lists nor prices it", async () => {
    const text = await (await pricing.GET()).text();
    expect(text).toContain("currently lists 1 products from 99.00 DKK to 99.00 DKK");
    expect(text).toContain("[Mug]");
    expect(text).not.toContain("Draft Mug");
  });

  it("the permalink map has no address for it", async () => {
    resetPermalinkMapCache();
    const map = await loadPermalinkMap();
    expect(Object.values(map).map((t) => t.slug)).toEqual(["mug"]);
  });
});

// The same tools serve the owner (admin chat, admin UI, an API key the owner
// minted) and the public (shopper chat and voice, anonymous agents over REST
// and MCP). The owner still sees a draft; nobody else does.
const PUBLIC_ACTORS = ["system:public-agent", "storefront-chat:s1", "storefront-voice:s1", "system:cron"];
const OWNER_ACTORS = ["operator-chat:u1", "user:u1", "apikey:k1", "annotation:u1"];
const ctx = (actor: string) => ({ actor, ip: "10.0.0.9", userAgent: "agent/1.0" }) as never;

describe("public agent tools do not hand out a draft", () => {
  it.each(PUBLIC_ACTORS)("%s: products.search / products.get / ui.present_products / categories.list", async (actor) => {
    const found = (await searchProducts.handler({ limit: 20, offset: 0 } as never, ctx(actor))) as Row[];
    expect(found.map((p) => p.slug)).toEqual(["mug"]);
    await expect(getProduct.handler({ slug: "draft-mug" } as never, ctx(actor))).rejects.toThrow(
      "Product not found: draft-mug",
    );
    expect(((await getProduct.handler({ slug: "mug" } as never, ctx(actor))) as Row).slug).toBe("mug");
    const shown = (await presentProducts.handler(
      { layout: "grid", productSlugs: ["draft-mug", "mug"] } as never,
      ctx(actor),
    )) as { products: Row[] };
    expect(shown.products.map((p) => p.slug)).toEqual(["mug"]);
    const [cat] = (await listCategories.handler({} as never, ctx(actor))) as Row[];
    expect(cat.productCount).toBe(1);
  });

  it.each(OWNER_ACTORS)("%s: the owner's own callers still see the draft", async (actor) => {
    const found = (await searchProducts.handler({ limit: 20, offset: 0 } as never, ctx(actor))) as Row[];
    expect(found.map((p) => p.slug).sort()).toEqual(["draft-mug", "mug"]);
    expect(((await getProduct.handler({ slug: "draft-mug" } as never, ctx(actor))) as Row).slug).toBe("draft-mug");
    const shown = (await presentProducts.handler(
      { layout: "grid", productSlugs: ["draft-mug", "mug"] } as never,
      ctx(actor),
    )) as { products: Row[] };
    expect(shown.products.map((p) => p.slug)).toEqual(["draft-mug", "mug"]);
    const [cat] = (await listCategories.handler({} as never, ctx(actor))) as Row[];
    expect(cat.productCount).toBe(2);
  });
});
