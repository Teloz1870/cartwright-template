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
  prisma: { product: { findMany: vi.fn() }, productVariant: { findMany: vi.fn() } },
  getBrand: vi.fn(),
  // resolveProductImageUrls(p) → string[]; keyed off a test-only __images field.
  resolveImages: vi.fn((p: { __images?: string[] }) => p.__images ?? []),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/media/shim", () => ({ resolveProductImageUrls: mocks.resolveImages }));

import { getCatalogFeed } from "@/lib/feeds/catalog-feed";
import { buildAcpFeed } from "@/lib/feeds/acp-feed";
import { buildGoogleMerchantXml } from "@/lib/feeds/google-merchant";
import { routing } from "@/i18n/routing";

/** The PDP lives under a locale; the feed links the default one, never a 307. */
const L = routing.defaultLocale;

/** Minimal Prisma-shaped product row (matches the builder's `include`). */
function product(overrides: Record<string, unknown> = {}) {
  return {
    slug: "blue-mug",
    sku: null,
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
  mocks.prisma.productVariant.findMany.mockReset();
  mocks.getBrand.mockReset();
  mocks.resolveImages.mockClear();
  setBrand();
});

describe("getCatalogFeed — non-variant products", () => {
  it("maps one item per product: id=slug, priceMinor=priceDkk, currency, category, absolute url", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([product()]);
    const [item] = await getCatalogFeed();
    expect(item.id).toBe("blue-mug"); // no sku set → slug
    expect(item.title).toBe("Blue Mug");
    expect(item.priceMinor).toBe(19900); // øre passed through, no conversion here
    expect(item.currency).toBe("DKK");
    expect(item.category).toBe("Mugs");
    expect(item.brand).toBe("Acme");
    expect(item.url).toBe(`https://shop.example/${L}/product/blue-mug`);
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

  it("only queries active, non-soft-deleted products (a draft is not a public item)", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([]);
    await getCatalogFeed();
    expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "active", deletedAt: null } }),
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
    expect(item.url).toBe(`https://shop.example/${L}/product/blue-mug`); // no double slash
    expect(item.imageUrl).toBe("https://shop.example/img/x.jpg");
  });
});

/**
 * A fake that answers the way the database would — by the `where` it is given
 * (`deletedAt: null`, `status`) — for the feed's own query and for the slug and
 * variant-sku look-ups behind the "is this sku free" check.
 */
type Row = ReturnType<typeof product> & { status?: string; deletedAt?: Date | null };
function catalog(rows: Row[]) {
  const matches = (r: Row, where?: { deletedAt?: null; status?: string }) =>
    (where?.deletedAt !== null || !r.deletedAt) &&
    (where?.status === undefined || (r.status ?? "active") === where.status);
  mocks.prisma.product.findMany.mockImplementation(
    async ({ where, select }: { where?: { deletedAt?: null; status?: string }; select?: unknown }) => {
      const hit = rows.filter((r) => matches(r, where));
      return select ? hit.map((r) => ({ slug: r.slug })) : hit;
    },
  );
  mocks.prisma.productVariant.findMany.mockImplementation(
    async ({ where }: { where?: { product?: { deletedAt?: null; status?: string } } }) =>
      rows
        .filter((r) => matches(r, where?.product))
        .flatMap((r) => (r.variants as Array<{ sku: string }>).map((v) => ({ sku: v.sku }))),
  );
}

const tee = () =>
  product({
    slug: "tee",
    sku: "CW-TEE",
    variants: [
      { sku: "tee-s", priceDkk: 10000, stock: 3, attributes: {} },
      { sku: "tee-l", priceDkk: 12000, stock: 1, attributes: {} },
    ],
  });

describe("getCatalogFeed — item id is the product's sku when it has one (FEED-SKU)", () => {
  // The PDP's Product JSON-LD says `sku: product.sku || product.id`
  // (tests/unit/pdp-jsonld-sku.test.ts). A feed that said the slug for the same
  // product gave Merchant Center / ACP and the page two identities for one item.
  it("a product with a sku is listed under that sku, the value its page's JSON-LD carries", async () => {
    catalog([product({ sku: "CW-MUG-01" })]);
    const [item] = await getCatalogFeed();
    expect(item.id).toBe("CW-MUG-01");
    expect(item.url).toBe(`https://shop.example/${L}/product/blue-mug`); // the link still uses the slug
  });

  it("an empty-string sku counts as none: the slug, never an empty id (the page's `||` skips it too, to the database id)", async () => {
    catalog([product({ sku: "" })]);
    expect((await getCatalogFeed())[0].id).toBe("blue-mug");
  });

  it("a product with variants is still listed per variant sku; its own sku is not an item", async () => {
    catalog([tee()]);
    expect((await getCatalogFeed()).map((i) => i.id)).toEqual(["tee-s", "tee-l"]);
  });

  it("asks nothing more of the database when no product without variants has a sku", async () => {
    catalog([product(), tee()]);
    await getCatalogFeed();
    expect(mocks.prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.productVariant.findMany).not.toHaveBeenCalled();
  });

  // Product.sku and Product.slug are each unique, but not across each other, and
  // ACP looks a bare item_id up as a slug before it tries a product's own sku.
  it("keeps the slug when the sku is another product's slug — no id is listed twice", async () => {
    catalog([
      product({ slug: "a-cup", sku: "cup" }),
      product({ slug: "cup", sku: null }),
    ]);
    expect((await getCatalogFeed()).map((i) => i.id)).toEqual(["a-cup", "cup"]);
  });

  it("keeps the slug when the sku is a variant's sku — a draft's variant too", async () => {
    catalog([
      tee(),
      product({ slug: "plain-tee", sku: "tee-l" }),
      product({ slug: "draft-tee", status: "draft", variants: [{ sku: "tee-xl", priceDkk: 1, stock: 1, attributes: {} }] }),
      product({ slug: "big-tee", sku: "tee-xl" }),
    ]);
    expect((await getCatalogFeed()).map((i) => i.id)).toEqual(["tee-s", "tee-l", "plain-tee", "big-tee"]);
  });

  it("keeps the slug when the sku is a draft's slug — the draft is not listed, but ACP finds it by slug", async () => {
    catalog([
      product({ slug: "lamp", status: "draft" }),
      product({ slug: "desk-lamp", sku: "lamp" }),
    ]);
    expect((await getCatalogFeed()).map((i) => i.id)).toEqual(["desk-lamp"]);
  });

  // ACP's line-item schema trims an item_id (lib/acp/index.ts), so a sku with
  // whitespace around it would come back as another string — " CW-MUG-01 "
  // reaches the look-up as "CW-MUG-01", which names nothing or another item.
  it("keeps the slug when ACP's input would not hand the sku back unchanged — whitespace around it, or only whitespace", async () => {
    catalog([
      product({ slug: "padded-mug", sku: " CW-MUG-01 " }),
      product({ slug: "tabbed-mug", sku: "CW-MUG-02\t" }),
      product({ slug: "nbsp-mug", sku: "\u00a0CW-MUG-03" }),
      product({ slug: "blank-mug", sku: "   " }),
    ]);
    expect((await getCatalogFeed()).map((i) => i.id)).toEqual([
      "padded-mug",
      "tabbed-mug",
      "nbsp-mug",
      "blank-mug",
    ]);
    // None of those can be an id, so nothing is asked about which ids are taken.
    expect(mocks.prisma.productVariant.findMany).not.toHaveBeenCalled();
  });

  // Google Merchant Center caps an id at 50 characters ("ID [id]" in the
  // product data specification); a Sheets sku can be longer.
  it("keeps the slug when the sku is longer than Google's 50-character id limit", async () => {
    const fifty = "S".repeat(50);
    catalog([
      product({ slug: "fifty-mug", sku: fifty }),
      product({ slug: "long-mug", sku: "L".repeat(51) }),
      // 50 characters, one outside the BMP: 51 UTF-16 units. Counted the
      // strict way, so no id Google could count past 50 is listed.
      product({ slug: "emoji-mug", sku: `${"E".repeat(49)}\u{1F375}` }),
    ]);
    expect((await getCatalogFeed()).map((i) => i.id)).toEqual([fifty, "long-mug", "emoji-mug"]);
  });

  it("a soft-deleted product's slug does not take a sku (ACP never looks there)", async () => {
    catalog([
      product({ slug: "lamp", deletedAt: new Date("2026-01-01") }),
      product({ slug: "desk-lamp", sku: "lamp" }),
    ]);
    expect((await getCatalogFeed()).map((i) => i.id)).toEqual(["lamp"]);
  });

  it("a soft-deleted product's variant sku does not take a sku either (ACP never orders that variant)", async () => {
    catalog([
      product({
        slug: "old-tee",
        deletedAt: new Date("2026-01-01"),
        variants: [{ sku: "CW-OLD-TEE", priceDkk: 1, stock: 1, attributes: {} }],
      }),
      product({ slug: "new-tee", sku: "CW-OLD-TEE" }),
    ]);
    expect((await getCatalogFeed()).map((i) => i.id)).toEqual(["CW-OLD-TEE"]);
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
    expect(s.url).toBe(`https://shop.example/${L}/product/tee`);
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

/**
 * The builder reads whole rows (`include`, no `select`), so a new column reaches
 * it, and only the hand-built item keeps that column out of the two public feeds.
 * Owner decision B92: the stock policy is the engine's own (BOM2-b3), so a feed
 * says in_stock or out_of_stock from `stock` as it did.
 */
describe("getCatalogFeed — a feed item is its allowlist", () => {
  const ITEM_KEYS = [
    "attributes", "availability", "brand", "category", "currency", "description",
    "id", "imageUrl", "priceMinor", "title", "url",
  ];

  it("a product's and a variant's stock policy stay out of the items and out of both feeds", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      product({ slug: "plain", stock: 0, stockPolicy: "LEAK:Product.stockPolicy" }),
      product({
        slug: "tee",
        stockPolicy: "LEAK:Product.stockPolicy",
        variants: [
          { sku: "tee-s", priceDkk: 5000, stock: 0, attributes: { size: "S" }, stockPolicy: "LEAK:ProductVariant.stockPolicy" },
        ],
      }),
    ]);
    const items = await getCatalogFeed();

    expect(items.map((i) => [i.id, i.availability])).toEqual([
      ["plain", "out_of_stock"], // the policy moves nothing: a row without stock is out of stock
      ["tee-s", "out_of_stock"],
    ]);
    for (const item of items) expect(Object.keys(item).sort()).toEqual(ITEM_KEYS);

    const acp = buildAcpFeed(items, {
      name: "Shop",
      url: "https://shop.example",
      storeCountry: "DK",
      targetCountries: ["DK"],
      privacyPolicyUrl: "https://shop.example/privacy",
      tosUrl: "https://shop.example/terms",
    });
    const google = buildGoogleMerchantXml(items, { title: "Shop", link: "https://shop.example", description: "A shop" });
    expect(acp).toContain('"item_id":"tee-s"');
    expect(google).toContain("tee-s");
    for (const body of [JSON.stringify(items), acp, google]) {
      expect(body).not.toMatch(/stockPolicy|LEAK:/);
    }
  });
});
