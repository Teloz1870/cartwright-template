import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import { decide } from "@/lib/woo/decide";
import { WOO_SOURCE, type MappedProduct } from "@/lib/woo/map-catalog";
import { readFullView, type WooReadDialect } from "@/lib/woo/read-view";

/**
 * W21-live-2a-2a — `readFullView` (lib/woo/read-view.ts) on a real libSQL file
 * built from the migration baseline, with a second PrismaClient on the same file
 * as the writer it must not tear. The clients' statements do not interleave by
 * themselves, so the writer is put between two of the read's statements by a
 * query hook on the reading client: the code under test has no seam for it.
 *
 * A file answers in two ways, and both are measured. In WAL mode, the mode a
 * libSQL server runs in, the write lands in the middle and the read keeps its
 * snapshot. In the journal mode a local file has by default, the write is refused
 * BUSY. Only what cannot be measured here is faked: Postgres has no server in CI,
 * so its statement order is read off a fake transaction (spec 2026-10-25, §6).
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const INIT = join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite = existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const DELETED_AT = new Date("2026-10-01T10:00:00.000Z");

let dir = "";
let file = "";
let url = "";
let prisma: PrismaClient;
let other: PrismaClient;
let statements: string[] = [];

function openClients(): void {
  const logged = new PrismaClient({ adapter: new PrismaLibSql({ url }), log: [{ emit: "event", level: "query" }] });
  statements = [];
  logged.$on("query", (event) => statements.push(event.query));
  prisma = logged as unknown as PrismaClient;
  other = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
}

/** A catalogue with ours, a hand-made row and a CSV row in both tables, and a soft-deleted product of ours. */
async function seedShop(): Promise<void> {
  const category = (id: string, data: { slug: string; name: string; source?: string; externalId?: string; permalink?: string; description?: string; parentId?: string }) => other.category.create({ data: { id, ...data } });
  await category("c-lamps", { source: WOO_SOURCE, externalId: "10", slug: "lamps", name: "Lamps", permalink: "/lamps/", description: "All lamps." });
  await category("c-table", { source: WOO_SOURCE, externalId: "11", slug: "table-lamps", name: "Table lamps", permalink: "/lamps/table-lamps/", parentId: "c-lamps" });
  await category("c-hand", { slug: "hand-made", name: "Hand made", permalink: "/hand-made/", parentId: "c-lamps" });
  await category("c-csv", { source: "csv", externalId: "11", slug: "csv-lamps", name: "CSV lamps" });
  await category("c-woo-no-id", { source: WOO_SOURCE, slug: "no-id", name: "No id" });
  await category("c-id-no-source", { externalId: "13", slug: "no-source", name: "No source" });
  const row = { description: "", priceDkk: 100, images: "[]", categoryId: "c-hand" };
  await other.product.create({
    data: {
      id: "p-ida", source: WOO_SOURCE, externalId: "101", slug: "ida", name: "Ida", permalink: "/lamps/table-lamps/ida/", sku: "IDA-1", priceDkk: 79900, stock: 7,
      description: "A lamp.", answerSummary: "Short.", attributes: { tags: ["new"] }, images: "[]", categoryId: "c-table",
      extraCategories: { create: [{ categoryId: "c-hand" }, { categoryId: "c-lamps" }] },
    },
  });
  await other.product.create({ data: { ...row, id: "p-hand", slug: "hand-lamp", name: "Hand lamp", permalink: "/hand-lamp/", sku: "HAND-1" } });
  await other.product.create({ data: { ...row, id: "p-csv", source: "csv", externalId: "101", slug: "csv-lamp", name: "CSV lamp" } });
  await other.product.create({ data: { ...row, id: "p-woo-no-id", source: WOO_SOURCE, slug: "no-id-lamp", name: "No id" } });
  await other.product.create({ data: { ...row, id: "p-id-no-source", externalId: "103", slug: "no-source-lamp", name: "No source" } });
  await other.product.create({ data: { ...row, id: "p-gone", source: WOO_SOURCE, externalId: "102", slug: "gone", name: "Gone", permalink: "/gone/", sku: "GONE-1", deletedAt: DELETED_AT } });
}

beforeEach(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-woo-read-view-"));
  file = join(dir, "shop.db");
  url = `file:${file}`;
  const raw = createClient({ url });
  await raw.executeMultiple(readFileSync(INIT, "utf8"));
  raw.close();
  openClients();
});

afterEach(async () => {
  await prisma?.$disconnect();
  await other?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!sqlite)("readFullView — the view holds the rows", () => {
  beforeEach(seedShop);

  it("a row of ours carries its keys, its parent and its owned fields as map-catalog maps them, and nothing else", async () => {
    const view = await readFullView(prisma, "sqlite");
    expect(view.own("category", "10")).toEqual({
      kind: "category", id: "c-lamps", source: WOO_SOURCE, externalId: "10", slug: "lamps", permalink: "/lamps/", parentId: null,
      owned: { externalId: "10", slug: "lamps", name: "Lamps", permalink: "/lamps/", parentExternalId: null, description: "All lamps." },
    });
    expect(view.own("category", "11")).toEqual({
      kind: "category", id: "c-table", source: WOO_SOURCE, externalId: "11", slug: "table-lamps", permalink: "/lamps/table-lamps/", parentId: "c-lamps",
      owned: { externalId: "11", slug: "table-lamps", name: "Table lamps", permalink: "/lamps/table-lamps/", parentExternalId: "10", description: null },
    });
    expect(view.own("product", "101")).toEqual({
      kind: "product", id: "p-ida", source: WOO_SOURCE, externalId: "101", slug: "ida", permalink: "/lamps/table-lamps/ida/", sku: "IDA-1", deletedAt: null,
      owned: {
        externalId: "101", slug: "ida", name: "Ida", permalink: "/lamps/table-lamps/ida/", sku: "IDA-1", priceDkk: 79900, categoryExternalId: "11",
        extraCategoryExternalIds: ["10", "local:c-hand"], description: "A lamp.", answerSummary: "Short.", attributes: { tags: ["new"] },
      },
    });
  });

  it("the tree a decision walks is the rows': a move that closes a loop is seen, and the same move elsewhere is not one", async () => {
    const view = await readFullView(prisma, "sqlite");
    expect(view.resolveCategory("10")).toBe("c-lamps");
    expect(view.resolveCategory("11")).toBe("c-table");
    expect(view.loops("c-lamps", "c-table")).toBe(true);
    expect(view.loops("c-lamps", "c-hand")).toBe(true);
    expect(view.loops("c-table", "c-lamps")).toBe(false);
    expect(view.loops("c-table", "c-hand")).toBe(false);
  });

  it("a row is ours only by source and id: the same id under another source, an id with no source and our source with no id are not", async () => {
    const view = await readFullView(prisma, "sqlite");
    expect(view.own("category", "11")?.id).toBe("c-table");
    expect(view.own("product", "101")?.id).toBe("p-ida");
    expect(view.own("category", "13")).toBeUndefined();
    expect(view.resolveCategory("13")).toBeNull();
    expect(view.own("product", "103")).toBeUndefined();
    for (const [kind, slug, id, source, externalId] of [
      ["category", "csv-lamps", "c-csv", "csv", "11"],
      ["category", "no-id", "c-woo-no-id", WOO_SOURCE, null],
      ["category", "no-source", "c-id-no-source", null, "13"],
      ["category", "hand-made", "c-hand", null, null],
      ["product", "csv-lamp", "p-csv", "csv", "101"],
      ["product", "no-id-lamp", "p-woo-no-id", WOO_SOURCE, null],
      ["product", "no-source-lamp", "p-id-no-source", null, "103"],
      ["product", "hand-lamp", "p-hand", null, null],
    ] as const) {
      const held = view.holder(kind, { slug, permalink: null });
      expect(held?.by).toMatchObject({ id, source, externalId, kind });
      expect(held?.by.owned, slug).toBeUndefined();
    }
  });

  it("a foreign row still holds its keys: a slug and sku in its table, a permalink in either", async () => {
    const view = await readFullView(prisma, "sqlite");
    const fresh = { slug: "fresh", permalink: null };
    expect(view.holder("product", { ...fresh, slug: "csv-lamp" })).toMatchObject({ by: { id: "p-csv", kind: "product" }, label: 'slug "csv-lamp"' });
    expect(view.holder("product", { ...fresh, sku: "HAND-1" })).toMatchObject({ by: { id: "p-hand", kind: "product" }, label: 'sku "HAND-1"' });
    expect(view.holder("product", { ...fresh, permalink: "/hand-made/" })).toMatchObject({ by: { id: "c-hand", kind: "category" } });
    expect(view.holder("category", { ...fresh, permalink: "/hand-lamp/" })).toMatchObject({ by: { id: "p-hand", kind: "product" } });
    expect(view.holder("category", { ...fresh, slug: "csv-lamp" })).toBeNull();
  });

  it("a soft-deleted row of ours is in the view, says so, and holds its keys: decide() skips it, and another row cannot take them", async () => {
    const view = await readFullView(prisma, "sqlite");
    expect(view.own("product", "102")).toMatchObject({ id: "p-gone", deletedAt: DELETED_AT });
    expect(view.holder("product", { slug: "gone", permalink: null })?.by.id).toBe("p-gone");
    expect(view.holder("product", { slug: "fresh", permalink: null, sku: "GONE-1" })?.by.id).toBe("p-gone");
    expect(view.holder("category", { slug: "fresh", permalink: "/gone/" })?.by.id).toBe("p-gone");
    const row: MappedProduct = {
      externalId: "102", slug: "gone", name: "Back", permalink: "/gone/", sku: "GONE-1", priceDkk: 100, categoryExternalId: "10", extraCategoryExternalIds: [], description: "", answerSummary: null, attributes: {},
    };
    expect(decide({ kind: "product", row, type: "simple" }, view, undefined, null)).toMatchObject({ action: "skip", reason: expect.stringMatching(/^deletedHere:/) });
  });

  it("a link to a hand-made category names no Woo id, so a row filed under one reads as filed here", async () => {
    await other.category.update({ where: { id: "c-table" }, data: { parentId: "c-hand" } });
    await other.product.update({ where: { id: "p-ida" }, data: { categoryId: "c-hand" } });
    const view = await readFullView(prisma, "sqlite");
    expect(view.own("category", "11")?.owned).toMatchObject({ parentExternalId: "local:c-hand" });
    expect(view.own("product", "101")?.owned).toMatchObject({ categoryExternalId: "local:c-hand" });
  });
});

describe.skipIf(!sqlite)("readFullView — reads, and only reads", () => {
  /** The database's bytes: a read that wrote anything, even a no-op, moves the file's change counter. */
  const bytes = () => readFileSync(file).toString("base64");

  it("an empty catalogue is an empty view", async () => {
    const view = await readFullView(prisma, "sqlite");
    expect(view.own("category", "10")).toBeUndefined();
    expect(view.own("product", "101")).toBeUndefined();
    expect(view.holder("product", { slug: "x", permalink: "/x/", sku: "X" })).toBeNull();
  });

  it("sends three SELECTs however many rows there are, and leaves the file as it was", async () => {
    await seedShop();
    const reads = () => statements.filter((sql) => !sql.includes("COMMIT"));
    const before = bytes();
    await readFullView(prisma, "sqlite");
    expect(reads()).toEqual([
      expect.stringMatching(/^SELECT .*FROM `main`\.`Category`/),
      expect.stringMatching(/^SELECT .*FROM `main`\.`Product`/),
      expect.stringMatching(/^SELECT .*FROM `main`\.`ProductCategory`/),
    ]);
    expect(bytes()).toBe(before);

    for (let n = 0; n < 120; n++) {
      await other.category.create({ data: { id: `bulk-c-${n}`, slug: `bulk-c-${n}`, name: "Bulk", parentId: "c-lamps" } });
      await other.product.create({ data: { id: `bulk-p-${n}`, source: WOO_SOURCE, externalId: `${1000 + n}`, slug: `bulk-p-${n}`, name: "Bulk", description: "", priceDkk: 1, images: "[]", categoryId: "c-lamps", extraCategories: { create: [{ categoryId: "c-hand" }, { categoryId: `bulk-c-${n}` }] } } });
    }
    statements.length = 0;
    const big = await readFullView(prisma, "sqlite");
    expect(reads()).toHaveLength(3);
    // And no read stopped short: every row of each table is in the view, whatever order it read them in.
    for (let n = 0; n < 120; n++) {
      expect(big.holder("category", { slug: `bulk-c-${n}`, permalink: null })?.by.id).toBe(`bulk-c-${n}`);
      expect(big.own("product", `${1000 + n}`)?.owned).toMatchObject({ extraCategoryExternalIds: [`local:bulk-c-${n}`, "local:c-hand"] });
    }
  });

  it("told postgres on libSQL, the read is refused: the isolation level reaches the database, and no view comes back", async () => {
    await seedShop();
    await expect(readFullView(prisma, "postgres")).rejects.toThrow(/REPEATABLE READ/);
  });
});

/** The other client's write: a new category, a rename, a move and a new link, so a read torn at any statement shows. */
function lateWrite(): Promise<void> {
  return other.$transaction(async (tx) => {
    await tx.category.create({ data: { id: "c-late", source: WOO_SOURCE, externalId: "12", slug: "late", name: "Late" } });
    await tx.category.update({ where: { id: "c-table" }, data: { name: "Renamed", parentId: "c-late" } });
    await tx.product.update({ where: { id: "p-ida" }, data: { name: "Renamed", categoryId: "c-late", extraCategories: { create: { categoryId: "c-late" } } } });
  });
}

/** The reading client, with `write` run once right after its read of `model`: between two of the read's statements. */
function interrupted(model: "Category" | "Product", write: () => Promise<unknown>) {
  let ran = 0;
  const db = prisma.$extends({
    query: {
      $allModels: {
        async findMany({ model: read, args, query }) {
          const rows = await query(args);
          if (read === model && ran++ === 0) await write();
          return rows;
        },
      },
    },
  }) as unknown as PrismaClient;
  return { db, runs: () => ran };
}

describe.skipIf(!sqlite).each(["Category", "Product"] as const)("readFullView — one point in time, a second client writing after the read of %s", (model) => {
  describe("in WAL mode", () => {
    beforeEach(async () => {
      const raw = createClient({ url });
      await raw.execute("PRAGMA journal_mode=WAL");
      raw.close();
      await seedShop();
    });

    it("the write lands, and the view does not show it; the next read does", async () => {
      const before = await readFullView(prisma, "sqlite");
      let landed = false;
      const { db, runs } = interrupted(model, async () => {
        await lateWrite();
        landed = true;
      });
      const view = await readFullView(db, "sqlite");
      expect(runs()).toBe(1);
      expect(landed).toBe(true);
      expect(view).toEqual(before);
      expect(view.own("category", "12")).toBeUndefined();

      const next = await readFullView(prisma, "sqlite");
      expect(next).not.toEqual(before);
      expect(next.own("category", "12")?.id).toBe("c-late");
      expect(next.own("category", "11")).toMatchObject({ parentId: "c-late", owned: { name: "Renamed", parentExternalId: "12" } });
      expect(next.own("product", "101")?.owned).toMatchObject({ name: "Renamed", categoryExternalId: "12", extraCategoryExternalIds: ["10", "12", "local:c-hand"] });
    });
  });

  describe("in the journal mode a local file has by default", () => {
    beforeEach(seedShop);

    it("the write is refused BUSY while the read holds, and the view is whole", async () => {
      const before = await readFullView(prisma, "sqlite");
      let refusal: unknown;
      const { db, runs } = interrupted(model, () => lateWrite().catch((error: unknown) => (refusal = error)));
      const view = await readFullView(db, "sqlite");
      expect(runs()).toBe(1);
      expect(String(refusal)).toMatch(/SQLITE_BUSY/);
      expect(view).toEqual(before);
      // Nothing reads this file again: a COMMIT refused BUSY stays open on a connection nobody can reach, and holds its lock (measured, @libsql/client 0.17.4).
    });
  });
});

describe("readFullView — the statements, on a fake transaction (Postgres has no server in CI)", () => {
  type Rows = { categories?: unknown[]; products?: unknown[]; extras?: unknown[] };

  /** Only `$transaction` on the client and only these reads on the transaction: a read outside it, a write or a raw statement throws. */
  function fakeDb({ categories = [], products = [], extras = [] }: Rows = {}, failing?: string) {
    const log: string[] = [];
    const options: unknown[] = [];
    const reads = (name: string, rows: unknown[]) => ({
      findMany: async () => {
        log.push(`${name}.findMany`);
        if (name === failing) throw new Error("the connection went away");
        return rows;
      },
    });
    const tx = { category: reads("category", categories), product: reads("product", products), productCategory: reads("productCategory", extras) };
    const db = {
      $transaction: async (read: (client: typeof tx) => Promise<unknown>, opts: { isolationLevel: string }) => {
        options.push(opts);
        log.push(`begin ${opts.isolationLevel}`);
        const answer = await read(tx);
        log.push("commit");
        return answer;
      },
    } as unknown as PrismaClient;
    return { db, log, options };
  }

  it.each<[WooReadDialect, string]>([["postgres", "RepeatableRead"], ["sqlite", "Serializable"]])("%s: %s from the first statement, every read inside, and bounded", async (dialect, level) => {
    const { db, log, options } = fakeDb();
    await readFullView(db, dialect);
    expect(log).toEqual([`begin ${level}`, "category.findMany", "product.findMany", "productCategory.findMany", "commit"]);
    expect(options).toEqual([{ isolationLevel: level, maxWait: 5_000, timeout: 60_000 }]);
  });

  it("a read that fails is the read's failure, never a shorter view", async () => {
    for (const model of ["category", "product", "productCategory"]) {
      const { db, log } = fakeDb({}, model);
      await expect(readFullView(db, "postgres")).rejects.toThrow("the connection went away");
      expect(log).not.toContain("commit");
    }
  });

  const stored = { source: WOO_SOURCE, slug: "s", name: "n", permalink: null };
  const productRow = { sku: null, priceDkk: 1, description: "", answerSummary: null, attributes: null, deletedAt: null };

  it("links come out of the rows it read, with no read of their own", async () => {
    const { db } = fakeDb({
      categories: [
        { ...stored, id: "c-parent", externalId: "1", slug: "parent", description: null, parentId: null },
        { ...stored, id: "c-child", externalId: "2", slug: "child", description: null, parentId: "c-parent" },
      ],
      products: [{ ...stored, ...productRow, id: "p", externalId: "5", categoryId: "c-child" }],
      extras: [{ productId: "p", categoryId: "c-parent" }, { productId: "someone-else", categoryId: "c-child" }],
    });
    const view = await readFullView(db, "postgres");
    expect(view.own("category", "2")?.owned).toMatchObject({ parentExternalId: "1" });
    expect(view.loops("c-parent", "c-child")).toBe(true);
    expect(view.own("product", "5")?.owned).toMatchObject({ categoryExternalId: "2", extraCategoryExternalIds: ["1"] });
  });

  it("a link past the rows it read, which only an unenforced foreign key can leave, names no Woo id and is no root: one row is odd, and the read goes on", async () => {
    const { db } = fakeDb({
      categories: [{ ...stored, id: "c", externalId: "1", description: null, parentId: "gone" }],
      products: [{ ...stored, ...productRow, slug: "p", id: "p", externalId: "5", categoryId: "gone" }],
      extras: [{ productId: "p", categoryId: "gone-too" }],
    });
    const view = await readFullView(db, "postgres");
    expect(view.own("category", "1")?.owned).toMatchObject({ parentExternalId: "local:gone" });
    expect(view.own("category", "1")?.parentId).toBe("gone");
    expect(view.own("product", "5")?.owned).toMatchObject({ categoryExternalId: "local:gone", extraCategoryExternalIds: ["local:gone-too"] });
    expect(view.loops("c", null)).toBe(false);
  });
});
