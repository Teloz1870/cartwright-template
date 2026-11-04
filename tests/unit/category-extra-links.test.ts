import { describe, expect, it } from "vitest";

import { buildProductQuery } from "@/lib/catalog";
import {
  CATEGORY_IN_LIST_MAX,
  CATEGORY_TREE_MAX_DEPTH,
  categoryCountsWithDescendants,
  categoryCountsWithLinks,
  categoryProductsWhere,
  categorySlugWhere,
  categoryWithDescendantIds,
  type CategoryLink,
  type CategoryTreeNode,
} from "@/lib/category-tree";
import { fitsPrismaSqlite, prismaBindValues } from "../helpers/prisma-binds";

/**
 * WP2-r2′ — a product filed under more than one category. `Product.categoryId`
 * stays the PRIMARY category; a `ProductCategory` row files it under one more,
 * and the product lists that take a category — its page, the catalogue filter,
 * `products.search`, the counts — take it like a primary member.
 *
 * Pure over the rows, like tests/unit/category-tree.test.ts: the shapes that
 * matter are pinned without a database, and what a `where` matches is
 * evaluated here the way SQL would, then compared with what the id walk says.
 * tests/unit/category-links-db.test.ts runs the same wheres on libSQL.
 */

type Row = CategoryTreeNode & { slug: string };
const row = (id: string, parentId: string | null): Row => ({ id, parentId, slug: id });

const FLAT = [row("coffee", null), row("tea", null), row("gear", null)];
const NESTED = [
  row("hegn", null),
  row("komposithegn", "hegn"),
  row("type-1", "komposithegn"),
  row("type-2", "komposithegn"),
  row("traehegn", "hegn"),
  row("laager", null),
];

type Product = { id: string; categoryId: string; links: string[] };

/** A Category filter (`id`/`slug`/`parentId`, `parent`, `OR`) on one row. */
function categoryMatches(rows: readonly Row[], id: string, filter: Record<string, unknown>): boolean {
  const category = rows.find((r) => r.id === id);
  if (!category) return false;
  return Object.entries(filter).every(([key, value]) => {
    if (key === "OR") return (value as Record<string, unknown>[]).some((leg) => categoryMatches(rows, id, leg));
    if (key === "parent") {
      return category.parentId !== null && categoryMatches(rows, category.parentId, value as Record<string, unknown>);
    }
    return (category as Record<string, unknown>)[key] === value;
  });
}

const idMatches = (match: unknown, id: string) =>
  typeof match === "string" ? match === id : (match as { in: string[] }).in.includes(id);

/** A product `where` from the helpers, as the database applies it. */
function productMatches(rows: readonly Row[], where: Record<string, unknown>, p: Product): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Record<string, unknown>[]).some((leg) => productMatches(rows, leg, p));
    if (key === "categoryId") return idMatches(value, p.categoryId);
    if (key === "category") return categoryMatches(rows, p.categoryId, value as Record<string, unknown>);
    if (key === "extraCategories") {
      const link = (value as { some: Record<string, unknown> }).some;
      return p.links.some((c) =>
        "categoryId" in link
          ? idMatches(link.categoryId, c)
          : categoryMatches(rows, c, link.category as Record<string, unknown>),
      );
    }
    throw new Error(`productMatches: ${key} is not modelled`);
  });
}

/** What a category lists by the walk: primary OR extra category in its subtree. */
function listedByWalk(rows: readonly Row[], id: string, products: Product[]): string[] {
  const subtree = new Set(categoryWithDescendantIds(rows, id));
  return products.filter((p) => subtree.has(p.categoryId) || p.links.some((c) => subtree.has(c))).map((p) => p.id);
}

const linkedOf = (products: Product[]) => new Set(products.flatMap((p) => p.links));

describe("a shop without ProductCategory rows gets exactly the clause it had", () => {
  it.each([
    ["flat", FLAT],
    ["nested", NESTED],
  ] as const)("%s: every category, by id and by slug, with no links or none in its subtree", (_, rows) => {
    for (const r of rows) {
      const before = { byId: categoryProductsWhere(rows, r.id), bySlug: categorySlugWhere(rows, r.slug) };
      for (const linked of [new Set<string>(), new Set(["elsewhere"])]) {
        expect(JSON.stringify(categoryProductsWhere(rows, r.id, linked))).toBe(JSON.stringify(before.byId));
        expect(JSON.stringify(categorySlugWhere(rows, r.slug, linked))).toBe(JSON.stringify(before.bySlug));
      }
    }
    // A link beside the subtree changes nothing either.
    expect(categoryProductsWhere(NESTED, "komposithegn", new Set(["laager"]))).toStrictEqual(
      categoryProductsWhere(NESTED, "komposithegn"),
    );
  });

  it("the catalogue's query is the same object it was", () => {
    const params = { kategori: "tea", q: "green sencha", brand: "Leaf" };
    expect(JSON.stringify(buildProductQuery(params, FLAT, new Set()))).toBe(
      JSON.stringify(buildProductQuery(params, FLAT)),
    );
  });
});

describe("a category with extra products lists them beside its own", () => {
  it("a leaf: its own id OR a link to it — also without the tree, as a flat page reads it", () => {
    const where = { OR: [{ categoryId: "tea" }, { extraCategories: { some: { categoryId: "tea" } } }] };
    expect(categoryProductsWhere(FLAT, "tea", new Set(["tea"]))).toStrictEqual(where);
    expect(categoryProductsWhere([], "tea", new Set(["tea"]))).toStrictEqual(where);
    expect(categorySlugWhere(FLAT, "tea", new Set(["tea"]))).toStrictEqual(where);
  });

  it("a parent names its subtree, and only the subtree's linked categories in the extra leg", () => {
    expect(categoryProductsWhere(NESTED, "komposithegn", new Set(["type-2", "laager"]))).toStrictEqual({
      OR: [
        { categoryId: { in: ["komposithegn", "type-1", "type-2"] } },
        { extraCategories: { some: { categoryId: "type-2" } } },
      ],
    });
    expect(categorySlugWhere(NESTED, "hegn", new Set(["type-1", "traehegn"]))).toStrictEqual({
      OR: [
        { categoryId: { in: ["hegn", "komposithegn", "traehegn", "type-1", "type-2"] } },
        { extraCategories: { some: { categoryId: { in: ["traehegn", "type-1"] } } } },
      ],
    });
  });

  it("each product once, whether filed under the category as primary, extra or both", () => {
    const products: Product[] = [
      { id: "primary-only", categoryId: "type-1", links: [] },
      { id: "extra-only", categoryId: "laager", links: ["type-2"] },
      { id: "both", categoryId: "type-1", links: ["type-2", "komposithegn"] },
      { id: "beside", categoryId: "laager", links: ["traehegn"] },
    ];
    const linked = linkedOf(products);
    for (const id of ["hegn", "komposithegn", "type-1", "type-2", "laager", "traehegn"]) {
      const where = categoryProductsWhere(NESTED, id, linked);
      const got = products.filter((p) => productMatches(NESTED, where, p)).map((p) => p.id);
      expect(got, id).toEqual(listedByWalk(NESTED, id, products));
    }
    expect(products.filter((p) => productMatches(NESTED, categoryProductsWhere(NESTED, "type-2", linked), p)))
      .toHaveLength(2);
  });

  it("a slug the rows do not hold, or no rows at all, keeps the primary-only relation clause", () => {
    expect(categorySlugWhere(NESTED, "nope", new Set(["type-1"]))).toStrictEqual({ category: { slug: "nope" } });
    expect(categorySlugWhere([], "tea", new Set(["tea"]))).toStrictEqual({ category: { slug: "tea" } });
  });
});

describe("both legs share the bind budget (CATEGORY-IN-LIST-BIND-LIMIT)", () => {
  const wide = (n: number) => [row("root", null), ...Array.from({ length: n }, (_, i) => row(`c${i}`, "root"))];
  // Every category linked: the widest extra leg a subtree can have.
  const allLinked = (rows: Row[]) => new Set(rows.map((r) => r.id));

  it(`subtree + linked ids up to ${CATEGORY_IN_LIST_MAX} stay by id and fit`, () => {
    const rows = wide(CATEGORY_IN_LIST_MAX / 2 - 1);
    const where = categoryProductsWhere(rows, "root", allLinked(rows));
    expect(prismaBindValues(where)).toBe(CATEGORY_IN_LIST_MAX);
    expect(JSON.stringify(where)).toContain('"categoryId":{"in"');
    expect(fitsPrismaSqlite({ ...where, deletedAt: null })).toBe(true);
  });

  it("one past that, both legs follow the parent chain: 2 × (depth + 1) values however wide", () => {
    for (const n of [CATEGORY_IN_LIST_MAX / 2, 1200, 5000]) {
      const rows = wide(n);
      for (const where of [
        categoryProductsWhere(rows, "root", allLinked(rows)),
        categorySlugWhere(rows, "root", allLinked(rows)),
      ]) {
        expect(prismaBindValues(where)).toBe(2 * (CATEGORY_TREE_MAX_DEPTH + 1));
        expect(JSON.stringify(where)).not.toContain('"in"');
      }
    }
  });

  it("the relation shape matches what the walk lists, depth cap and a link past it included", () => {
    const chain = Array.from({ length: 12 }, (_, i) => row(`d${i}`, i === 0 ? "c0" : `d${i - 1}`));
    const rows = [...wide(1200), ...chain, row("beside", null)];
    const products: Product[] = [
      { id: "in-d8", categoryId: "beside", links: ["d8"] }, // level 10: listed
      { id: "in-d9", categoryId: "beside", links: ["d9"] }, // level 11: past the cap
      { id: "primary-c5", categoryId: "c5", links: ["c6"] },
      { id: "only-beside", categoryId: "beside", links: [] },
    ];
    const where = categoryProductsWhere(rows, "root", allLinked(rows));
    expect(Object.keys((where as { OR: object[] }).OR[0])).toEqual(["category"]);
    const got = products.filter((p) => productMatches(rows, where, p)).map((p) => p.id);
    expect(got).toEqual(listedByWalk(rows, "root", products));
    expect(got).toEqual(["in-d8", "primary-c5"]);
  });

  it("the busiest catalogue query still fits at either side of the switch", () => {
    const everyFilter = {
      q: Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "),
      kategori: "root",
      brand: "Leaf",
      stelfarve: "black",
      glasfarve: "grey",
      minPris: "1",
      maxPris: "2",
    };
    for (const n of [CATEGORY_IN_LIST_MAX / 2 - 1, CATEGORY_IN_LIST_MAX / 2, 2000]) {
      const rows = wide(n);
      const { where } = buildProductQuery(everyFilter, rows, allLinked(rows));
      expect(where.OR).toBeDefined();
      expect(where.AND).toHaveLength(32); // the search kept its own key
      expect(fitsPrismaSqlite({ ...where, deletedAt: null })).toBe(true);
    }
  });
});

describe("categoryCountsWithLinks — each product once per category", () => {
  const primary = new Map([
    ["hegn", 0],
    ["komposithegn", 0],
    ["type-1", 2],
    ["type-2", 1],
    ["traehegn", 1],
    ["laager", 1],
  ]);
  const link = (productId: string, categoryId: string, primaryCategoryId: string): CategoryLink => ({
    productId,
    categoryId,
    primaryCategoryId,
  });

  it("without links: the primary counts and the primary rollup, unchanged", () => {
    const { direct, withDescendants } = categoryCountsWithLinks(NESTED, primary, []);
    expect(direct).toStrictEqual(primary);
    expect(withDescendants).toStrictEqual(categoryCountsWithDescendants(NESTED, primary));
  });

  it("a link from outside the subtree adds one to the category and each ancestor, once", () => {
    // A gate (primary: laager) also filed under type-1 and type-2.
    const { direct, withDescendants } = categoryCountsWithLinks(NESTED, primary, [
      link("gate", "type-1", "laager"),
      link("gate", "type-2", "laager"),
    ]);
    expect(direct.get("type-1")).toBe(3);
    expect(direct.get("type-2")).toBe(2);
    expect(direct.get("laager")).toBe(1);
    expect(withDescendants.get("komposithegn")).toBe(4); // 3 primary + the gate once
    expect(withDescendants.get("hegn")).toBe(5);
  });

  it("a link inside the subtree that already counts the product adds nothing to the rollup", () => {
    // t1-a (primary type-1) also filed under type-2 and its own parent.
    const { direct, withDescendants } = categoryCountsWithLinks(NESTED, primary, [
      link("t1-a", "type-2", "type-1"),
      link("t1-a", "komposithegn", "type-1"),
      link("t1-a", "type-1", "type-1"), // a link to its own primary category
    ]);
    expect(direct.get("type-2")).toBe(2);
    expect(direct.get("komposithegn")).toBe(1);
    expect(direct.get("type-1")).toBe(2);
    expect(withDescendants.get("komposithegn")).toBe(3);
    expect(withDescendants.get("hegn")).toBe(4);
  });

  it("agrees with the page's own list for every category", () => {
    const products: Product[] = [
      { id: "a", categoryId: "type-1", links: ["type-2", "traehegn"] },
      { id: "b", categoryId: "laager", links: ["komposithegn", "type-1"] },
      { id: "c", categoryId: "traehegn", links: [] },
    ];
    const counts = new Map(NESTED.map((r) => [r.id, products.filter((p) => p.categoryId === r.id).length]));
    const links = products.flatMap((p) => p.links.map((c) => link(p.id, c, p.categoryId)));
    const { direct, withDescendants } = categoryCountsWithLinks(NESTED, counts, links);
    for (const r of NESTED) {
      const listed = listedByWalk(NESTED, r.id, products).length;
      expect(withDescendants.get(r.id) ?? direct.get(r.id), r.id).toBe(listed);
    }
  });

  it("a parent loop terminates and counts each product once", () => {
    const rows = [row("a", "b"), row("b", "a")];
    const { direct, withDescendants } = categoryCountsWithLinks(rows, new Map([["a", 1], ["b", 0]]), [
      link("p", "b", "a"),
      link("q", "a", "elsewhere"),
    ]);
    expect(direct.get("b")).toBe(1);
    expect(withDescendants.get("a")).toBe(2);
    expect(withDescendants.get("b")).toBe(2);
  });
});
