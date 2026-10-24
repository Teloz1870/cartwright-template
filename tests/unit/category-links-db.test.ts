import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import { findCategoryLinks, findLinkedCategoryIds } from "@/lib/category-links";
import { LIVE_PRODUCT_WHERE } from "@/lib/product-visibility";
import {
  CATEGORY_SUBTREE_SELECT,
  CATEGORY_TREE_SELECT,
  categoryCountsWithLinks,
  categoryProductsWhere,
  categorySlugWhere,
  categoryWithDescendantIds,
} from "@/lib/category-tree";
import { PRISMA_FIND_MANY_PAGE_BINDS, PRISMA_SQLITE_MAX_BINDS, prismaBindValues } from "../helpers/prisma-binds";

/**
 * WP2-r2′ against a real database: products filed under a category through
 * `ProductCategory` are listed by the wheres the category page, the catalogue
 * filter and `products.search` send, run by the real Prisma client over libSQL
 * on the migration baseline's schema — as tests/unit/category-subtree-db.test.ts
 * does for the tree. What each must list is computed separately from the rows.
 *
 * STOREFRONT-DRAFT-FILTER: a draft filed under a category as an extra one is
 * left out of the public lists and counts like a deleted one, and an owner's
 * count (`{ deletedAt: null }`) still has it.
 *
 * It also measures the bind model the pure tests count with: the new
 * `extraCategories: { some }` leg binds one value per id and nothing else, so
 * the shared `CATEGORY_IN_LIST_MAX` budget is real for the two legs together.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const db = vi.hoisted(() => ({ client: null as unknown as object }));
// lib/category-links.ts reads `prisma` from lib/db: hand it this file's client.
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_target, key) => Reflect.get(db.client, key) }),
}));

const WIDTH = 1200; // > 997 below the root: neither leg fits as an id list
const LINKED = 600; // products from "other" also filed under w0 … w599

let dir = "";
let prisma: PrismaClient;

beforeAll(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-links-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  db.client = prisma;

  // root ─ w0 … w1199        (one primary product each)
  // narrow ─ n0, n1          (n1 holds only an extra product)
  // other                    (primary of every linked product; beside both trees)
  const categories = [
    { id: "root", slug: "root", name: "Root", parentId: null },
    { id: "narrow", slug: "narrow", name: "Narrow", parentId: null },
    { id: "n0", slug: "n-0", name: "N0", parentId: "narrow" },
    { id: "n1", slug: "n-1", name: "N1", parentId: "narrow" },
    { id: "other", slug: "other", name: "Other", parentId: null },
    ...Array.from({ length: WIDTH }, (_, i) => ({ id: `w${i}`, slug: `w-${i}`, name: `W${i}`, parentId: "root" })),
  ];
  await prisma.category.createMany({ data: categories });
  const product = (id: string, categoryId: string, i: number, deletedAt: Date | null = null, status = "active") => ({
    id,
    slug: id,
    name: id,
    description: "",
    priceDkk: 1000,
    images: "[]",
    categoryId,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    deletedAt,
    status,
  });
  await prisma.product.createMany({
    data: [
      ...Array.from({ length: WIDTH }, (_, i) => product(`p-w${i}`, `w${i}`, i)),
      ...Array.from({ length: LINKED }, (_, i) => product(`x-${i}`, "other", WIDTH + i)),
      product("x-gone", "other", 9000, new Date("2026-10-01")),
      product("x-draft", "other", 9003, null, "draft"),
      product("n0-a", "n0", 9001),
      product("x-narrow", "other", 9002),
    ],
  });
  await prisma.productCategory.createMany({
    data: [
      ...Array.from({ length: LINKED }, (_, i) => ({ productId: `x-${i}`, categoryId: `w${i}` })),
      { productId: "x-0", categoryId: "w1" }, // two links in one subtree: listed once
      { productId: "p-w2", categoryId: "w3" }, // primary in the subtree too: listed once
      { productId: "x-gone", categoryId: "w5" }, // soft-deleted: never listed
      { productId: "x-draft", categoryId: "w6" }, // a draft: never listed publicly
      { productId: "x-narrow", categoryId: "n1" },
    ],
  });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** The live products a category lists by the walk: primary or extra category in its subtree. */
async function expected(rootId: string): Promise<string[]> {
  const tree = await prisma.category.findMany({ select: CATEGORY_SUBTREE_SELECT });
  const ids = new Set(categoryWithDescendantIds(tree, rootId));
  const live = await prisma.product.findMany({
    where: LIVE_PRODUCT_WHERE,
    select: { id: true, categoryId: true, extraCategories: { select: { categoryId: true } } },
  });
  return live
    .filter((p) => ids.has(p.categoryId) || p.extraCategories.some((link) => ids.has(link.categoryId)))
    .map((p) => p.id)
    .sort();
}

describe.skipIf(!sqlite)("products in extra categories, on a real database", () => {
  it("the linked categories are one GROUP BY over the join", async () => {
    const linked = await findLinkedCategoryIds("test");
    expect(linked.size).toBe(LINKED + 1); // w0 … w599 (w1, w3, w5 twice) + n1
    expect([...linked].sort()).toEqual(
      [...new Set([...Array.from({ length: LINKED }, (_, i) => `w${i}`), "w1", "w3", "w5", "n1"])].sort(),
    );
  });

  it("the extra leg binds one value per id: 997 values run, 998 are refused with P2029", async () => {
    const a = Array.from({ length: 500 }, (_, i) => `a${i}`);
    const where = (b: number) => ({
      OR: [
        { categoryId: { in: a } },
        { extraCategories: { some: { categoryId: { in: Array.from({ length: b }, (_, i) => `b${i}`) } } } },
      ],
      deletedAt: null,
    });
    const budget = PRISMA_SQLITE_MAX_BINDS - PRISMA_FIND_MANY_PAGE_BINDS - a.length;
    expect(prismaBindValues(where(budget))).toBe(997);
    await expect(prisma.product.findMany({ where: where(budget), orderBy: { createdAt: "desc" } })).resolves.toEqual(
      [],
    );
    await expect(
      prisma.product.findMany({ where: where(budget + 1), orderBy: { createdAt: "desc" } }),
    ).rejects.toMatchObject({ code: "P2029" });
  });

  it("the category page lists every live product below the root, primary or extra, each once", async () => {
    const [tree, linked] = await Promise.all([
      prisma.category.findMany({ select: CATEGORY_TREE_SELECT }),
      findLinkedCategoryIds("test"),
    ]);
    // The page's own call: app/[locale]/category/[slug]/page.tsx.
    const where = { ...categoryProductsWhere(tree, "root", linked), ...LIVE_PRODUCT_WHERE };
    expect(prismaBindValues(where)).toBeLessThan(30); // the parent chain, not 1,800 ids
    const products = await prisma.product.findMany({ where, orderBy: { createdAt: "desc" } });
    const got = products.map((p) => p.id);
    expect(new Set(got).size).toBe(got.length);
    expect([...got].sort()).toEqual(await expected("root"));
    expect(got).toHaveLength(WIDTH + LINKED);
    expect(got).toContain("x-599");
    expect(got).not.toContain("x-gone");
    expect(got).not.toContain("x-draft");
    expect(got).not.toContain("x-narrow");
  });

  it("the catalogue filter by slug lists the same; a narrow subtree keeps its id lists", async () => {
    const [tree, linked] = await Promise.all([
      prisma.category.findMany({ select: CATEGORY_SUBTREE_SELECT }),
      findLinkedCategoryIds("test"),
    ]);
    const wide = await prisma.product.findMany({
      where: { ...LIVE_PRODUCT_WHERE, ...categorySlugWhere(tree, "root", linked) },
      orderBy: { name: "asc" },
      select: { id: true },
    });
    expect(wide.map((p) => p.id).sort()).toEqual(await expected("root"));

    const narrowWhere = categorySlugWhere(tree, "narrow", linked);
    expect(narrowWhere).toStrictEqual({
      OR: [{ categoryId: { in: ["narrow", "n0", "n1"] } }, { extraCategories: { some: { categoryId: "n1" } } }],
    });
    const narrow = await prisma.product.findMany({
      where: { ...LIVE_PRODUCT_WHERE, ...narrowWhere },
      orderBy: { name: "asc" },
      select: { id: true, category: { select: { slug: true } } },
    });
    // The extra product keeps reporting its PRIMARY category.
    expect(narrow).toEqual([
      { id: "n0-a", category: { slug: "n-0" } },
      { id: "x-narrow", category: { slug: "other" } },
    ]);
  });

  it("categories.list's counts agree with what each page lists", async () => {
    const [cats, links] = await Promise.all([
      prisma.category.findMany({ include: { _count: { select: { products: { where: LIVE_PRODUCT_WHERE } } } } }),
      findCategoryLinks("test", LIVE_PRODUCT_WHERE),
    ]);
    expect(links.some((link) => link.productId === "x-gone")).toBe(false);
    expect(links.some((link) => link.productId === "x-draft")).toBe(false);
    const { direct, withDescendants } = categoryCountsWithLinks(
      cats,
      new Map(cats.map((c) => [c.id, c._count.products])),
      links,
    );
    expect(withDescendants.get("root")).toBe((await expected("root")).length);
    expect(withDescendants.get("narrow")).toBe(2);
    expect(direct.get("w1")).toBe(3); // p-w1, x-1, x-0
    expect(direct.get("w3")).toBe(3); // p-w3, x-3, p-w2
    expect(direct.get("w5")).toBe(2); // x-gone is deleted
    expect(direct.get("w6")).toBe(2); // x-draft is a draft
    expect(direct.get("other")).toBe(LINKED + 1);
  });

  it("the owner's counts keep the draft, and still leave the deleted product out", async () => {
    const links = await findCategoryLinks("test", { deletedAt: null });
    expect(links.some((link) => link.productId === "x-draft")).toBe(true);
    expect(links.some((link) => link.productId === "x-gone")).toBe(false);
    // `null`: every row, as /admin/kategorier has always counted.
    const all = await findCategoryLinks("test", null);
    expect(all.some((link) => link.productId === "x-gone")).toBe(true);
  });
});
