import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * getCatalogFeed() — the neutral CatalogFeedItem builder (lib/feeds/catalog-feed.ts)
 * that is the SINGLE source-of-truth feeding BOTH agent-discovery feeds: the ACP
 * feed (lib/feeds/acp-feed.ts, /api/acp/feed) and the Google Merchant feed
 * (lib/feeds/google-merchant.ts, /feed/google.xml). Both serializers have their own
 * tests (acp-feed.test.ts / google-merchant-feed.test.ts) but they take pre-built
 * CatalogFeedItem fixtures — nothing tested the builder that PRODUCES those items
 * from Prisma rows. A regression here (variant expansion, attribute coercion, URL
 * absolutization, availability) silently corrupts BOTH feeds, so this locks it.
 *
 * `getCatalogFeed` is `server-only` (vitest alias-shims it) + hits prisma / getBrand /
 * resolveProductImageUrls — mock those @/ seams (the #328 pattern). `flatStringAttrs`
 * is private, so its coercion is exercised THROUGH the public builder (higher-value:
 * the real variant-merge + coercion integration, not the helper in isolation).
 */

const mocks = vi.hoisted(() => ({
  prisma: { product: { findMany: vi.fn() } },
  getBrand: vi.fn(),
  // resolveProductImageUrls(p) → string[]; keyed off a test-only __images field.
  resolveImages: vi.fn((p: { __images?: string[] }) => p.__images ?? []),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/media/shim", () => ({ resolveProductImageUrls: mocks.resolveImages }));

import { getCatalogFeed } from "@/lib/feeds/catalog-feed";

/** Minimal Prisma-shaped product row (matches the builder's `include`). */
function product(overrides: Record<string, unknown> = {}) {
  return {
    slug: "blue-mug",
    name: "Blue Mug",
    description: "A nice mug.",
    priceDkk: 19900,
    stock: 5,
    brand: "Acme",
    attributes: null,
    category: { name: "Mugs" },
    variants: [],
    __images: ["/img/blue-mug.jpg"],
    ...overrides,
  };
}

function setBrand(url = "https://shop.example", currency = "DKK") {
  mocks.getBrand.mockResolvedValue({ url, policies: { currency } });
}

beforeEach(() => {
  mocks.prisma.product.findMany.mockReset();
  mocks.getBrand.mockReset();
  mocks.resolveImages.mockClear();
  setBrand();
});

describe("getCatalogFeed — non-variant products", () => {
  it("maps one item per product: id=slug, priceMinor=priceDkk, currency, category, absolute url", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([product()]);
    const [item] = await getCatalogFeed();
    expect(item.id).toBe("blue-mug"); // slug, not sku
    expect(item.title).toBe("Blue Mug");
    expect(item.priceMinor).toBe(19900); // øre passed through, no conversion here
    expect(item.currency).toBe("DKK");
    expect(item.category).toBe("Mugs");
    expect(item.brand).toBe("Acme");
    expect(item.url).toBe("https://shop.example/product/blue-mug");
    expect(item.imageUrl).toBe("https://shop.example/img/blue-mug.jpg");
  });

  it("derives availability from stock (>0 in_stock, 0 out_of_stock)", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      product({ slug: "a", stock: 1 }),
      product({ slug: "b", stock: 0 }),
    ]);
    const items = await getCatalogFeed();
    expect(items.find((i) => i.id === "a")!.availability).toBe("in_stock");
    expect(items.find((i) => i.id === "b")!.availability).toBe("out_of_stock");
  });

  it("only queries non-soft-deleted products (deletedAt: null)", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([]);
    await getCatalogFeed();
    expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });

  it("returns [] for an empty catalogue", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([]);
    expect(await getCatalogFeed()).toEqual([]);
  });
});

describe("getCatalogFeed — URL absolutization", () => {
  it("prefixes a leading-slash relative image with the brand base", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([product({ __images: ["/img/x.jpg"] })]);
    expect((await getCatalogFeed())[0].imageUrl).toBe("https://shop.example/img/x.jpg");
  });

  it("inserts the missing slash for a relative image with no leading slash", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([product({ __images: ["img/x.jpg"] })]);
    expect((await getCatalogFeed())[0].imageUrl).toBe("https://shop.example/img/x.jpg");
  });

  it("leaves an already-absolute http(s) image URL untouched", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      product({ __images: ["https://cdn.example/x.jpg"] }),
    ]);
    expect((await getCatalogFeed())[0].imageUrl).toBe("https://cdn.example/x.jpg");
  });

  it("yields imageUrl=null when the product has no images", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([product({ __images: [] })]);
    expect((await getCatalogFeed())[0].imageUrl).toBeNull();
  });

  it("strips a trailing slash from the brand base before composing url/image", async () => {
    setBrand("https://shop.example/");
    mocks.prisma.product.findMany.mockResolvedValue([product({ __images: ["/img/x.jpg"] })]);
    const [item] = await getCatalogFeed();
    expect(item.url).toBe("https://shop.example/product/blue-mug"); // no double slash
    expect(item.imageUrl).toBe("https://shop.example/img/x.jpg");
  });
});

describe("getCatalogFeed — variant expansion", () => {
  it("emits one item per variant with id=sku, variant price + availability, parent title/image", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      product({
        slug: "tee",
        priceDkk: 9900, // parent price ignored once variants exist
        stock: 99,
        __images: ["/img/tee.jpg"],
        variants: [
          { sku: "tee-s", priceDkk: 10000, stock: 3, attributes: {} },
          { sku: "tee-l", priceDkk: 12000, stock: 0, attributes: {} },
        ],
      }),
    ]);
    const items = await getCatalogFeed();
    expect(items).toHaveLength(2);
    const s = items.find((i) => i.id === "tee-s")!;
    const l = items.find((i) => i.id === "tee-l")!;
    expect(s.priceMinor).toBe(10000);
    expect(s.availability).toBe("in_stock");
    expect(l.priceMinor).toBe(12000);
    expect(l.availability).toBe("out_of_stock"); // per-variant stock, not parent's 99
    // Parent-inherited fields:
    expect(s.title).toBe("Blue Mug"); // product.name
    expect(s.imageUrl).toBe("https://shop.example/img/tee.jpg");
    expect(s.url).toBe("https://shop.example/product/tee");
  });
});

describe("getCatalogFeed — flatStringAttrs coercion (#342 g:product_detail)", () => {
  it("keeps primitive values (string/number/boolean → string), drops empty/whitespace strings", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      product({
        attributes: {
          material: "ceramic",
          volume_ml: 350,
          dishwasher_safe: true,
          empty: "",
          blank: "   ",
        },
      }),
    ]);
    const [item] = await getCatalogFeed();
    expect(item.attributes).toEqual({
      material: "ceramic",
      volume_ml: "350",
      dishwasher_safe: "true",
    });
    expect(item.attributes).not.toHaveProperty("empty");
    expect(item.attributes).not.toHaveProperty("blank");
  });

  it("skips nested object/array attribute VALUES (feed never emits junk)", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      product({
        attributes: { color: "blue", specs: { a: 1 }, tags: ["x", "y"] },
      }),
    ]);
    const [item] = await getCatalogFeed();
    expect(item.attributes).toEqual({ color: "blue" });
  });

  it("leaves attributes undefined when the product has none / all non-primitive", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      product({ slug: "n", attributes: null }),
      product({ slug: "e", attributes: {} }),
      product({ slug: "a", attributes: ["arr"] }), // top-level array → undefined
      product({ slug: "o", attributes: { nested: { x: 1 } } }), // only non-primitive
    ]);
    const items = await getCatalogFeed();
    for (const id of ["n", "e", "a", "o"]) {
      expect(items.find((i) => i.id === id)!.attributes).toBeUndefined();
    }
  });

  it("merges product + variant attributes with the VARIANT winning on key collision", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      product({
        slug: "cap",
        attributes: { material: "cotton", brand_line: "classic" },
        variants: [
          { sku: "cap-red", priceDkk: 5000, stock: 2, attributes: { color: "red", material: "wool" } },
        ],
      }),
    ]);
    const [item] = await getCatalogFeed();
    expect(item.attributes).toEqual({
      brand_line: "classic", // from product
      color: "red", // from variant
      material: "wool", // variant overrides product's "cotton"
    });
  });

  it("leaves a variant's attributes undefined when neither product nor variant has primitives", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      product({
        slug: "plain",
        attributes: null,
        variants: [{ sku: "plain-1", priceDkk: 5000, stock: 2, attributes: {} }],
      }),
    ]);
    expect((await getCatalogFeed())[0].attributes).toBeUndefined();
  });
});
