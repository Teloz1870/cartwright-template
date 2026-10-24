/**
 * WP2-r1′-b — the rest of the catalogue follows the category tree the
 * category page already walks (#648): the catalogue's `?kategori=` filter, the
 * public agent tool `products.search`'s `categorySlug`, and the product counts
 * of `categories.list` and `/admin/kategorier`.
 *
 * Each surface is driven for real against a fake `prisma` that applies a
 * product `where` the way the database would (`category.slug`, `categoryId` as
 * an `in` list, a `category` relation filter, `deletedAt: null`, `status`), so a surface
 * that stopped rolling up would match nothing for a parent — and refuses a
 * query over SQLite's bind ceiling with P2029, as Prisma's libSQL client does
 * (CATEGORY-IN-LIST-BIND-LIMIT).
 *
 * The flat case is the byte-identity guarantee every canary relies on: with no
 * `parentId` anywhere the query and the output are compared against literals
 * written from origin/main's code path, key order included.
 *
 * Locale-free: every page is driven in `brand.defaultLocale`, so this runs on a
 * single-locale scaffold unchanged.
 */
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { brand } from "@/brand.config";
import { AdminTd, AdminTr } from "@/components/admin/ui";

type Cat = { id: string; slug: string; name: string; description: string | null; parentId: string | null };
type Prod = {
  id: string;
  slug: string;
  name: string;
  brand: null;
  description: string;
  priceDkk: number;
  stock: number;
  featured: boolean;
  frameColor: null;
  lensColor: null;
  images: string;
  imageUrl: null;
  permalink: null;
  categoryId: string;
  status: string;
  deletedAt: Date | null;
};
type CategoryFilter = Record<string, unknown>;
type IdMatch = string | { in: string[] };
type ProductWhere = {
  status?: string;
  deletedAt?: null;
  category?: CategoryFilter;
  categoryId?: IdMatch;
  OR?: ProductWhere[];
  extraCategories?: { some: { categoryId?: IdMatch; category?: CategoryFilter } };
};
type Link = { productId: string; categoryId: string };

const mocks = await vi.hoisted(async () => {
  const { fitsPrismaSqlite } = await import("../helpers/prisma-binds");
  const cats: Cat[] = [];
  const products: Prod[] = [];
  const links: Link[] = [];
  const productWheres: unknown[] = [];
  const facetWheres: unknown[] = [];
  const state = { treeFails: false };
  const slugOf = (cats: Cat[], id: string) => cats.find((c) => c.id === id)?.slug;
  /** A Category filter of `slug`/`id`/`parentId`, `parent` and `OR`. */
  const categoryMatches = (c: Cat | undefined, filter: CategoryFilter): boolean =>
    c !== undefined &&
    Object.entries(filter).every(([key, value]) => {
      if (key === "OR") return (value as CategoryFilter[]).some((leg) => categoryMatches(c, leg));
      if (key === "parent") {
        return categoryMatches(cats.find((p) => p.id === c.parentId), value as CategoryFilter);
      }
      return c[key as keyof Cat] === value;
    });
  const idIn = (match: IdMatch, id: string) => (typeof match === "string" ? match === id : match.in.includes(id));
  const inCategory = (filter: { categoryId?: IdMatch; category?: CategoryFilter }, id: string) =>
    (!filter.category || categoryMatches(cats.find((c) => c.id === id), filter.category)) &&
    (filter.categoryId === undefined || idIn(filter.categoryId, id));
  // WP2-r2′: `OR` legs and `extraCategories.some` over the ProductCategory rows.
  const matches = (where: ProductWhere, p: Prod): boolean =>
    (where.deletedAt !== null || p.deletedAt === null) &&
    (where.status === undefined || p.status === where.status) &&
    inCategory(where, p.categoryId) &&
    (!where.OR || where.OR.some((leg) => matches(leg, p))) &&
    (!where.extraCategories ||
      links.some((l) => l.productId === p.id && inCategory(where.extraCategories!.some, l.categoryId)));
  return {
    cats,
    products,
    links,
    productWheres,
    facetWheres,
    state,
    prisma: {
      category: {
        findMany: vi.fn(async (args: { select?: Record<string, boolean>; include?: unknown }) => {
          if (state.treeFails) throw new Error("no such column: Category.parentId");
          if (args.select) {
            const select = args.select;
            return cats.map((c) =>
              Object.fromEntries(Object.keys(select).map((k) => [k, c[k as keyof Cat]])),
            );
          }
          if (args.include) {
            // `_count.products` as categories.list (its caller's product
            // filter) and the admin page (all rows) ask for it.
            const where = (args.include as { _count?: { select?: { products?: { where?: ProductWhere } } } })
              ._count?.select?.products?.where;
            return cats.map((c) => ({
              ...c,
              _count: {
                products: products.filter((p) => p.categoryId === c.id && (!where || matches(where, p))).length,
              },
            }));
          }
          return [...cats];
        }),
      },
      productCategory: {
        groupBy: vi.fn(async () => [...new Set(links.map((l) => l.categoryId))].map((categoryId) => ({ categoryId }))),
        // Like the database: `where.product` is the linked product's filter.
        findMany: vi.fn(async (args: { where?: { product: ProductWhere } }) =>
          links
            .map((l) => ({ ...l, product: products.find((p) => p.id === l.productId)! }))
            .filter((l) => !args.where || matches(args.where.product, l.product))
            .map((l) => ({ productId: l.productId, categoryId: l.categoryId, product: { categoryId: l.product.categoryId } })),
        ),
      },
      product: {
        findMany: vi.fn(async (args: { where?: ProductWhere; select?: unknown; include?: unknown }) => {
          if (args.select) {
            facetWheres.push(args.where); // the PLP's distinct brand/colour reads
            return [];
          }
          const where = args.where ?? {};
          productWheres.push(where);
          if (!fitsPrismaSqlite(where)) {
            throw Object.assign(new Error("The query parameter limit supported by your database is exceeded."), {
              code: "P2029",
            });
          }
          return products
            .filter((p) => matches(where, p))
            .map((p) => ({ ...p, category: { slug: slugOf(cats, p.categoryId)!, name: p.categoryId } }));
        }),
      },
    },
    getBrand: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/audit", () => ({ withAudit: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/theme", () => ({ getActiveDesign: async () => null }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => brand.defaultLocale,
}));

// Imported once, up front: the page modules are heavy, and paying for them
// inside a test's timeout made the first case of a describe flaky under load.
const plpPage = await import("@/app/[locale]/produkter/page");
const adminPage = await import("@/app/admin/kategorier/page");
const { ProductGrid } = await import("@/components/ProductGrid");
const { searchProducts } = await import("@/lib/tools/products");
const { listCategories } = await import("@/lib/tools/categories");

const ctx = { actor: "system:public-agent", ip: "10.0.0.9", userAgent: "agent/1.0" } as never;

const cat = (id: string, parentId: string | null): Cat => ({
  id: `id-${id}`,
  slug: id,
  name: id.toUpperCase(),
  description: null,
  parentId: parentId === null ? null : `id-${parentId}`,
});
const prod = (id: string, category: string, deletedAt: Date | null = null, status = "active"): Prod => ({
  id,
  slug: id,
  name: id.toUpperCase(),
  brand: null,
  description: "",
  priceDkk: 1000,
  stock: 2,
  featured: false,
  frameColor: null,
  lensColor: null,
  images: "[]",
  imageUrl: null,
  permalink: null,
  categoryId: `id-${category}`,
  status,
  deletedAt,
});

function flatShop() {
  mocks.cats.push(cat("tea", null), cat("coffee", null));
  mocks.products.push(prod("sencha", "tea"), prod("espresso", "coffee"));
}

/** Products only in the leaves, as a WooCommerce import places them. */
function nestedShop() {
  mocks.cats.push(
    cat("hegn", null),
    cat("komposithegn", "hegn"),
    cat("type-1", "komposithegn"),
    cat("type-2", "komposithegn"),
    cat("laager", null),
  );
  mocks.products.push(
    prod("t1-a", "type-1"),
    prod("t1-b", "type-1"),
    prod("t2-a", "type-2"),
    prod("t2-gone", "type-2", new Date("2026-10-01")),
    prod("laage-a", "laager"),
  );
}

/** A parent with 1,200 subcategories, one product in each — and one deleted. */
function wideShop() {
  mocks.cats.push(cat("hegn", null));
  for (let i = 0; i < 1200; i++) {
    mocks.cats.push(cat(`model-${i}`, "hegn"));
    mocks.products.push(prod(`p-${i}`, `model-${i}`));
  }
  mocks.products.push(prod("p-gone", "model-7", new Date("2026-10-01")));
}

const treeReads = () => mocks.prisma.category.findMany.mock.calls.filter(([args]) => args.select);

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  mocks.cats.splice(0);
  mocks.products.splice(0);
  mocks.links.splice(0);
  mocks.prisma.productCategory.groupBy.mockClear();
  mocks.productWheres.splice(0);
  mocks.facetWheres.splice(0);
  mocks.state.treeFails = false;
  mocks.prisma.category.findMany.mockClear();
  mocks.prisma.product.findMany.mockClear();
  consoleError?.mockRestore();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getBrand.mockResolvedValue({
    ecommerceEnabled: true,
    defaultLocale: brand.defaultLocale,
    url: "https://shop.dk",
    storeName: "Shop",
    features: { breadcrumbs: false, designSurfaces: false },
  });
});

// ── /produkter?kategori= ─────────────────────────────────────────────────────

type El = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) for (const child of node) elements(child, out);
  else if (node && typeof node === "object" && "props" in node) {
    const el = node as El;
    out.push(el);
    elements(el.props.children, out);
  }
  return out;
}

async function plp(searchParams: Record<string, string>) {
  const tree = elements(
    await plpPage.default({
      searchParams: Promise.resolve(searchParams),
      params: Promise.resolve({ locale: brand.defaultLocale }),
    }),
  );
  const grid = tree.find((el) => el.type === ProductGrid);
  return {
    where: mocks.productWheres[0],
    products: ((grid?.props.products ?? []) as Prod[]).map((p) => p.id).sort(),
  };
}

describe("/produkter?kategori= follows the tree", () => {
  it("a flat shop's filter is the where origin/main sent plus the live-product filter, from one category read", async () => {
    flatShop();
    const { where, products } = await plp({ kategori: "tea" });
    // origin/main: lib/catalog.ts `where.category = { slug: params.kategori }`;
    // PLP-DELETED-FILTER + STOREFRONT-DRAFT-FILTER add the clauses every
    // storefront product reader carries.
    expect(JSON.stringify(where)).toBe(
      JSON.stringify({ category: { slug: "tea" }, status: "active", deletedAt: null }),
    );
    expect(products).toEqual(["sencha"]);
    // The tree IS the filter sidebar's category list — no second query.
    expect(mocks.prisma.category.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.category.findMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
  });

  it("a parent lists every product below it", async () => {
    nestedShop();
    const { where, products } = await plp({ kategori: "hegn" });
    expect(where).toStrictEqual({
      categoryId: { in: ["id-hegn", "id-komposithegn", "id-type-1", "id-type-2"] },
      status: "active",
      deletedAt: null,
    });
    // Every live leaf product, and nothing from beside the subtree.
    expect(products).toEqual(["t1-a", "t1-b", "t2-a"]);
  });

  it("without a filter the tree changes nothing", async () => {
    nestedShop();
    const { where } = await plp({});
    expect(where).toStrictEqual({ status: "active", deletedAt: null });
  });

  it("a failed category read degrades to the direct-only filter", async () => {
    nestedShop();
    mocks.state.treeFails = true;
    const { where } = await plp({ kategori: "komposithegn" });
    expect(where).toStrictEqual({ category: { slug: "komposithegn" }, status: "active", deletedAt: null });
  });

  it("a parent with 1,200 subcategories lists them all instead of an empty grid", async () => {
    wideShop();
    const { products } = await plp({ kategori: "hegn" });
    expect(products).toHaveLength(1200);
    expect(products).not.toContain("p-gone");
    expect(consoleError).not.toHaveBeenCalled();
  });
});

// PLP-DELETED-FILTER: products.delete only sets deletedAt; the product page
// answers 404 and the category page leaves it out, so the catalogue must too.
describe("/produkter leaves deleted products out", () => {
  it("with and without a filter", async () => {
    nestedShop();
    expect((await plp({})).products).toEqual(["laage-a", "t1-a", "t1-b", "t2-a"]);
    mocks.productWheres.splice(0);
    expect((await plp({ kategori: "type-2" })).products).toEqual(["t2-a"]);
  });

  it("and offers no brand or colour that only a deleted product has", async () => {
    flatShop();
    await plp({});
    const live = { status: "active", deletedAt: null };
    expect(mocks.facetWheres).toStrictEqual([live, live, live]);
  });
});

// STOREFRONT-DRAFT-FILTER: a draft product has no page (the PDP answers 404),
// so the catalogue and the public search tool leave it out as they do a
// deleted one.
describe("/produkter and products.search leave a draft product out", () => {
  it("/produkter, with and without a filter", async () => {
    flatShop();
    mocks.products.push(prod("draft-tea", "tea", null, "draft"));
    expect((await plp({})).products).toEqual(["espresso", "sencha"]);
    mocks.productWheres.splice(0);
    expect((await plp({ kategori: "tea" })).products).toEqual(["sencha"]);
  });

  it("products.search for an anonymous agent, with and without a category", async () => {
    flatShop();
    mocks.products.push(prod("draft-tea", "tea", null, "draft"));
    expect((await search({})).rows.map((r) => r.id).sort()).toEqual(["espresso", "sencha"]);
    mocks.productWheres.splice(0);
    expect((await search({ categorySlug: "tea" })).rows.map((r) => r.id)).toEqual(["sencha"]);
  });
});

// ── products.search categorySlug ─────────────────────────────────────────────

async function search(args: Record<string, unknown>) {
  const rows = await searchProducts.handler({ limit: 20, offset: 0, ...args } as never, ctx);
  return { rows: rows as Array<Record<string, unknown>>, where: mocks.productWheres[0] };
}

describe("products.search's categorySlug follows the tree", () => {
  it("a flat shop sends origin/main's where and gets origin/main's output", async () => {
    flatShop();
    const { rows, where } = await search({ categorySlug: "tea" });
    // origin/main: `{ deletedAt: null }`, then `where.category = { slug }`;
    // STOREFRONT-DRAFT-FILTER puts `status: "active"` in front for a public caller.
    expect(JSON.stringify(where)).toBe(
      JSON.stringify({ status: "active", deletedAt: null, category: { slug: "tea" } }),
    );
    // The output projection is the public contract: exactly these keys.
    expect(rows).toStrictEqual([
      {
        id: "sencha",
        slug: "sencha",
        name: "SENCHA",
        brand: null,
        priceDkk: 1000,
        stock: 2,
        featured: false,
        frameColor: null,
        lensColor: null,
        categorySlug: "tea",
        categoryName: "id-tea",
        firstImage: null,
      },
    ]);
  });

  it("a parent matches its subcategories' live products, each keeping its own category", async () => {
    nestedShop();
    const { rows, where } = await search({ categorySlug: "komposithegn" });
    expect(where).toStrictEqual({
      status: "active",
      deletedAt: null,
      categoryId: { in: ["id-komposithegn", "id-type-1", "id-type-2"] },
    });
    expect(rows.map((r) => [r.id, r.categorySlug])).toEqual([
      ["t1-a", "type-1"],
      ["t1-b", "type-1"],
      ["t2-a", "type-2"],
    ]);
  });

  it("reads only the columns the subtree needs, and only when a category is asked for", async () => {
    nestedShop();
    await search({});
    expect(treeReads()).toHaveLength(0);
    await search({ categorySlug: "hegn" });
    expect(treeReads()).toHaveLength(1);
    expect(treeReads()[0][0].select).toStrictEqual({ id: true, parentId: true, slug: true });
  });

  it("a parent with 1,200 subcategories answers instead of throwing P2029, in the same shape", async () => {
    wideShop();
    const { rows } = await search({ categorySlug: "hegn", limit: 100 });
    expect(rows).toHaveLength(100);
    expect(rows.every((r) => String(r.categorySlug).startsWith("model-"))).toBe(true);
    expect(rows.map((r) => r.id)).not.toContain("p-gone");
    expect(searchProducts.output.safeParse(rows).success).toBe(true);
  });

  it("a failed tree read degrades to the direct-only filter", async () => {
    nestedShop();
    mocks.state.treeFails = true;
    const { rows, where } = await search({ categorySlug: "komposithegn" });
    expect(where).toStrictEqual({ status: "active", deletedAt: null, category: { slug: "komposithegn" } });
    expect(rows).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "[products.search] category tree failed, falling back to []:",
      expect.any(Error),
    );
  });
});

// ── categories.list ──────────────────────────────────────────────────────────

async function list(args: Record<string, unknown> = {}) {
  return (await listCategories.handler(args as never, ctx)) as Array<Record<string, unknown>>;
}

describe("categories.list reports the rolled-up count without changing productCount", () => {
  it("a flat shop's output is origin/main's, with no new field", async () => {
    flatShop();
    const rows = await list();
    expect(JSON.stringify(rows)).toBe(
      JSON.stringify([
        { id: "id-tea", slug: "tea", name: "TEA", description: null, productCount: 1 },
        { id: "id-coffee", slug: "coffee", name: "COFFEE", description: null, productCount: 1 },
      ]),
    );
  });

  it("a parent carries productCountWithDescendants (live products only); a leaf does not", async () => {
    nestedShop();
    const bySlug = new Map((await list()).map((r) => [r.slug, r]));
    expect(bySlug.get("hegn")).toStrictEqual({
      id: "id-hegn",
      slug: "hegn",
      name: "HEGN",
      description: null,
      productCount: 0,
      productCountWithDescendants: 3,
    });
    expect(bySlug.get("komposithegn")?.productCountWithDescendants).toBe(3);
    expect(bySlug.get("type-2")).toStrictEqual({
      id: "id-type-2",
      slug: "type-2",
      name: "TYPE-2",
      description: null,
      productCount: 1,
    });
  });

  it("the output still parses against the tool's strict schema", async () => {
    nestedShop();
    expect(listCategories.output.safeParse(await list()).success).toBe(true);
  });

  it("includeEmpty: false keeps a parent whose products sit in its subcategories", async () => {
    nestedShop();
    mocks.cats.push(cat("empty", null));
    const slugs = (await list({ includeEmpty: false })).map((r) => r.slug);
    expect(slugs).toEqual(["hegn", "komposithegn", "type-1", "type-2", "laager"]);
  });
});

// ── /admin/kategorier ────────────────────────────────────────────────────────

async function adminCounts() {
  const rows = elements(await adminPage.default()).filter((el) => el.type === AdminTr);
  return rows.map((row) => {
    const cells = (row.props.children as El[]).filter((el) => el.type === AdminTd);
    const products = cells[2].props.children as unknown;
    return [
      cells[1].props.children,
      typeof products === "object" && products !== null ? (products as El).props.children : products,
    ];
  });
}

describe("/admin/kategorier shows 'direct (total)' on a parent", () => {
  it("a flat shop's cell is the bare count origin/main rendered", async () => {
    flatShop();
    expect(await adminCounts()).toStrictEqual([
      ["tea", 1],
      ["coffee", 1],
    ]);
  });

  it("a parent reads 'direct (total)', a leaf its own count", async () => {
    nestedShop();
    // The admin count has always included soft-deleted rows; the total sums
    // the same counts.
    expect(await adminCounts()).toStrictEqual([
      ["hegn", "0 (4)"],
      ["komposithegn", "0 (4)"],
      ["type-1", 2],
      ["type-2", 2],
      ["laager", 1],
    ]);
  });
});

// ── WP2-r2′: extra categories (ProductCategory) ──────────────────────────────

/** `nestedShop()` plus extra categories, as a WooCommerce import files them. */
function linkedShop() {
  nestedShop();
  const link = (productId: string, category: string) => mocks.links.push({ productId, categoryId: `id-${category}` });
  link("laage-a", "type-2"); // a gate also shown among the type-2 fences
  link("t1-a", "type-2"); // already under komposithegn through its primary
  link("t2-gone", "laager"); // soft-deleted: never listed, never counted live
}

describe("WP2-r2′ — a product filed under an extra category is listed there like a primary member", () => {
  it("a flat shop without links reads them once per filtered view, and sends the query it sent", async () => {
    flatShop();
    await plp({});
    expect(mocks.prisma.productCategory.groupBy).not.toHaveBeenCalled();
    mocks.productWheres.splice(0);
    const { where } = await plp({ kategori: "tea" });
    expect(mocks.prisma.productCategory.groupBy).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.productCategory.groupBy).toHaveBeenCalledWith({ by: ["categoryId"] });
    expect(JSON.stringify(where)).toBe(
      JSON.stringify({ category: { slug: "tea" }, status: "active", deletedAt: null }),
    );
  });

  it("/produkter?kategori= lists it in the extra category and each of its parents, once", async () => {
    linkedShop();
    const leaf = await plp({ kategori: "type-2" });
    expect(leaf.where).toStrictEqual({
      OR: [{ categoryId: "id-type-2" }, { extraCategories: { some: { categoryId: "id-type-2" } } }],
      status: "active",
      deletedAt: null,
    });
    expect(leaf.products).toEqual(["laage-a", "t1-a", "t2-a"]);
    mocks.productWheres.splice(0);
    expect((await plp({ kategori: "hegn" })).products).toEqual(["laage-a", "t1-a", "t1-b", "t2-a"]);
    mocks.productWheres.splice(0);
    // Its primary category still lists it; a deleted product's link lists nothing.
    expect((await plp({ kategori: "laager" })).products).toEqual(["laage-a"]);
  });

  it("products.search's categorySlug finds it, reporting its PRIMARY category in the same shape", async () => {
    linkedShop();
    const { rows } = await search({ categorySlug: "type-2" });
    // The fake keeps insertion order (the tool's orderBy is the database's job).
    expect(rows.map((r) => [r.id, r.categorySlug])).toEqual([
      ["t1-a", "type-1"],
      ["t2-a", "type-2"],
      ["laage-a", "laager"],
    ]);
    expect(searchProducts.output.safeParse(rows).success).toBe(true);
  });

  it("categories.list counts it in the extra category and once per parent, live products only", async () => {
    linkedShop();
    const rows = await list();
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    expect(bySlug.get("type-2")).toStrictEqual({
      id: "id-type-2",
      slug: "type-2",
      name: "TYPE-2",
      description: null,
      productCount: 3,
    });
    expect(bySlug.get("komposithegn")?.productCountWithDescendants).toBe(4);
    expect(bySlug.get("hegn")?.productCountWithDescendants).toBe(4);
    expect(bySlug.get("laager")?.productCount).toBe(1);
    expect(listCategories.output.safeParse(rows).success).toBe(true);
  });

  it("/admin/kategorier counts it the same way, over every row as it always has", async () => {
    linkedShop();
    expect(await adminCounts()).toStrictEqual([
      ["hegn", "0 (5)"],
      ["komposithegn", "0 (5)"],
      ["type-1", 2],
      ["type-2", 4],
      ["laager", 2],
    ]);
  });
});

// STOREFRONT-DRAFT-FILTER × WP2-r2′: the extra-category leg sits beside the
// live-product filter, so a draft filed under a category as an extra one is
// left out of every public list and count, as a draft in its primary one is.
describe("a draft filed under an extra category stays out for public callers", () => {
  function draftLinkedShop() {
    linkedShop();
    mocks.products.push(prod("t1-draft", "type-1", null, "draft"));
    mocks.links.push({ productId: "t1-draft", categoryId: "id-laager" });
  }

  it("/produkter?kategori= lists neither its extra nor its primary category with it", async () => {
    draftLinkedShop();
    expect((await plp({ kategori: "laager" })).products).toEqual(["laage-a"]);
    mocks.productWheres.splice(0);
    expect((await plp({ kategori: "type-1" })).products).toEqual(["t1-a", "t1-b"]);
  });

  it("products.search's categorySlug does not find it for an anonymous agent", async () => {
    draftLinkedShop();
    expect((await search({ categorySlug: "laager" })).rows.map((r) => r.id)).toEqual(["laage-a"]);
  });

  it("categories.list leaves it out of a public count, link included; an owner's count keeps it", async () => {
    draftLinkedShop();
    const publicCounts = new Map((await list()).map((r) => [r.slug, r.productCount]));
    expect(publicCounts.get("laager")).toBe(1);
    expect(publicCounts.get("type-1")).toBe(2);
    const owner = { actor: "operator-chat:u1", ip: null, userAgent: null } as never;
    const ownerRows = (await listCategories.handler({} as never, owner)) as Array<Record<string, unknown>>;
    const ownerCounts = new Map(ownerRows.map((r) => [r.slug, r.productCount]));
    expect(ownerCounts.get("laager")).toBe(2);
    expect(ownerCounts.get("type-1")).toBe(3);
  });
});
