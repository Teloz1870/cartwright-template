/**
 * The product page's Product JSON-LD carries the merchant's own sku.
 *
 * `Product.sku` is the optional, unique article number an owner sets (or a
 * migration imports from WooCommerce); the database id is an internal
 * identifier nothing outside the shop knows. The page emitted `sku: product.id`
 * for every product, so any sku comparison against a feed, an ERP or the
 * source shop failed on every single product. The route is driven for real
 * here — the fake `prisma.product` resolves the slug, the page builds its
 * JSON-LD through the real `buildProductJsonLd`, and the spy records the
 * emitted object before stopping the render (everything after it is JSX
 * that needs the whole storefront graph, not this fact).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { slug: string; deletedAt: Date | null };
type Where = { slug?: string; deletedAt?: null; categoryId?: string | null; id?: unknown };
type JsonLdObject = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  const rows: Row[] = [];
  const matches = (row: Row, where: Where) => {
    if (where.slug !== undefined && row.slug !== where.slug) return false;
    if ("deletedAt" in where && where.deletedAt === null && row.deletedAt !== null) return false;
    return true;
  };
  const findOne = vi.fn(async ({ where }: { where: Where }) => rows.find((r) => matches(r, where)) ?? null);
  const findMany = vi.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)));
  const emitted: JsonLdObject[] = [];
  return {
    rows,
    emitted,
    prisma: { product: { findUnique: findOne, findFirst: findOne, findMany } },
    getBrand: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: mocks.notFound,
  redirect: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "da",
}));
// The real builder runs; the spy only records what the page emitted and then
// halts the render. A source grep for `product.sku` would not catch a caller
// that reads the right field but hands the builder the wrong one.
vi.mock("@/lib/storefront-jsonld", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storefront-jsonld")>();
  return {
    ...actual,
    buildProductJsonLd: (input: Parameters<typeof actual.buildProductJsonLd>[0]) => {
      mocks.emitted.push(actual.buildProductJsonLd(input));
      throw new Error("STOP_AT_PRODUCT_JSONLD");
    },
  };
});

const page = await import("@/app/[locale]/product/[slug]/page");

const base: Row = {
  id: "p-live",
  slug: "mug",
  sku: null,
  name: "Mug",
  description: "A mug",
  priceDkk: 9900,
  stock: 3,
  images: "[]",
  brand: null,
  categoryId: "c1",
  category: null,
  variants: [],
  translations: null,
  deletedAt: null,
};
const withSku: Row = { ...base, id: "p-sku", slug: "mug-sku", sku: "CW-MUG-01" };
// An importer can write an empty string where the source had no article number.
const emptySku: Row = { ...base, id: "p-empty", slug: "mug-empty", sku: "" };

const params = (slug: string) => Promise.resolve({ slug, locale: "da" });

async function renderJsonLd(slug: string): Promise<JsonLdObject> {
  await expect(page.default({ params: params(slug) })).rejects.toThrow("STOP_AT_PRODUCT_JSONLD");
  expect(mocks.emitted).toHaveLength(1);
  return mocks.emitted[0];
}

describe("PDP Product JSON-LD — sku is the merchant's article number", () => {
  beforeEach(() => {
    mocks.rows.splice(0, mocks.rows.length, base, withSku, emptySku);
    mocks.emitted.splice(0, mocks.emitted.length);
    mocks.notFound.mockClear();
    mocks.getBrand.mockResolvedValue({
      ecommerceEnabled: true,
      url: "https://shop.dk",
      storeName: "Shop",
      locales: ["da"],
      features: {},
      metadata: { description: "Shop description" },
      policies: { currency: "DKK", country: "DK", shippingDefaultDkk: 0, returnDays: 14 },
      uiLabels: { categoryAllProductsBreadcrumb: "All products" },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("a product with a sku emits that sku, never the database id", async () => {
    const jsonLd = await renderJsonLd("mug-sku");
    expect(jsonLd["@type"]).toBe("Product");
    expect(jsonLd.sku).toBe("CW-MUG-01");
    expect(jsonLd.sku).not.toBe("p-sku");
  });

  it("a product without a sku falls back to its id (the shape every caller had)", async () => {
    const jsonLd = await renderJsonLd("mug");
    expect(jsonLd.sku).toBe("p-live");
  });

  it("an empty-string sku falls back to the id — never an empty sku in the JSON-LD", async () => {
    const jsonLd = await renderJsonLd("mug-empty");
    expect(jsonLd.sku).toBe("p-empty");
  });
});
