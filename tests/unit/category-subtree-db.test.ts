import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import {
  CATEGORY_SUBTREE_SELECT,
  CATEGORY_TREE_SELECT,
  categoryProductsWhere,
  categorySlugWhere,
  categoryWithDescendantIds,
} from "@/lib/category-tree";

/**
 * WP2-TREE-READ-COST, against a real database: a category page whose subtree
 * is wider than one statement's bind budget still lists every product below
 * it. Prisma 7.10.1 on SQLite/libSQL refuses a statement with more than ~999
 * bind values (P2029) — a `categoryId: { in }` of 997 ids runs, 998 does not.
 * Prisma splits an over-long `in` into several statements only when the query
 * has no `orderBy`; the category page, the PLP and `products.search` all sort,
 * so the page's fail-soft `.catch` turned the refusal into an empty grid, the
 * PLP's into an empty list, and `products.search` threw. Past
 * `CATEGORY_IN_LIST_MAX` ids both helpers now hand the database the parent
 * chain instead (CATEGORY-IN-LIST-BIND-LIMIT for the slug filter, this slice
 * for the page); the pure tests count its bind values, this file runs it.
 *
 * The where is the one the helpers hand the page, the PLP and the agent tool,
 * run by the real Prisma client over libSQL on the schema the migration
 * baseline creates (CI's `pnpm db:verify` keeps that file equal to
 * prisma/schema.prisma). What it must return is computed separately, from the
 * rows, by the same id walk the narrow `in` shape uses — so the two shapes
 * are held to one answer, depth cap included.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres (docs/supabase-postgres.md) generates a client the
// libSQL adapter cannot drive; the SQLite bind limit is not its question.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const WIDTH = 1200; // > 997: one `in` list over the whole subtree is refused
const CHAIN = 12; // > CATEGORY_TREE_MAX_DEPTH below the root, so the cap shows

let dir = "";
let prisma: PrismaClient;

beforeAll(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-subtree-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

  // root ─┬─ w0 … w1199          (one product each; w7's is deleted)
  //       └─ d0 ─ d1 ─ … ─ d11   (d0 is level 1, so d9 is level 10 and d10 is past the cap)
  // other                        (beside the tree: never listed)
  const categories = [
    { id: "root", slug: "root", name: "Root", parentId: null },
    { id: "other", slug: "other", name: "Other", parentId: null },
    ...Array.from({ length: WIDTH }, (_, i) => ({ id: `w${i}`, slug: `w-${i}`, name: `W${i}`, parentId: "root" })),
    ...Array.from({ length: CHAIN }, (_, i) => ({
      id: `d${i}`,
      slug: `d-${i}`,
      name: `D${i}`,
      parentId: i === 0 ? "root" : `d${i - 1}`,
    })),
  ];
  await prisma.category.createMany({ data: categories });
  await prisma.product.createMany({
    data: categories.map((c, i) => ({
      id: `p-${c.id}`,
      slug: `p-${c.id}`,
      name: `P ${c.name}`,
      description: "",
      priceDkk: 1000,
      images: "[]",
      categoryId: c.id,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      deletedAt: c.id === "w7" ? new Date("2026-10-01") : null,
    })),
  });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** The live products the walk says a category's page lists, by product id. */
async function expected(rootId: string): Promise<string[]> {
  const tree = await prisma.category.findMany({ select: CATEGORY_SUBTREE_SELECT });
  const ids = new Set(categoryWithDescendantIds(tree, rootId));
  const live = await prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, categoryId: true } });
  return live.filter((p) => ids.has(p.categoryId)).map((p) => p.id).sort();
}

describe.skipIf(!sqlite)("a subtree wider than one statement's bind budget, on a real database", () => {
  it("the limit is real here: the whole subtree as one sorted `in` list is refused with P2029", async () => {
    const tree = await prisma.category.findMany({ select: CATEGORY_SUBTREE_SELECT });
    const ids = categoryWithDescendantIds(tree, "root");
    expect(ids.length).toBeGreaterThan(997);
    // If a Prisma upgrade lifts the limit this case goes red: the relation
    // shape stays correct, and this case (only) can go.
    await expect(
      prisma.product.findMany({ where: { categoryId: { in: ids }, deletedAt: null }, orderBy: { createdAt: "desc" } }),
    ).rejects.toMatchObject({ code: "P2029" });
  });

  it("the category page's query lists every live product below the root, and nothing else", async () => {
    const tree = await prisma.category.findMany({ select: CATEGORY_TREE_SELECT });
    // The page's own call: app/[locale]/category/[slug]/page.tsx.
    const products = await prisma.product.findMany({
      where: { ...categoryProductsWhere(tree, "root"), deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const got = products.map((p) => p.id).sort();
    expect(got).toEqual(await expected("root"));
    // root + 1200 wide − the deleted one + d0…d9 (levels 1–10).
    expect(got).toHaveLength(1 + WIDTH - 1 + 10);
    expect(got).toContain("p-d9");
    expect(got).not.toContain("p-d10");
    expect(got).not.toContain("p-w7");
    expect(got).not.toContain("p-other");
    // Newest first, as the page asks.
    expect(products[0].createdAt.getTime()).toBeGreaterThan(products.at(-1)!.createdAt.getTime());
  });

  it("the catalogue filter by slug (/produkter?kategori=, products.search) lists the same", async () => {
    const tree = await prisma.category.findMany({ select: CATEGORY_SUBTREE_SELECT });
    // Sorted, as both callers sort (the PLP by date or price, the tool by name).
    const products = await prisma.product.findMany({
      where: { deletedAt: null, ...categorySlugWhere(tree, "root") },
      orderBy: { name: "asc" },
      select: { id: true },
    });
    expect(products.map((p) => p.id).sort()).toEqual(await expected("root"));
  });

  it("a narrow subtree keeps its `in` list and lists what the walk says, depth cap included", async () => {
    const tree = await prisma.category.findMany({ select: CATEGORY_TREE_SELECT });
    const where = categoryProductsWhere(tree, "d0");
    expect(where).toHaveProperty("categoryId.in");
    const products = await prisma.product.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    // d0 is level 0 here, so d1…d10 are levels 1–10 and d11 is past the cap.
    expect(products.map((p) => p.id).sort()).toEqual(await expected("d0"));
    expect(products.map((p) => p.id)).toContain("p-d10");
    expect(products.map((p) => p.id)).not.toContain("p-d11");
  });
});
