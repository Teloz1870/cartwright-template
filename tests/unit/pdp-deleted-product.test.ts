/**
 * A soft-deleted product's page answers 404 — the storefront fact the
 * IndexNow story ("a delete pings the URL so engines drop it") rests on.
 *
 * prisma/schema.prisma says every product reader filters `deletedAt: null`;
 * the PDP (page body, `generateMetadata`, the related-products strip) did
 * not, so `products.delete` left the page rendering with a 200. The fake
 * `prisma.product` here applies the `slug` / `deletedAt` parts of a `where`
 * the way the database would, so dropping the filter in the route makes
 * these tests go red — no source-grepping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { slug: string; deletedAt: Date | null };
type Where = { slug?: string; deletedAt?: null; categoryId?: string | null; id?: unknown };

const mocks = vi.hoisted(() => {
  const rows: Row[] = [];
  const matches = (row: Row, where: Where) => {
    if (where.slug !== undefined && row.slug !== where.slug) return false;
    if ("deletedAt" in where && where.deletedAt === null && row.deletedAt !== null) return false;
    return true;
  };
  const findOne = vi.fn(async ({ where }: { where: Where }) => rows.find((r) => matches(r, where)) ?? null);
  const findMany = vi.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)));
  return {
    rows,
    findOne,
    findMany,
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

const page = await import("@/app/[locale]/product/[slug]/page");

const live: Row = {
  id: "p-live",
  slug: "mug",
  name: "Mug",
  description: "A mug",
  priceDkk: 9900,
  stock: 3,
  images: "[]",
  categoryId: "c1",
  category: null,
  variants: [],
  translations: null,
  deletedAt: null,
};
const deleted: Row = { ...live, id: "p-gone", slug: "gone", name: "Gone", deletedAt: new Date("2026-10-01") };

const params = (slug: string) => Promise.resolve({ slug, locale: "da" });

describe("PDP — a soft-deleted product is not a page", () => {
  beforeEach(() => {
    mocks.rows.splice(0, mocks.rows.length, live, deleted);
    mocks.findOne.mockClear();
    mocks.findMany.mockClear();
    mocks.notFound.mockClear();
    mocks.getBrand.mockResolvedValue({
      ecommerceEnabled: true,
      url: "https://shop.dk",
      storeName: "Shop",
      locales: ["da"],
      features: {},
      metadata: { description: "Shop description" },
      policies: { currency: "DKK", country: "DK", shippingDefaultDkk: 0, returnDays: 14 },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("the page body answers notFound for a product with deletedAt set", async () => {
    await expect(page.default({ params: params("gone") })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("generateMetadata gives the not-found title, never the deleted product's name", async () => {
    const meta = await page.generateMetadata({ params: params("gone") });
    expect(meta.title).toBe("notFound");
  });

  it("a live product still resolves (the filter does not over-reach)", async () => {
    const meta = await page.generateMetadata({ params: params("mug") });
    expect(meta.title).toBe("Mug");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("the related-products strip reads with deletedAt: null too", async () => {
    // Stop the render right after the related read: everything past it is
    // JSON-LD + JSX that needs the whole storefront graph, not this fact.
    mocks.findMany.mockImplementationOnce(async () => {
      throw new Error("STOP_AT_RELATED");
    });
    await expect(page.default({ params: params("mug") })).rejects.toThrow("STOP_AT_RELATED");
    const where = (mocks.findMany.mock.calls[0]?.[0] as { where: Where }).where;
    expect(where).toMatchObject({ categoryId: "c1", deletedAt: null });
  });
});
