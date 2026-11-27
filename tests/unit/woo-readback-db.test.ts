import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { decide, type WooSrc, type WooWrite } from "@/lib/woo/decide";
import { groupFp, groupNames, type GroupName, type WooBaseEntry } from "@/lib/woo/groups";
import { WOO_SOURCE, htmlDecoder, mapWooCatalog, type HtmlDecode, type MappedCategory, type MappedProduct } from "@/lib/woo/map-catalog";
import { readFullView } from "@/lib/woo/read-view";
import type { WooSnapshot, WooStock } from "@/lib/woo/types";
import { WooView, ownedCategory, ownedProduct, type ViewRow } from "@/lib/woo/view";
import { wooSnapshot } from "./woo-fixture-shop";

/**
 * W21-live-2a-1 — the row decide() intends, the payload it hands a write and
 * the projection of that row read back must fingerprint alike, or the write
 * time postcondition (W21-live-2 spec §3F, S5) fails on a row nothing is wrong
 * with. This runs that comparison on real columns: the schema the migration
 * baseline creates, through the real Prisma client over libSQL, so a NULL, an
 * empty string and a JSON value are the database's own. `write` below is the
 * least that puts a payload into those columns, not the importer's writer
 * (W21-live-2a-4 and 2a-5); what a later run compares it with is what
 * `readFullView` reads.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite = existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const LINK = { select: { id: true, source: true, externalId: true } } as const;
const STORED_CATEGORY = { id: true, source: true, externalId: true, slug: true, name: true, permalink: true, description: true, parentId: true, parent: LINK } as const;
const STORED_PRODUCT = {
  id: true, source: true, externalId: true, slug: true, name: true, permalink: true, sku: true, priceDkk: true, description: true, answerSummary: true, attributes: true,
  deletedAt: true, category: LINK, extraCategories: { select: { category: LINK } },
} as const;

let decode: HtmlDecode;
let dir = "";
let prisma: PrismaClient;

beforeAll(async () => {
  decode = await htmlDecoder();
});
beforeEach(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-woo-readback-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"));
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
});
afterEach(async () => {
  await prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** A row a write read back: its keys and its owned fields, as the write-time postcondition will compare them. */
function categoryRow(row: Prisma.CategoryGetPayload<{ select: typeof STORED_CATEGORY }>): ViewRow {
  const { id, source, externalId, slug, permalink, parentId } = row;
  return { kind: "category", id, source, externalId, slug, permalink, parentId, owned: ownedCategory(row) };
}
function productRow(row: Prisma.ProductGetPayload<{ select: typeof STORED_PRODUCT }>): ViewRow {
  const { id, source, externalId, slug, permalink, sku, deletedAt } = row;
  return { kind: "product", id, source, externalId, slug, permalink, sku, deletedAt, owned: ownedProduct(row) };
}

/** A payload into the columns, and the row read back in the same statement. */
async function write(w: WooWrite): Promise<ViewRow> {
  if (w.kind === "category") {
    const row = w.op === "create" ? await prisma.category.create({ data: w.payload, select: STORED_CATEGORY }) : await prisma.category.update({ where: { id: w.id }, data: w.payload, select: STORED_CATEGORY });
    return categoryRow(row);
  }
  if (w.op === "create") {
    const { extraCategoryIds, ...fields } = w.payload;
    return productRow(await prisma.product.create({ data: { ...fields, images: "[]", extraCategories: { create: extraCategoryIds.map((categoryId) => ({ categoryId })) } }, select: STORED_PRODUCT }));
  }
  const { core, price } = w.payload;
  const links = core && { deleteMany: {}, create: core.extraCategoryIds.map((categoryId) => ({ categoryId })) };
  const fields = core && { slug: core.slug, name: core.name, permalink: core.permalink, sku: core.sku, description: core.description, answerSummary: core.answerSummary, attributes: core.attributes, categoryId: core.categoryId };
  return productRow(await prisma.product.update({ where: { id: w.id }, data: { ...fields, ...price, ...(links && { extraCategories: links }) }, select: STORED_PRODUCT }));
}

/** Every simple product the snapshot sends and every category, parents first: what decide() is fed, in the order a run feeds it. */
function sourcesOf(snap: WooSnapshot): WooSrc[] {
  const { categories, products } = mapWooCatalog(snap, decode);
  const types = new Map(snap.products.map((p) => [String(p.id), p.type]));
  return [
    ...categories.map((row): WooSrc => ({ kind: "category", row })),
    ...products.filter((p) => types.get(p.externalId) === "simple").map((row): WooSrc => ({ kind: "product", row, type: "simple" })),
  ];
}

/** The fixture shop plus product 104, which leaves empty every text it may leave empty: the fields an empty value could break. */
function shop(): WooSnapshot {
  const snap = wooSnapshot();
  snap.products.push({
    ...structuredClone(snap.products[0]), id: 104, slug: "bar-lampe", sku: " ", permalink: "https://shop.example.test/lamper/bordlamper/bar-lampe/",
    description: "", short_description: "", tags: [], attributes: [], categories: [{ id: 11, slug: "bordlamper" }],
  });
  return snap;
}
const STOCK: ReadonlyMap<string, WooStock> = new Map(["101", "104"].map((id) => [id, { id: Number(id), manage_stock: true, stock_quantity: 5, stock_status: "instock" }]));

/** The row as intended and as read back fingerprint alike, group by group, and as the source's row did. */
function expectIntended(src: WooSrc, stored: ViewRow, groups: GroupName[], intended: MappedCategory | MappedProduct): void {
  expect(stored.owned, `${src.kind} ${src.row.externalId}`).toBeDefined();
  if (!stored.owned) return;
  expect(groups.length).toBeGreaterThan(0);
  for (const g of groups) {
    const what = `${src.kind} ${src.row.externalId} ${g}`;
    expect(groupFp(src.kind, g, stored.owned), what).toBe(groupFp(src.kind, g, intended));
    expect(groupFp(src.kind, g, stored.owned), what).toBe(groupFp(src.kind, g, src.row));
  }
}

/** Runs a whole create over an empty database, as a run would: each row decided over what the rows before it wrote. Returns the baseline it leaves. */
async function importShop(snap: WooSnapshot): Promise<Map<string, WooBaseEntry>> {
  const view = new WooView({ categories: [], products: [] });
  const baseline = new Map<string, WooBaseEntry>();
  for (const src of sourcesOf(snap)) {
    const d = decide(src, view, undefined, STOCK);
    if (!d.write?.after.owned) throw new Error(`${src.kind} ${src.row.externalId}: ${d.action} ${d.reason ?? ""}`);
    const stored = await write(d.write);
    expectIntended(src, stored, d.write.groups, d.write.after.owned);
    view.record(undefined, stored);
    const fp = (g: GroupName) => groupFp(src.kind, g, src.row);
    baseline.set(`${src.kind}:${src.row.externalId}`, { rowId: stored.id, groups: Object.fromEntries(groupNames(src.kind).map((g) => [g, { saw: fp(g), wrote: fp(g) }])) });
  }
  return baseline;
}

/** The verdict on every row of `snap`, over the database as it stands now. */
async function verdicts(snap: WooSnapshot, baseline: ReadonlyMap<string, WooBaseEntry>) {
  const view = await readFullView(prisma, "sqlite");
  return sourcesOf(snap).map((src) => ({ src, d: decide(src, view, baseline.get(`${src.kind}:${src.row.externalId}`), STOCK) }));
}

describe.skipIf(!sqlite)("a row as mapped, as written and as read back, on real columns (spec §3F S5)", () => {
  it("a create, with every empty value there is, reads back as intended, and a category with no description is NULL in the column", async () => {
    await importShop(shop());
    const columns = await prisma.category.findMany({ select: { externalId: true, description: true }, orderBy: { externalId: "asc" } });
    expect(columns).toEqual([
      { externalId: "10", description: "Alle lamper." },
      { externalId: "11", description: null },
      { externalId: "12", description: null },
      { externalId: "20", description: null },
    ]);
    const bare = await prisma.product.findFirstOrThrow({ where: { source: WOO_SOURCE, externalId: "104" }, select: { description: true, answerSummary: true, sku: true, attributes: true } });
    expect(bare).toEqual({ description: "", answerSummary: null, sku: null, attributes: {} });
  });

  it("a re-run over what was written is unchanged, with nothing left to record (INV-22)", async () => {
    const snap = shop();
    const baseline = await importShop(snap);
    const rows = await verdicts(snap, baseline);
    expect(rows).toHaveLength(4 + 2);
    for (const { src, d } of rows) expect([src.row.externalId, d.action, d.refresh, d.write]).toEqual([src.row.externalId, "unchanged", [], undefined]);
  });

  it("a summary cut where an emoji straddles the limit reads back as intended, and a re-run is unchanged", async () => {
    const snap = shop();
    snap.products[0].short_description = `${"a".repeat(499)}😀 more`;
    const baseline = await importShop(snap);
    expect(await prisma.product.findFirstOrThrow({ where: { externalId: "101" }, select: { answerSummary: true } })).toEqual({ answerSummary: "a".repeat(499) });
    for (const { src, d } of await verdicts(snap, baseline)) expect([src.row.externalId, d.action, d.refresh, d.write]).toEqual([src.row.externalId, "unchanged", [], undefined]);
  });

  it.each([["a lone high surrogate", "\ud83d"], ["a lone low surrogate", "\ude00"], ["a NUL", "\0"]])("%s, wherever Woo sends text, reads back as intended with nothing cut, and a re-run is unchanged", async (_, bad) => {
    const sent = `a${bad}b`;
    const clean = "a\uFFFDb";
    const snap = shop();
    Object.assign(snap.products[0], {
      name: sent, description: sent, short_description: sent, sku: sent, permalink: `/lamper/bordlamper/${sent}/`,
      tags: [{ id: 41, slug: "nyhed", name: sent }], attributes: [{ id: 7, name: "Materiale", terms: [{ id: 1, slug: "messing", name: sent }] }],
    });
    Object.assign(snap.categories[0], { name: sent, description: sent, permalink: `/lamper-${sent}/` });
    const baseline = await importShop(snap);
    expect(await prisma.product.findFirstOrThrow({ where: { externalId: "101" }, select: { name: true, description: true, answerSummary: true, sku: true, permalink: true, attributes: true } })).toEqual({
      name: clean, description: clean, answerSummary: clean, sku: clean, permalink: `/lamper/bordlamper/${clean}/`, attributes: { tags: [clean], materiale: [clean] },
    });
    expect(await prisma.category.findFirstOrThrow({ where: { externalId: "10" }, select: { name: true, description: true, permalink: true } })).toEqual({ name: clean, description: clean, permalink: `/lamper-${clean}/` });
    for (const { src, d } of await verdicts(snap, baseline)) expect([src.row.externalId, d.action, d.refresh, d.write]).toEqual([src.row.externalId, "unchanged", [], undefined]);
  });

  it("secondary categories, in whatever order Woo lists them, read back as intended, and a re-run in another order is unchanged", async () => {
    const snap = shop();
    snap.products[0].categories = [20, 12, 11, 10].map((id) => ({ id, slug: `c-${id}` }));
    const baseline = await importShop(snap);
    const stored = await prisma.product.findFirstOrThrow({ where: { externalId: "101" }, select: { category: { select: { externalId: true } }, extraCategories: { select: { category: { select: { externalId: true } } } } } });
    expect([stored.category.externalId, stored.extraCategories.map((l) => l.category.externalId).sort()]).toEqual(["11", ["10", "12", "20"]]);
    for (const { src, d } of await verdicts(snap, baseline)) expect([src.row.externalId, d.action, d.refresh, d.write]).toEqual([src.row.externalId, "unchanged", [], undefined]);
    snap.products[0].categories.reverse();
    for (const { src, d } of await verdicts(snap, baseline)) expect([src.row.externalId, d.action, d.refresh, d.write]).toEqual([src.row.externalId, "unchanged", [], undefined]);
  });

  it("an update that empties what the source no longer sends reads back as intended, and lands as NULL", async () => {
    const before = shop();
    const baseline = await importShop(before);
    const after = structuredClone(before);
    after.categories[0].description = "";
    Object.assign(after.products[0], { name: "Table lamp Ida (new)", description: "", short_description: "", sku: "", tags: [], attributes: [] });
    after.products[0].prices.price = "69900";
    const rows = (await verdicts(after, baseline)).filter(({ d }) => d.action !== "unchanged");
    expect(rows.map(({ src, d }) => [src.kind, src.row.externalId, d.action])).toEqual([["category", "10", "update"], ["product", "101", "update"]]);
    for (const { src, d } of rows) {
      if (!d.write?.after.owned) throw new Error("no write");
      expectIntended(src, await write(d.write), d.write.groups, d.write.after.owned);
    }
    expect(await prisma.category.findFirstOrThrow({ where: { externalId: "10" }, select: { description: true } })).toEqual({ description: null });
    expect(await prisma.product.findFirstOrThrow({ where: { externalId: "101" }, select: { answerSummary: true, sku: true, priceDkk: true, attributes: true } })).toEqual({ answerSummary: null, sku: null, priceDkk: 69900, attributes: {} });
    // …and with the new source as the baseline, the next run has nothing to do.
    const fresh = new Map(baseline);
    for (const { src, d } of rows) {
      const fp = (g: GroupName) => groupFp(src.kind, g, src.row);
      fresh.set(`${src.kind}:${src.row.externalId}`, { rowId: d.dbId ?? "", groups: Object.fromEntries(groupNames(src.kind).map((g) => [g, { saw: fp(g), wrote: fp(g) }])) });
    }
    for (const { d } of await verdicts(after, fresh)) expect(d.action).toBe("unchanged");
  });

  it("a core update to a product Woo sends no price for keeps the price in the column", async () => {
    const before = shop();
    const baseline = await importShop(before);
    const after = structuredClone(before);
    after.products[0].name = "Table lamp Ida (new)";
    after.products[0].prices.price = "";
    const [row] = (await verdicts(after, baseline)).filter(({ d }) => d.write);
    if (!row?.d.write?.after.owned) throw new Error("no write");
    expect(row.d.write.groups).toEqual(["core"]);
    expect(row.d.write.after.owned).toMatchObject({ priceDkk: 79900 });
    const stored = await write(row.d.write);
    expect(groupFp("product", "core", stored.owned as MappedProduct)).toBe(groupFp("product", "core", row.d.write.after.owned));
    expect(groupFp("product", "price", stored.owned as MappedProduct)).toBe(groupFp("product", "price", row.d.write.after.owned));
    expect(stored.owned).toMatchObject({ priceDkk: 79900 });
  });

  it("an empty string or a JSON null another save path stores reads as what the mapper writes: no local edit, nothing to write", async () => {
    const snap = shop();
    const baseline = await importShop(snap);
    await prisma.category.updateMany({ where: { externalId: "11" }, data: { description: "" } });
    await prisma.product.updateMany({ where: { externalId: "104" }, data: { answerSummary: "", attributes: Prisma.JsonNull } });
    for (const { src, d } of await verdicts(snap, baseline)) expect([src.row.externalId, d.action, d.write]).toEqual([src.row.externalId, "unchanged", undefined]);
    // A real edit still is one.
    await prisma.category.updateMany({ where: { externalId: "11" }, data: { description: "Written here" } });
    const edited = (await verdicts(snap, baseline)).find(({ src }) => src.kind === "category" && src.row.externalId === "11");
    expect(edited?.d).toMatchObject({ action: "skip", reason: expect.stringMatching(/^localEdit:/) });
  });
});
