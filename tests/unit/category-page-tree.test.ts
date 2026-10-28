/**
 * WP2-r1′ on the category route itself: a parent category page lists the
 * products of every category below it, and its breadcrumb — visible trail and
 * BreadcrumbList JSON-LD — walks the parent chain.
 *
 * The route is driven for real. The fake `prisma` applies a product `where`
 * the way the database would (`categoryId` as a value or an `in` list), so a
 * page that stopped rolling up would list nothing for a parent, and the
 * returned element tree is read for what the page hands `<Breadcrumbs>`,
 * `<JsonLd>` and `<ProductGrid>` — no source grepping.
 *
 * The flat case is the byte-identity guarantee: with no `parentId` anywhere
 * (every shop before WP2) the query, the trail and the JSON-LD are compared
 * against literals written from origin/main's code path, key order included.
 * The deliberate differences in the query are CAT-DELETED-FILTER's
 * `deletedAt: null` (a soft-deleted product is no longer listed) and
 * STOREFRONT-DRAFT-FILTER's `status: "active"` (nor is a draft).
 *
 * Locales come from the shop's own `brand.config.ts` (tests/unit ships in
 * scaffolds, which are single-locale `["en"]`): the page is driven in the
 * default locale, and the translated-ancestor cases skip when there is no
 * second one.
 */
import Link from "next/link";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { renderPageBody } from "../helpers/page-body";

import { brand } from "@/brand.config";
import Breadcrumbs from "@/components/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import { ProductGrid } from "@/components/ProductGrid";
import { homeBreadcrumbLabel } from "@/lib/breadcrumbs";

type Cat = {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  permalink: string | null;
  translations: Record<string, { name: string }> | null;
  description: null;
  descriptionLong: null;
  heroImage: string | null;
  heroVideo: null;
  faq: null;
};
type Prod = {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  permalink: null;
  description: string;
  status: string;
  deletedAt: Date | null;
};
type CategoryIdWhere = string | { in: string[] };
type ProductWhere = {
  categoryId?: CategoryIdWhere;
  status?: string;
  deletedAt?: null;
  OR?: ProductWhere[];
  extraCategories?: { some: { categoryId: CategoryIdWhere } };
};

const mocks = vi.hoisted(() => {
  const cats: Cat[] = [];
  const products: Prod[] = [];
  const links: { productId: string; categoryId: string }[] = [];
  const productWheres: unknown[] = [];
  const state = { locale: "", treeFails: false };
  const inScope = (where: CategoryIdWhere, id: string) =>
    typeof where === "string" ? where === id : where.in.includes(id);
  // WP2-r2′: `OR` legs, and `extraCategories.some` over the ProductCategory rows.
  const inCategories = (where: ProductWhere, p: Prod): boolean =>
    (where.categoryId === undefined || inScope(where.categoryId, p.categoryId)) &&
    (!where.OR || where.OR.some((leg) => inCategories(leg, p))) &&
    (!where.extraCategories ||
      links.some((l) => l.productId === p.id && inScope(where.extraCategories!.some.categoryId, l.categoryId)));
  // Like the database: a `select` returns only the columns it names, so a
  // column dropped from the tree select is missing from the rows, not ignored.
  const pick = (row: Cat, select: Record<string, boolean>) =>
    Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k as keyof Cat]]));
  return {
    cats,
    products,
    links,
    productWheres,
    state,
    prisma: {
      productCategory: {
        groupBy: vi.fn(async () => [...new Set(links.map((l) => l.categoryId))].map((categoryId) => ({ categoryId }))),
      },
      category: {
        // Like the database: `_count.children` is counted from the rows, and
        // only when the lookup asks for it.
        findUnique: vi.fn(
          async ({ where, include }: { where: { slug: string }; include?: { _count?: unknown } }) => {
            const found = cats.find((c) => c.slug === where.slug);
            if (!found || !include?._count) return found ?? null;
            return { ...found, _count: { children: cats.filter((c) => c.parentId === found.id).length } };
          },
        ),
        findMany: vi.fn(
          async (args: { select?: Record<string, boolean>; where?: { slug: { not: string } }; take?: number }) => {
            if (!args.select) return cats.filter((c) => c.slug !== args.where?.slug.not).slice(0, args.take);
            if (state.treeFails) throw new Error("no such column: Category.parentId");
            const select = args.select;
            return cats.map((c) => pick(c, select));
          },
        ),
      },
      product: {
        // Like the database: `deletedAt: null` keeps only live rows and
        // `status` only rows in that status; a where without them returns
        // soft-deleted and draft rows too.
        findMany: vi.fn(async ({ where }: { where: ProductWhere }) => {
          productWheres.push(where);
          return products.filter(
            (p) =>
              inCategories(where, p) &&
              (where.deletedAt !== null || p.deletedAt === null) &&
              (where.status === undefined || p.status === where.status),
          );
        }),
      },
    },
    getBrand: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/lib/annotate/server", () => ({ isAnnotateEditEnabled: async () => false }));
vi.mock("@/lib/theme", () => ({ getActiveDesign: async () => null }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: mocks.notFound,
  redirect: vi.fn(),
}));
// The page's own copy goes through the real translator over messages/<locale>.json,
// so a string put back into the JSX, or a key missing from one file, is the wrong
// text below. A call without a locale (none in this route today) echoes the key.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { readFileSync } = await import("node:fs");
  return {
    getTranslations: async (arg?: string | { locale: string; namespace: string }) =>
      typeof arg === "object"
        ? createTranslator({
            locale: arg.locale,
            messages: JSON.parse(readFileSync(`messages/${arg.locale}.json`, "utf8")),
            namespace: arg.namespace,
          })
        : (key: string) => key,
    getLocale: async () => mocks.state.locale,
  };
});

const page = await import("@/app/[locale]/category/[slug]/page");

/** The shop's source language — what every page below renders in unless told otherwise. */
const LOCALE = brand.defaultLocale;
/** A locale this shop publishes that is NOT its source language, or undefined
 *  (a single-locale scaffold). `OTHER!` only inside `whenMultiLocale`. */
const OTHER = brand.locales.find((l) => l !== brand.defaultLocale);
/** Skip, loudly: with one locale there is no translation branch to exercise. */
const whenMultiLocale = OTHER ? it : it.skip;
/** The literal-copy cases run only where the shop publishes that language. */
const whenLocale = (l: string) => ((brand.locales as readonly string[]).includes(l) ? it : it.skip);
const HOME = homeBreadcrumbLabel(LOCALE);

const cat = (id: string, name: string, parentId: string | null): Cat => ({
  id,
  slug: id,
  name,
  parentId,
  permalink: null,
  translations: null,
  description: null,
  descriptionLong: null,
  heroImage: "https://img.example/x.jpg",
  heroVideo: null,
  faq: null,
});
const prod = (id: string, categoryId: string, deletedAt: Date | null = null, status = "active"): Prod => ({
  id,
  slug: id,
  name: id.toUpperCase(),
  categoryId,
  permalink: null,
  description: "",
  status,
  deletedAt,
});

type El = { type: unknown; props: Record<string, unknown> };

function elements(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, out);
  } else if (node && typeof node === "object" && "props" in node) {
    const el = node as El;
    out.push(el);
    elements(el.props.children, out);
  }
  return out;
}

async function render(slug: string, locale: string = LOCALE) {
  mocks.productWheres.splice(0);
  mocks.state.locale = locale;
  const tree = elements(await renderPageBody(page.default({ params: Promise.resolve({ slug, locale }) })));
  const jsonLd = tree.filter((el) => el.type === JsonLd).map((el) => el.props.data as Record<string, unknown>);
  const grid = tree.find((el) => el.type === ProductGrid);
  return {
    crumbs: tree.find((el) => el.type === Breadcrumbs)?.props.items,
    breadcrumbList: jsonLd.find((d) => d["@type"] === "BreadcrumbList"),
    itemList: jsonLd.find((d) => d["@type"] === "ItemList"),
    products: ((grid?.props.products ?? []) as Prod[]).map((p) => p.id).sort(),
    where: mocks.productWheres[0],
    /** Every category the page links with a `<Link>` — today only "Explore more". */
    categoryLinks: tree
      .filter((el) => el.type === Link)
      .map((el) => el.props.href)
      .filter((href): href is string => typeof href === "string" && href.includes("/category/")),
    /** The text of every `<h2>` the page renders itself. */
    headings: tree.filter((el) => el.type === "h2").map((el) => el.props.children),
  };
}

beforeEach(() => {
  mocks.cats.splice(0);
  mocks.products.splice(0);
  mocks.links.splice(0);
  mocks.prisma.productCategory.groupBy.mockClear();
  mocks.state.treeFails = false;
  mocks.prisma.category.findMany.mockClear();
  mocks.prisma.category.findUnique.mockClear();
  mocks.prisma.product.findMany.mockClear();
  mocks.getBrand.mockResolvedValue({
    ecommerceEnabled: true,
    defaultLocale: brand.defaultLocale,
    url: "https://shop.dk",
    storeName: "Shop",
    features: { breadcrumbs: true },
    uiLabels: { categoryAllProductsBreadcrumb: "All products" },
    ai: { assistantLabel: "Assistant" },
  });
});

describe("a flat shop — the category page is byte-identical to origin/main", () => {
  beforeEach(() => {
    mocks.cats.push(cat("tea", "Tea", null), cat("coffee", "Coffee", null));
    mocks.products.push(prod("sencha", "tea"), prod("espresso", "coffee"));
  });

  it("queries its products with the clause it used before the tree, plus the live-product filter", async () => {
    const { where, products } = await render("tea");
    expect(where).toStrictEqual({ categoryId: "tea", status: "active", deletedAt: null });
    expect(products).toEqual(["sencha"]);
  });

  it("emits the same BreadcrumbList, key order included", async () => {
    const { breadcrumbList } = await render("tea");
    // origin/main: app/[locale]/category/[slug]/page.tsx, the three literal steps.
    const main = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: HOME, item: "https://shop.dk" },
        { "@type": "ListItem", position: 2, name: "All products", item: `https://shop.dk/${LOCALE}/produkter` },
        { "@type": "ListItem", position: 3, name: "Tea", item: `https://shop.dk/${LOCALE}/category/tea` },
      ],
    };
    expect(JSON.stringify(breadcrumbList)).toBe(JSON.stringify(main));
  });

  it("hands <Breadcrumbs> the same three steps", async () => {
    const { crumbs } = await render("tea");
    expect(crumbs).toStrictEqual([
      { label: HOME, href: `/${LOCALE}` },
      { label: "All products", href: `/${LOCALE}/produkter` },
      { label: "Tea" },
    ]);
  });
});

describe("\"Explore more\" links each related category in the page's locale (CAT-RELATED-LOCALE)", () => {
  beforeEach(() => {
    mocks.cats.push(cat("tea", "Tea", null), cat("coffee", "Coffee", null), cat("cocoa", "Cocoa", null));
  });

  // It linked `/category/<slug>` with no locale, so the proxy 307'd a reader
  // of `/en/category/tea` onto the shop's DEFAULT-locale page for coffee.
  it("in the shop's default locale", async () => {
    const { categoryLinks } = await render("tea");
    expect(categoryLinks).toEqual([`/${LOCALE}/category/coffee`, `/${LOCALE}/category/cocoa`]);
  });

  whenMultiLocale("in another of its locales, not the default one", async () => {
    const { categoryLinks } = await render("tea", OTHER!);
    expect(categoryLinks).toEqual([`/${OTHER}/category/coffee`, `/${OTHER}/category/cocoa`]);
  });

  // The heading above the tiles was hard-coded English on every page.
  whenLocale("en")("its heading reads exactly as before on an English page", async () => {
    const { headings } = await render("tea", "en");
    expect(headings).toContain("Explore more");
  });

  whenLocale("da")("its heading is Danish on a Danish page", async () => {
    const { headings } = await render("tea", "da");
    expect(headings).toContain("Udforsk mere");
    expect(headings).not.toContain("Explore more");
  });
});

describe("a 3-level tree with products only in the leaves", () => {
  beforeEach(() => {
    mocks.cats.push(
      cat("hegn", "Hegn", null),
      cat("komposithegn", "Komposithegn", "hegn"),
      cat("type-1", "Type 1", "komposithegn"),
      cat("type-2", "Type 2", "komposithegn"),
      cat("traehegn", "Træhegn", "hegn"),
      cat("laager", "Låger", null),
    );
    mocks.products.push(
      prod("t1-a", "type-1"),
      prod("t1-b", "type-1"),
      prod("t2-a", "type-2"),
      prod("trae-a", "traehegn"),
      prod("laage-a", "laager"),
    );
  });

  it("the grandparent lists every product below it, and nothing beside it", async () => {
    const { products, itemList } = await render("hegn");
    expect(products).toEqual(["t1-a", "t1-b", "t2-a", "trae-a"]);
    // The count the page prints and the ItemList come from the same list.
    expect(itemList?.numberOfItems).toBe(4);
  });

  it("the parent lists its leaves' products", async () => {
    const { products, itemList } = await render("komposithegn");
    expect(products).toEqual(["t1-a", "t1-b", "t2-a"]);
    expect(itemList?.numberOfItems).toBe(3);
  });

  it("a leaf lists its own products with the leaf clause", async () => {
    const { products, where } = await render("type-2");
    expect(products).toEqual(["t2-a"]);
    expect(where).toStrictEqual({ categoryId: "type-2", status: "active", deletedAt: null });
  });

  it("a leaf's trail walks root → parent → leaf, visible and JSON-LD alike", async () => {
    const { crumbs, breadcrumbList } = await render("type-1");
    expect(crumbs).toStrictEqual([
      { label: HOME, href: `/${LOCALE}` },
      { label: "All products", href: `/${LOCALE}/produkter` },
      { label: "Hegn", href: `/${LOCALE}/category/hegn` },
      { label: "Komposithegn", href: `/${LOCALE}/category/komposithegn` },
      { label: "Type 1" },
    ]);
    expect(breadcrumbList?.itemListElement).toStrictEqual([
      { "@type": "ListItem", position: 1, name: HOME, item: "https://shop.dk" },
      { "@type": "ListItem", position: 2, name: "All products", item: `https://shop.dk/${LOCALE}/produkter` },
      { "@type": "ListItem", position: 3, name: "Hegn", item: `https://shop.dk/${LOCALE}/category/hegn` },
      { "@type": "ListItem", position: 4, name: "Komposithegn", item: `https://shop.dk/${LOCALE}/category/komposithegn` },
      { "@type": "ListItem", position: 5, name: "Type 1", item: `https://shop.dk/${LOCALE}/category/type-1` },
    ]);
  });

  it("a top-level category in a nested shop keeps the flat trail", async () => {
    const { crumbs } = await render("hegn");
    expect(crumbs).toStrictEqual([
      { label: HOME, href: `/${LOCALE}` },
      { label: "All products", href: `/${LOCALE}/produkter` },
      { label: "Hegn" },
    ]);
  });

  it("reads the tree once, with the columns the rollup and both trails need", async () => {
    await render("type-1");
    const treeReads = mocks.prisma.category.findMany.mock.calls.filter(([args]) => args.select);
    expect(treeReads).toHaveLength(1);
    // Literal keys, not CATEGORY_TREE_SELECT: a column dropped from the
    // constant must fail here, not be compared with itself.
    expect(treeReads[0][0].select).toStrictEqual({
      id: true,
      parentId: true,
      slug: true,
      name: true,
      permalink: true,
      translations: true,
    });
  });

  whenMultiLocale("on another locale the ancestors are translated and link in that locale", async () => {
    mocks.cats.find((c) => c.id === "hegn")!.translations = { [OTHER!]: { name: "Fences" } };
    const { crumbs, breadcrumbList } = await render("type-1", OTHER!);
    expect(crumbs).toStrictEqual([
      { label: homeBreadcrumbLabel(OTHER!), href: `/${OTHER}` },
      { label: "All products", href: `/${OTHER}/produkter` },
      { label: "Fences", href: `/${OTHER}/category/hegn` },
      // No translation stored: the base name, still linked in the page's locale.
      { label: "Komposithegn", href: `/${OTHER}/category/komposithegn` },
      { label: "Type 1" },
    ]);
    expect(breadcrumbList?.itemListElement).toStrictEqual([
      { "@type": "ListItem", position: 1, name: homeBreadcrumbLabel(OTHER!), item: "https://shop.dk" },
      { "@type": "ListItem", position: 2, name: "All products", item: `https://shop.dk/${OTHER}/produkter` },
      { "@type": "ListItem", position: 3, name: "Fences", item: `https://shop.dk/${OTHER}/category/hegn` },
      { "@type": "ListItem", position: 4, name: "Komposithegn", item: `https://shop.dk/${OTHER}/category/komposithegn` },
      { "@type": "ListItem", position: 5, name: "Type 1", item: `https://shop.dk/${OTHER}/category/type-1` },
    ]);
  });
});

describe("a failed tree query renders the page as it was before the tree", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.state.treeFails = true;
    mocks.cats.push(
      cat("hegn", "Hegn", null),
      cat("komposithegn", "Komposithegn", "hegn"),
      cat("type-1", "Type 1", "komposithegn"),
    );
    mocks.products.push(prod("k-direct", "komposithegn"), prod("t1-a", "type-1"));
  });

  afterEach(() => consoleError.mockRestore());

  it("the category's own products, with the leaf clause, and the flat trail", async () => {
    const { products, where, crumbs, breadcrumbList } = await render("komposithegn");
    expect(products).toEqual(["k-direct"]);
    expect(where).toStrictEqual({ categoryId: "komposithegn", status: "active", deletedAt: null });
    expect(crumbs).toStrictEqual([
      { label: HOME, href: `/${LOCALE}` },
      { label: "All products", href: `/${LOCALE}/produkter` },
      { label: "Komposithegn" },
    ]);
    expect(breadcrumbList?.itemListElement).toStrictEqual([
      { "@type": "ListItem", position: 1, name: HOME, item: "https://shop.dk" },
      { "@type": "ListItem", position: 2, name: "All products", item: `https://shop.dk/${LOCALE}/produkter` },
      { "@type": "ListItem", position: 3, name: "Komposithegn", item: `https://shop.dk/${LOCALE}/category/komposithegn` },
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      "[category] category tree failed, falling back to []:",
      expect.any(Error),
    );
  });
});

describe("a parent loop terminates on the page too", () => {
  it("A→B→A renders both pages with the flat trail and each other's products", async () => {
    mocks.cats.push(cat("a", "A", "b"), cat("b", "B", "a"));
    mocks.products.push(prod("in-a", "a"), prod("in-b", "b"));
    const a = await render("a");
    expect(a.products).toEqual(["in-a", "in-b"]);
    expect((a.crumbs as unknown[]).length).toBe(3);
  });
});

describe("a soft-deleted product is not on the category page (CAT-DELETED-FILTER)", () => {
  it("a flat shop's category lists, counts and ItemLists only its live products", async () => {
    mocks.cats.push(cat("tea", "Tea", null));
    mocks.products.push(prod("sencha", "tea"), prod("gone", "tea", new Date("2026-10-01")));
    const { products, itemList } = await render("tea");
    expect(products).toEqual(["sencha"]);
    expect(itemList?.numberOfItems).toBe(1);
    expect((itemList?.itemListElement as { name: string }[]).map((e) => e.name)).toEqual(["SENCHA"]);
  });

  it("a parent's rollup leaves out a soft-deleted product in a leaf", async () => {
    mocks.cats.push(cat("hegn", "Hegn", null), cat("type-1", "Type 1", "hegn"));
    mocks.products.push(prod("t1-a", "type-1"), prod("t1-gone", "type-1", new Date("2026-10-01")));
    const { products, itemList } = await render("hegn");
    expect(products).toEqual(["t1-a"]);
    expect(itemList?.numberOfItems).toBe(1);
  });

  it("a category whose products are all deleted renders empty, with no ItemList", async () => {
    mocks.cats.push(cat("tea", "Tea", null));
    mocks.products.push(prod("gone", "tea", new Date("2026-10-01")));
    const { products, itemList } = await render("tea");
    expect(products).toEqual([]);
    expect(itemList).toBeUndefined();
  });
});

describe("a draft product is not on the category page (STOREFRONT-DRAFT-FILTER)", () => {
  it("a flat shop's category lists, counts and ItemLists only its active products", async () => {
    mocks.cats.push(cat("tea", "Tea", null));
    mocks.products.push(prod("sencha", "tea"), prod("draft", "tea", null, "draft"));
    const { products, itemList } = await render("tea");
    expect(products).toEqual(["sencha"]);
    expect(itemList?.numberOfItems).toBe(1);
    expect((itemList?.itemListElement as { name: string }[]).map((e) => e.name)).toEqual(["SENCHA"]);
  });

  it("a parent's rollup leaves out a draft in a leaf", async () => {
    mocks.cats.push(cat("hegn", "Hegn", null), cat("type-1", "Type 1", "hegn"));
    mocks.products.push(prod("t1-a", "type-1"), prod("t1-draft", "type-1", null, "draft"));
    const { products, itemList } = await render("hegn");
    expect(products).toEqual(["t1-a"]);
    expect(itemList?.numberOfItems).toBe(1);
  });
});

/**
 * WP2-TREE-READ-COST: the whole Category table was read on every request —
 * beside the lookup, so a 404 paid for it too, and on a flat shop, which
 * never uses it. The lookup now counts the category's children in the same
 * query, and the tree is read only for a category that has a parent (the
 * trail) or children (the rollup), after the lookup has found it.
 */
describe("the category tree is read only by a page that uses it", () => {
  const treeReads = () => mocks.prisma.category.findMany.mock.calls.filter(([args]) => args.select);

  it("an unknown slug answers notFound having read neither the tree nor any product", async () => {
    mocks.cats.push(cat("hegn", "Hegn", null), cat("type-1", "Type 1", "hegn"));
    await expect(page.default({ params: Promise.resolve({ slug: "no-such", locale: LOCALE }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(treeReads()).toHaveLength(0);
    expect(mocks.prisma.product.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.category.findUnique).toHaveBeenCalledTimes(1);
  });

  it("a flat shop's category page does not read the tree", async () => {
    mocks.cats.push(cat("tea", "Tea", null), cat("coffee", "Coffee", null));
    mocks.products.push(prod("sencha", "tea"));
    const { where, products } = await render("tea");
    expect(treeReads()).toHaveLength(0);
    expect(where).toStrictEqual({ categoryId: "tea", status: "active", deletedAt: null });
    expect(products).toEqual(["sencha"]);
  });

  it("the decision costs no extra query: the one lookup counts the children", async () => {
    mocks.cats.push(cat("tea", "Tea", null));
    await render("tea");
    expect(mocks.prisma.category.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.category.findUnique).toHaveBeenCalledWith({
      where: { slug: "tea" },
      include: { _count: { select: { children: true } } },
    });
  });

  it("in a nested shop, a top-level category without subcategories does not read it either", async () => {
    mocks.cats.push(cat("hegn", "Hegn", null), cat("type-1", "Type 1", "hegn"), cat("laager", "Låger", null));
    mocks.products.push(prod("laage-a", "laager"), prod("t1-a", "type-1"));
    const { where, products, crumbs } = await render("laager");
    expect(treeReads()).toHaveLength(0);
    expect(where).toStrictEqual({ categoryId: "laager", status: "active", deletedAt: null });
    expect(products).toEqual(["laage-a"]);
    expect((crumbs as unknown[]).length).toBe(3);
  });

  it("a parent reads it once, for its rollup", async () => {
    mocks.cats.push(cat("hegn", "Hegn", null), cat("type-1", "Type 1", "hegn"));
    mocks.products.push(prod("t1-a", "type-1"));
    const { products } = await render("hegn");
    expect(treeReads()).toHaveLength(1);
    expect(products).toEqual(["t1-a"]);
  });

  it("a leaf with a parent reads it once, for its trail", async () => {
    mocks.cats.push(cat("hegn", "Hegn", null), cat("type-1", "Type 1", "hegn"));
    const { crumbs } = await render("type-1");
    expect(treeReads()).toHaveLength(1);
    expect((crumbs as { label: string }[]).map((c) => c.label)).toEqual([HOME, "All products", "Hegn", "Type 1"]);
  });
});

/**
 * WP2-r2′: a product filed under a category as an EXTRA one (`ProductCategory`)
 * is on that category's page — and its parents' — like a primary member. The
 * page's own trail is the category's; the product keeps its primary category,
 * which this route never reads.
 */
describe("a product in an extra category is on that category's page", () => {
  const link = (productId: string, categoryId: string) => mocks.links.push({ productId, categoryId });

  it("a flat shop without links: one read of the links, and the query origin/main sent", async () => {
    mocks.cats.push(cat("tea", "Tea", null), cat("coffee", "Coffee", null));
    mocks.products.push(prod("sencha", "tea"));
    const { where } = await render("tea");
    expect(mocks.prisma.productCategory.groupBy).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.productCategory.groupBy).toHaveBeenCalledWith({ by: ["categoryId"] });
    expect(where).toStrictEqual({ categoryId: "tea", status: "active", deletedAt: null });
  });

  it("a 404 reads no links", async () => {
    await expect(page.default({ params: Promise.resolve({ slug: "no-such", locale: LOCALE }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.prisma.productCategory.groupBy).not.toHaveBeenCalled();
  });

  it("a flat shop's category lists its extra product beside its own, without reading the tree", async () => {
    mocks.cats.push(cat("tea", "Tea", null), cat("coffee", "Coffee", null));
    mocks.products.push(prod("sencha", "tea"), prod("espresso", "coffee"), prod("gone", "coffee", new Date(1)));
    link("espresso", "tea");
    link("gone", "tea");
    const tea = await render("tea");
    expect(tea.where).toStrictEqual({
      OR: [{ categoryId: "tea" }, { extraCategories: { some: { categoryId: "tea" } } }],
      status: "active",
      deletedAt: null,
    });
    expect(tea.products).toEqual(["espresso", "sencha"]);
    expect(tea.itemList?.numberOfItems).toBe(2);
    expect((tea.crumbs as { label: string }[]).map((c) => c.label)).toEqual([HOME, "All products", "Tea"]);
    expect(mocks.prisma.category.findMany.mock.calls.filter(([args]) => args.select)).toHaveLength(0);
    // Its primary category is unlinked: that page's query is the one it was.
    const coffee = await render("coffee");
    expect(coffee.where).toStrictEqual({ categoryId: "coffee", status: "active", deletedAt: null });
    expect(coffee.products).toEqual(["espresso"]);
  });

  it("in a tree, every parent of the extra category lists it, once", async () => {
    mocks.cats.push(
      cat("hegn", "Hegn", null),
      cat("type-1", "Type 1", "hegn"),
      cat("type-2", "Type 2", "hegn"),
      cat("laager", "Låger", null),
    );
    mocks.products.push(prod("t1-a", "type-1"), prod("laage-a", "laager"));
    link("laage-a", "type-1");
    link("laage-a", "type-2");
    link("t1-a", "type-2");
    const hegn = await render("hegn");
    expect(hegn.where).toStrictEqual({
      OR: [
        { categoryId: { in: ["hegn", "type-1", "type-2"] } },
        { extraCategories: { some: { categoryId: { in: ["type-1", "type-2"] } } } },
      ],
      status: "active",
      deletedAt: null,
    });
    expect(hegn.products).toEqual(["laage-a", "t1-a"]);
    expect(hegn.itemList?.numberOfItems).toBe(2);
    expect((await render("type-2")).products).toEqual(["laage-a", "t1-a"]);
    expect((await render("laager")).products).toEqual(["laage-a"]);
  });

  it("a draft filed here as an extra category is not listed, counted or ItemListed (STOREFRONT-DRAFT-FILTER)", async () => {
    mocks.cats.push(cat("tea", "Tea", null), cat("coffee", "Coffee", null));
    mocks.products.push(prod("sencha", "tea"), prod("draft", "coffee", null, "draft"));
    link("draft", "tea");
    const tea = await render("tea");
    expect(tea.products).toEqual(["sencha"]);
    expect(tea.itemList?.numberOfItems).toBe(1);
    expect((await render("coffee")).products).toEqual([]);
  });
});
