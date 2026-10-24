import { afterEach, describe, expect, it, vi } from "vitest";

import { brand } from "@/brand.config";
import {
  CATEGORY_IN_LIST_MAX,
  CATEGORY_TREE_MAX_DEPTH,
  categoryAncestorCrumbs,
  categoryAncestors,
  categoryCountsWithDescendants,
  categoryProductsWhere,
  categorySlugWhere,
  categoryWithDescendantIds,
  type CategoryTreeRow,
} from "@/lib/category-tree";
import { fitsPrismaSqlite, prismaBindValues } from "../helpers/prisma-binds";

/**
 * WP2-r1′ — the category tree the storefront follows: a parent page lists its
 * subcategories' products, and both breadcrumb trails walk the parent chain.
 * The helpers are pure over the rows one `findMany` returns, so the tree
 * shapes that matter are pinned here without a database: the flat shop every
 * canary is today, the 3-level tree a WooCommerce import brings, and the
 * corrupt ones (a loop, a self-parent, a runaway depth) that must terminate.
 */

const row = (id: string, parentId: string | null, extra: Partial<CategoryTreeRow> = {}): CategoryTreeRow => ({
  id,
  parentId,
  slug: id,
  name: id.toUpperCase(),
  permalink: null,
  translations: null,
  ...extra,
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

// Every shop before WP2: categories, none of them nested.
const FLAT = [row("coffee", null), row("tea", null), row("gear", null)];

// Hegnsfabrikken's shape: products sit only in the leaves.
const NESTED = [
  row("hegn", null),
  row("komposithegn", "hegn"),
  row("type-1", "komposithegn"),
  row("type-2", "komposithegn"),
  row("traehegn", "hegn"),
  row("laager", null),
];

const LOCALE = brand.defaultLocale;
/**
 * A locale this shop publishes that is NOT its source language, or undefined.
 * Derived from `brand.locales`, never typed: tests/unit ships in scaffolds, and
 * the single-locale `["en"]` shop create-cartwright cuts has no second locale —
 * an `?? "en"` fallback there names the DEFAULT locale, which reads the base
 * column, so the translation case failed on a shop that had done nothing
 * wrong. `OTHER!` (not `as string`) is the form that compiles in both contexts
 * — see public-site-tools.test.ts — and is used only inside `whenMultiLocale`.
 */
const OTHER = brand.locales.find((l) => l !== brand.defaultLocale);
/** Skip, loudly: with one locale there is no translation branch to exercise. */
const whenMultiLocale = OTHER ? it : it.skip;

describe("a flat shop — no parent anywhere — gets exactly what it had", () => {
  it.each(FLAT.map((r) => r.id))("%s has no ancestors and only itself as 'descendants'", (id) => {
    expect(categoryAncestors(FLAT, id)).toEqual([]);
    expect(categoryWithDescendantIds(FLAT, id)).toEqual([id]);
    expect(categoryAncestorCrumbs(FLAT, id, LOCALE)).toEqual([]);
  });

  it("the product query is the clause the page used before the tree, not a one-element `in`", () => {
    expect(categoryProductsWhere(FLAT, "tea")).toStrictEqual({ categoryId: "tea" });
  });

  it("a failed tree query (no rows) degrades to the same", () => {
    expect(categoryAncestors([], "tea")).toEqual([]);
    expect(categoryWithDescendantIds([], "tea")).toEqual(["tea"]);
    expect(categoryProductsWhere([], "tea")).toStrictEqual({ categoryId: "tea" });
  });
});

describe("a 3-level tree with products only in the leaves", () => {
  it("the parent and the grandparent take in every category below them", () => {
    expect(categoryWithDescendantIds(NESTED, "hegn")).toEqual([
      "hegn",
      "komposithegn",
      "traehegn",
      "type-1",
      "type-2",
    ]);
    expect(categoryWithDescendantIds(NESTED, "komposithegn")).toEqual(["komposithegn", "type-1", "type-2"]);
    expect(categoryWithDescendantIds(NESTED, "type-1")).toEqual(["type-1"]);
    expect(categoryWithDescendantIds(NESTED, "laager")).toEqual(["laager"]);
  });

  it("a parent's product query names the whole subtree; a leaf's stays `{ categoryId }`", () => {
    expect(categoryProductsWhere(NESTED, "komposithegn")).toStrictEqual({
      categoryId: { in: ["komposithegn", "type-1", "type-2"] },
    });
    expect(categoryProductsWhere(NESTED, "type-2")).toStrictEqual({ categoryId: "type-2" });
  });

  it("the ancestor chain is root first and leaves the category itself out", () => {
    expect(ids(categoryAncestors(NESTED, "type-1"))).toEqual(["hegn", "komposithegn"]);
    expect(ids(categoryAncestors(NESTED, "komposithegn"))).toEqual(["hegn"]);
    expect(ids(categoryAncestors(NESTED, "hegn"))).toEqual([]);
  });

  it("the crumbs link each ancestor through lib/urls.ts in the page's language", () => {
    expect(categoryAncestorCrumbs(NESTED, "type-1", LOCALE)).toEqual([
      { label: "HEGN", href: `/${LOCALE}/category/hegn` },
      { label: "KOMPOSITHEGN", href: `/${LOCALE}/category/komposithegn` },
    ]);
  });

  whenMultiLocale("an ancestor's name is translated on the other locale, and falls back to its own name", () => {
    const rows = NESTED.map((r) =>
      r.id === "hegn" ? { ...r, translations: { [OTHER!]: { name: "Fences" } } } : r,
    );
    expect(categoryAncestorCrumbs(rows, "type-1", OTHER!).map((c) => c.label)).toEqual([
      "Fences",
      "KOMPOSITHEGN",
    ]);
    // The base locale reads the base column, never the translation.
    expect(categoryAncestorCrumbs(rows, "type-1", LOCALE)[0].label).toBe("HEGN");
  });

  it("a parent the rows do not hold ends the chain there", () => {
    const rows = [row("orphan", "gone"), row("child", "orphan")];
    expect(ids(categoryAncestors(rows, "orphan"))).toEqual([]);
    expect(ids(categoryAncestors(rows, "child"))).toEqual(["orphan"]);
  });
});

describe("corrupt trees terminate and never repeat a category", () => {
  it("a loop A→B→A has no root, so neither page claims the other as its parent", () => {
    const rows = [row("a", "b"), row("b", "a"), row("c", "a")];
    expect(categoryAncestors(rows, "a")).toEqual([]);
    expect(categoryAncestors(rows, "b")).toEqual([]);
    // A chain that runs INTO the loop has no root either.
    expect(categoryAncestors(rows, "c")).toEqual([]);
    expect(categoryWithDescendantIds(rows, "a")).toEqual(["a", "b", "c"]);
    expect(categoryWithDescendantIds(rows, "b")).toEqual(["b", "a", "c"]);
  });

  it("a loop is cut at its first repeat, not walked round until the depth cap stops it", () => {
    // The cap would also end the walk with no chain, so only the number of
    // steps tells the two guards apart: count the parent reads.
    let reads = 0;
    const counted = (id: string, parentId: string): CategoryTreeRow => {
      const r = row(id, parentId);
      return Object.defineProperty(r, "parentId", {
        get: () => {
          reads += 1;
          return parentId;
        },
      });
    };
    expect(categoryAncestors([counted("a", "b"), counted("b", "a")], "a")).toEqual([]);
    expect(reads).toBeLessThanOrEqual(2);
  });

  it("a category that is its own parent is a top-level category with no subcategories", () => {
    const rows = [row("self", "self"), row("other", null)];
    expect(categoryAncestors(rows, "self")).toEqual([]);
    expect(categoryWithDescendantIds(rows, "self")).toEqual(["self"]);
    expect(categoryProductsWhere(rows, "self")).toStrictEqual({ categoryId: "self" });
  });

  it(`walks at most ${CATEGORY_TREE_MAX_DEPTH} levels each way`, () => {
    // c0 ← c1 ← … ← c12: thirteen levels.
    const chain = Array.from({ length: 13 }, (_, i) => row(`c${i}`, i === 0 ? null : `c${i - 1}`));
    // Exactly the cap: the chain reaches its root and is kept whole.
    expect(ids(categoryAncestors(chain, `c${CATEGORY_TREE_MAX_DEPTH}`))).toEqual(
      Array.from({ length: CATEGORY_TREE_MAX_DEPTH }, (_, i) => `c${i}`),
    );
    // One past it: no root within the cap, so no chain.
    expect(categoryAncestors(chain, `c${CATEGORY_TREE_MAX_DEPTH + 1}`)).toEqual([]);
    // Down from the root: itself plus the cap's worth of levels.
    expect(categoryWithDescendantIds(chain, "c0")).toHaveLength(CATEGORY_TREE_MAX_DEPTH + 1);
  });
});

describe("with urls.permalinks on, an ancestor crumb links its stored permalink", () => {
  afterEach(() => {
    vi.doUnmock("@/brand.config");
    vi.resetModules();
  });

  it("the same address the category's own links use", async () => {
    vi.resetModules();
    const actual = await vi.importActual<typeof import("@/brand.config")>("@/brand.config");
    vi.doMock("@/brand.config", () => ({
      ...actual,
      brand: { ...actual.brand, urls: { permalinks: true, trailingSlash: true, localePrefix: "always" } },
    }));
    const tree = await import("@/lib/category-tree");
    const rows = NESTED.map((r) => (r.id === "hegn" ? { ...r, permalink: "/hegn/" } : r));
    expect(tree.categoryAncestorCrumbs(rows, "komposithegn", LOCALE)).toEqual([
      { label: "HEGN", href: `/${LOCALE}/hegn/` },
    ]);
  });
});

describe("WP2-r1′-b — the slug filter and the counts follow the same tree", () => {
  it("a flat shop's slug filter is the relation clause it always was, never an `in`", () => {
    for (const r of FLAT) {
      expect(categorySlugWhere(FLAT, r.slug)).toStrictEqual({ category: { slug: r.slug } });
    }
  });

  it("no rows (a failed tree query) and an unknown slug keep the relation clause too", () => {
    expect(categorySlugWhere([], "komposithegn")).toStrictEqual({ category: { slug: "komposithegn" } });
    expect(categorySlugWhere(NESTED, "nope")).toStrictEqual({ category: { slug: "nope" } });
  });

  it("a parent's slug filter names its whole subtree by id; a leaf's stays the relation clause", () => {
    expect(categorySlugWhere(NESTED, "komposithegn")).toStrictEqual({
      categoryId: { in: ["komposithegn", "type-1", "type-2"] },
    });
    expect(categorySlugWhere(NESTED, "type-1")).toStrictEqual({ category: { slug: "type-1" } });
  });

  it("matches the slug, not the id", () => {
    const rows = [row("c1", null, { slug: "fences" }), row("c2", "c1", { slug: "gates" })];
    expect(categorySlugWhere(rows, "fences")).toStrictEqual({ categoryId: { in: ["c1", "c2"] } });
    expect(categorySlugWhere(rows, "c1")).toStrictEqual({ category: { slug: "c1" } });
  });

  it("a flat shop gets no rolled-up counts at all", () => {
    const direct = new Map([["coffee", 3], ["tea", 0], ["gear", 5]]);
    expect(categoryCountsWithDescendants(FLAT, direct)).toEqual(new Map());
  });

  it("each parent sums itself and everything below it; leaves are left out", () => {
    const direct = new Map([
      ["hegn", 1],
      ["komposithegn", 0],
      ["type-1", 4],
      ["type-2", 2],
      ["traehegn", 3],
      ["laager", 7],
    ]);
    expect(categoryCountsWithDescendants(NESTED, direct)).toEqual(
      new Map([
        ["hegn", 10],
        ["komposithegn", 6],
      ]),
    );
  });

  it("a loop counts each category once", () => {
    const rows = [row("a", "b"), row("b", "a")];
    expect(categoryCountsWithDescendants(rows, new Map([["a", 2], ["b", 3]]))).toEqual(
      new Map([
        ["a", 5],
        ["b", 5],
      ]),
    );
  });

  it(`a count takes in at most ${CATEGORY_TREE_MAX_DEPTH} levels below the category, like its page`, () => {
    // c0 ← c1 ← … ← c12, one product each: c0's total stops at the cap.
    const chain = Array.from({ length: 13 }, (_, i) => row(`c${i}`, i === 0 ? null : `c${i - 1}`));
    const totals = categoryCountsWithDescendants(chain, new Map(chain.map((r) => [r.id, 1])));
    expect(totals.get("c0")).toBe(CATEGORY_TREE_MAX_DEPTH + 1);
    expect(totals.get("c11")).toBe(2);
    expect(totals.has("c12")).toBe(false);
  });

  it("the counts build one child index for the whole call, not one per category", () => {
    // R1: an index rebuilt for every row made 10,000 categories under one
    // parent cost about a second of blocked event loop on each categories.list
    // and /admin/kategorier render. Building the index is the only step that
    // reads `parentId` — the walks read the index — so the reads count the
    // builds: one build reads each row's parent once, a build per row reads
    // them all once per row (10,001² here).
    let reads = 0;
    const counted = (id: string, parentId: string | null) =>
      Object.defineProperty({ id, parentId }, "parentId", {
        get: () => {
          reads += 1;
          return parentId;
        },
      });
    const n = 10_000;
    const rows = [counted("root", null), ...Array.from({ length: n }, (_, i) => counted(`c${i}`, "root"))];
    const direct = new Map(rows.map((r) => [r.id, 1]));
    expect(categoryCountsWithDescendants(rows, direct)).toEqual(new Map([["root", n + 1]]));
    expect(reads).toBe(rows.length);
  });
});

/**
 * Which categories a slug filter's `where` matches, read the way Prisma reads
 * it: an `in` list by id, `category: { slug }`, or a Category filter of `id`,
 * `parentId`, `parent` (none when the parent is missing) and `OR`.
 */
function categoriesMatched(rows: readonly CategoryTreeRow[], where: object): string[] {
  if ("categoryId" in where) return (where.categoryId as { in: string[] }).in;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const matches = (category: CategoryTreeRow, filter: Record<string, unknown>): boolean =>
    Object.entries(filter).every(([key, value]) => {
      if (key === "OR") return (value as Record<string, unknown>[]).some((leg) => matches(category, leg));
      if (key === "parent") {
        const parent = category.parentId === null ? undefined : byId.get(category.parentId);
        return parent !== undefined && matches(parent, value as Record<string, unknown>);
      }
      return (category as Record<string, unknown>)[key] === value;
    });
  const filter = (where as { category: Record<string, unknown> }).category;
  return rows.filter((r) => matches(r, filter)).map((r) => r.id);
}

describe("CATEGORY-IN-LIST-BIND-LIMIT — a wide subtree is still one query that fits", () => {
  // Prisma's SQLite/libSQL client refuses a query with more than 999 bind
  // values; an `in` list binds one per id, so a parent with ~1,000 categories
  // below it made products.search throw P2029 and the catalogue show nothing.
  const wide = (n: number, extra: CategoryTreeRow[] = []) => [
    row("root", null),
    ...Array.from({ length: n }, (_, i) => row(`c${i}`, "root")),
    ...extra,
  ];

  it(`up to ${CATEGORY_IN_LIST_MAX} ids the filter stays the \`in\` list`, () => {
    const rows = wide(CATEGORY_IN_LIST_MAX - 1);
    const where = categorySlugWhere(rows, "root");
    expect(where).toStrictEqual({ categoryId: { in: categoryWithDescendantIds(rows, "root") } });
    expect(categoryWithDescendantIds(rows, "root")).toHaveLength(CATEGORY_IN_LIST_MAX);
    expect(fitsPrismaSqlite(where)).toBe(true);
  });

  it("past that it follows the parent chain: the same categories, one bind value per level", () => {
    // 1,200 subcategories, a chain running past the depth cap below one of
    // them, and a root beside the subtree.
    const chain = Array.from({ length: 12 }, (_, i) => row(`d${i}`, i === 0 ? "c0" : `d${i - 1}`));
    const rows = wide(1200, [...chain, row("beside", null)]);
    const where = categorySlugWhere(rows, "root");
    expect(Object.keys(where)).toEqual(["category"]);
    expect(prismaBindValues(where)).toBe(CATEGORY_TREE_MAX_DEPTH + 1);
    const matched = categoriesMatched(rows, where);
    expect(new Set(matched)).toEqual(new Set(categoryWithDescendantIds(rows, "root")));
    // root → c0 → d0 … d8 is ten levels; d9 is past the cap, as on the page.
    expect(matched).toContain("d8");
    expect(matched).not.toContain("d9");
    expect(matched).not.toContain("beside");
  });

  it("a wide subtree that loops back on its own root matches what the walk returns", () => {
    const rows = wide(1200).map((r) => (r.id === "root" ? { ...r, parentId: "c5" } : r));
    const where = categorySlugWhere(rows, "root");
    expect(prismaBindValues(where)).toBe(CATEGORY_TREE_MAX_DEPTH + 1);
    expect(new Set(categoriesMatched(rows, where))).toEqual(new Set(categoryWithDescendantIds(rows, "root")));
  });

  it("a category in the middle of a wide tree is matched from its own place in it", () => {
    const rows = [
      row("root", null),
      row("mid", "root"),
      ...Array.from({ length: 1500 }, (_, i) => row(`m${i}`, "mid")),
      row("sibling", "root"),
    ];
    const where = categorySlugWhere(rows, "mid");
    expect(prismaBindValues(where)).toBe(CATEGORY_TREE_MAX_DEPTH + 1);
    const matched = new Set(categoriesMatched(rows, where));
    expect(matched).toEqual(new Set(categoryWithDescendantIds(rows, "mid")));
    expect(matched.has("root")).toBe(false);
    expect(matched.has("sibling")).toBe(false);
  });
});

/**
 * WP2-TREE-READ-COST — the category page's own query takes the same bounded
 * shape. Its `product.findMany` sits behind a fail-soft `.catch`, so past ~997
 * ids the P2029 became an empty grid with no error on the page.
 */
describe("the category page's subtree is bounded the same way", () => {
  const wide = (n: number, extra: CategoryTreeRow[] = []) => [
    row("root", null),
    ...Array.from({ length: n }, (_, i) => row(`c${i}`, "root")),
    ...extra,
  ];

  it(`up to ${CATEGORY_IN_LIST_MAX} ids the page keeps its \`in\` list`, () => {
    const rows = wide(CATEGORY_IN_LIST_MAX - 1);
    expect(categoryProductsWhere(rows, "root")).toStrictEqual({
      categoryId: { in: categoryWithDescendantIds(rows, "root") },
    });
  });

  it("past that it is the catalogue's parent-chain filter, so both readers share one shape", () => {
    const rows = wide(CATEGORY_IN_LIST_MAX);
    const where = categoryProductsWhere(rows, "root");
    expect(where).toStrictEqual(categorySlugWhere(rows, "root"));
    expect(Object.keys(where)).toEqual(["category"]);
  });

  it("it binds one value per level however wide, and fits beside deletedAt and the page's LIMIT/OFFSET", () => {
    for (const n of [1200, 5000]) {
      const where = { ...categoryProductsWhere(wide(n), "root"), deletedAt: null };
      expect(prismaBindValues(where)).toBe(CATEGORY_TREE_MAX_DEPTH + 1);
      expect(fitsPrismaSqlite(where)).toBe(true);
    }
  });

  it("it matches the categories the walk returns, depth cap included", () => {
    const chain = Array.from({ length: 12 }, (_, i) => row(`d${i}`, i === 0 ? "c0" : `d${i - 1}`));
    const rows = wide(1200, [...chain, row("beside", null)]);
    const matched = categoriesMatched(rows, categoryProductsWhere(rows, "root"));
    expect(new Set(matched)).toEqual(new Set(categoryWithDescendantIds(rows, "root")));
    expect(matched).toContain("d8");
    expect(matched).not.toContain("d9");
    expect(matched).not.toContain("beside");
  });
});
