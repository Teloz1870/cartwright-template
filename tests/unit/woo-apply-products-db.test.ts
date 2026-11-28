import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient, type Prisma } from "@/app/generated/prisma/client";
import { applyWooImport, auditedWooImport, type WooApplyDeps, type WooAuditWrap } from "@/lib/woo/apply";
import type { WooAuth } from "@/lib/woo/client";
import { formatReport } from "@/lib/woo/report";
import { parseWooImportArgs, previewWooImport, type WooImportReport } from "@/lib/woo/run-import";
import { BUILT_SHOP, builtTransport, type BuiltShop } from "./woo-shop-builder";
import type { RecordedCall } from "./woo-fixture-shop";

/**
 * W21-live-2a-5 — `--apply` writes the products (lib/woo/apply.ts, spec 2026-10-25 §3F,
 * §4's product rows) on a real libSQL file built from the init migration, a shop the
 * test writes itself (tests/unit/woo-shop-builder.ts) behind a fake transport, and a
 * second PrismaClient on the same file as the admin who edits between chunks.
 *
 * The shop: Lamper › Bordlamper › Messing, and Skærme. 201 Ida under Bordlamper, also
 * in Lamper; 202 Bo under Skærme; 203 Kim under Messing, also in Skærme.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const INIT = join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql");
const sqlite = existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const KEY: WooAuth = { user: "ck_test", pass: "cs_test" };
const APPLY = ["--apply", "--source-prices-include-vat", "yes"];
const BASE = (): BuiltShop => ({
  categories: [{ id: 10, slug: "lamper" }, { id: 11, slug: "bordlamper", parent: 10 }, { id: 12, slug: "messing", parent: 11 }, { id: 20, slug: "skaerme" }],
  products: [
    { id: 201, slug: "ida", sku: "IDA-1", cats: [11, 10], price: "79900", name: "Ida" },
    { id: 202, slug: "bo", sku: "BO-1", cats: [20], price: "45000", name: "Bo" },
    { id: 203, slug: "kim", cats: [12, 20], price: "10000", name: "Kim" },
  ],
});

let dir = "";
let prisma: PrismaClient;
let admin: PrismaClient;
let calls: RecordedCall[];
let shop: BuiltShop;

const deps = (more: Partial<WooApplyDeps> = {}): WooApplyDeps => ({
  db: prisma,
  dialect: "sqlite",
  policy: { currency: "DKK", pricesIncludeVat: true },
  client: { siteUrl: "https://new.example.test", auth: KEY, transport: builtTransport(() => shop, calls), assertHostPublic: async () => {}, sleep: async () => {} },
  ...more,
});
const apply = (more: Partial<WooApplyDeps> = {}, argv: readonly string[] = APPLY) => applyWooImport(parseWooImportArgs(argv), deps(more));
const outcomes = (r: WooImportReport, kind = "product") => r.apply?.rows.filter((row) => row.kind === kind).map((row) => `${row.externalId} ${row.outcome}${row.reason ? ` ${row.reason.split(":")[0]}` : ""}`);
type Entry = { rowId: string; groups: { core?: { saw: string | null; wrote: string }; price?: { saw: string | null; wrote: string } } };
const ledger = async () => ((await prisma.migrationProject.findFirstOrThrow()).settings as { wooImport: { lease: unknown; categories: Record<string, Entry>; products: Record<string, Entry> } }).wooImport;
const product = (ext: string) => prisma.product.findUnique({ where: { source_externalId: { source: "woocommerce", externalId: ext } }, include: { category: true, extraCategories: { include: { category: true } } } });
const category = (ext: string) => prisma.category.findUniqueOrThrow({ where: { source_externalId: { source: "woocommerce", externalId: ext } } });
const edit = (id: number, change: Partial<BuiltShop["products"][number]>) => (shop.products = shop.products.map((p) => (p.id === id ? { ...p, ...change } : p)));
/** Before chunk `at`: on a first run chunk 0 is the categories and 1 the products; once the categories agree, the products are chunk 0. */
const before = (at: number, fn: () => Promise<unknown>) => ({ beforeChunk: async (n: number) => void (n === at ? await fn() : undefined) });
const said = (r: WooImportReport, kind: "categories" | "products") => r.plan[kind].map((i) => `${i.externalId} ${i.action}${i.reason ? ` ${i.reason.split(":")[0]}` : ""}`);

describe.skipIf(!sqlite)("applyWooImport — the products, on a real file", () => {
  beforeEach(async () => {
    calls = [];
    shop = BASE();
    dir = mkdtempSync(join(tmpdir(), "cw-woo-products-"));
    const url = `file:${join(dir, "shop.db")}`;
    const raw = createClient({ url });
    await raw.executeMultiple(readFileSync(INIT, "utf8"));
    raw.close();
    prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
    admin = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
    await prisma.migrationProject.create({ data: { sourceUrl: BUILT_SHOP } });
  });
  afterEach(async () => {
    await prisma.$disconnect();
    await admin.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it("the first full apply writes the categories, then each product under its primary with its secondary links, Woo's count and policy, and a baseline per group as read back", async () => {
    const paths: string[] = [];
    const r = await apply({ revalidate: (p) => paths.push(p) });
    expect(outcomes(r, "category")).toEqual(["10 written", "20 written", "11 written", "12 written"]);
    expect(outcomes(r)).toEqual(["201 written", "202 written", "203 written"]);
    expect(r.apply).toMatchObject({ stopped: null, postconditions: { ok: true }, cache: "all" });
    const ida = await product("201");
    expect(ida).toMatchObject({ name: "Ida", sku: "IDA-1", priceDkk: 79900, stock: 5, stockPolicy: "tracked", status: "active", images: "[]", permalink: "/lamper/bordlamper/ida/" });
    expect(ida?.category.externalId).toBe("11");
    expect(ida?.extraCategories.map((l) => l.category.externalId)).toEqual(["10"]);
    expect((await product("203"))?.extraCategories.map((l) => l.category.externalId)).toEqual(["20"]);
    const { products, lease } = await ledger();
    expect(lease).toBeNull();
    expect(Object.keys(products).sort()).toEqual(["201", "202", "203"]);
    for (const [ext, entry] of Object.entries(products)) {
      expect(entry.rowId).toBe((await product(ext))?.id);
      expect(entry.groups.core?.saw).toBe(entry.groups.core?.wrote);
      expect(entry.groups.price?.saw).toBe(entry.groups.price?.wrote);
    }
    expect(paths).toEqual(expect.arrayContaining(["/product/ida", "/product/bo", "/product/kim", "/produkter", "/category/lamper"]));
    expect(formatReport(r).split("\n")[0]).toBe(`APPLY, categories, then products; the counts below are the preview it decided from · ${BUILT_SHOP} · scope all`);
  });

  it("a second apply is idempotent: no transaction, no write, no revalidate; a dry run on a fresh file plans what the apply wrote", async () => {
    const preview = await previewWooImport(parseWooImportArgs(APPLY.slice(1)), deps());
    const first = await apply();
    const planned = [...preview.plan.categories, ...preview.plan.products].filter((i) => i.action === "create" || i.action === "update").map((i) => i.externalId);
    expect(first.apply?.rows.filter((r) => r.outcome === "written").map((r) => r.externalId)).toEqual(planned);
    expect(first.plan).toEqual(preview.plan);
    const before = { rows: await prisma.product.findMany({ orderBy: { id: "asc" } }), links: await prisma.productCategory.findMany(), wooImport: { ...(await ledger()), lease: null } };
    let chunks = 0;
    const paths: string[] = [];
    const again = await apply({ revalidate: (p) => paths.push(p), hooks: { beforeChunk: async () => void chunks++ } });
    expect([again.apply?.rows, chunks, paths]).toEqual([[], 0, []]);
    expect({ rows: await prisma.product.findMany({ orderBy: { id: "asc" } }), links: await prisma.productCategory.findMany(), wooImport: await ledger() }).toEqual(before);
    expect((await previewWooImport(parseWooImportArgs(APPLY.slice(1)), deps())).plan.counts.products).toMatchObject({ unchanged: 3, create: 0, update: 0 });
  });

  it("stock survives a name-only update, and so does a policy set here", async () => {
    await apply();
    await prisma.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "201" } }, data: { stock: 2, stockPolicy: "untracked" } });
    edit(201, { name: "Ida II" });
    shop.stock = { 201: { stock_quantity: 40, backorders: "yes" } };
    const r = await apply();
    expect(outcomes(r)).toEqual(["201 written"]);
    expect(await product("201")).toMatchObject({ name: "Ida II", stock: 2, stockPolicy: "untracked", priceDkk: 79900 });
  });

  it("a core update keeps the price here when the source sends none", async () => {
    await apply();
    const price = (await ledger()).products["201"].groups.price;
    edit(201, { name: "Ida II", price: "" });
    const r = await apply();
    expect(r.plan.products.find((p) => p.externalId === "201")).toMatchObject({ action: "update", groups: ["core"] });
    expect(outcomes(r)).toEqual(["201 written"]);
    expect(await product("201")).toMatchObject({ name: "Ida II", priceDkk: 79900 });
    expect((await ledger()).products["201"].groups.price).toEqual(price);
  });

  it("a converged product with no baseline gets its baseline in a transaction that writes no product", async () => {
    await apply();
    const rows = await prisma.product.findMany({ orderBy: { id: "asc" } });
    const kept = await ledger();
    await prisma.migrationProject.updateMany({ data: { settings: { wooImport: { ...kept, products: {} } } as Prisma.InputJsonObject } });
    const r = await apply();
    expect(outcomes(r)).toEqual(["201 refreshed", "202 refreshed", "203 refreshed"]);
    expect(r.apply?.paths).toEqual([]);
    expect(await prisma.product.findMany({ orderBy: { id: "asc" } })).toEqual(rows);
    expect((await ledger()).products).toEqual(kept.products);
  });

  it("one value that is not whole units blocks its own row, and the rest of the chunk is written", async () => {
    shop.stock = { 202: { stock_quantity: 1.5 } };
    const r = await apply();
    expect(said(r, "products")).toEqual(["201 create", "202 blocked stockNotExact", "203 create"]);
    expect(outcomes(r)).toEqual(["201 written", "203 written"]);
    expect(await product("202")).toBeNull();
    expect(Object.keys((await ledger()).products).sort()).toEqual(["201", "203"]);
  });

  it("a counted backorder below zero is created as 0 with its policy and a warning; an uncounted product as Woo's status says", async () => {
    shop.stock = { 202: { stock_quantity: -3, backorders: "notify" }, 203: { manage_stock: false, stock_quantity: null, stock_status: "outofstock" } };
    const r = await apply();
    expect(outcomes(r)).toEqual(["201 written", "202 written", "203 written"]);
    expect(r.plan.warnings).toContainEqual({ code: "stockClamped", externalId: "202", detail: "stock -3 is created as 0" });
    expect(await product("202")).toMatchObject({ stock: 0, stockPolicy: "backorder" });
    expect(await product("203")).toMatchObject({ stock: 0, stockPolicy: "unavailable" });
  });

  it("a soft-deleted product is never updated: before the run, nor when it is deleted between the preview and its chunk", async () => {
    await apply();
    const at = new Date("2026-11-01T00:00:00.000Z");
    await prisma.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "202" } }, data: { deletedAt: at } });
    edit(202, { name: "Bo II" });
    edit(201, { name: "Ida II" });
    const del = () => admin.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "201" } }, data: { deletedAt: at } });
    const r = await apply({ hooks: before(0, del) });
    expect(r.plan.products.find((p) => p.externalId === "202")).toMatchObject({ action: "skip", reason: expect.stringMatching(/^deletedHere/) });
    expect(outcomes(r)).toEqual(["201 refused deletedHere"]);
    expect(await product("201")).toMatchObject({ name: "Ida", deletedAt: at });
    expect(await product("202")).toMatchObject({ name: "Bo", deletedAt: at });
  });

  it("a price edited here between the preview and the chunk is kept: the chunk decides again over what it read after its lock", async () => {
    await apply();
    const entry = (await ledger()).products["201"];
    edit(201, { price: "69900" });
    const r = await apply({ hooks: before(0, () => admin.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "201" } }, data: { priceDkk: 59900 } })) });
    expect(r.plan.products.find((p) => p.externalId === "201")).toMatchObject({ action: "update", groups: ["price"] });
    expect(outcomes(r)).toEqual(["201 refused bothChanged"]);
    expect((await product("201"))?.priceDkk).toBe(59900);
    expect((await ledger()).products["201"]).toEqual(entry);
  });

  it("a product chunk that rolls back leaks no id, path or baseline; the categories before it stay, and the audit says ok:false", async () => {
    const audits: boolean[] = [];
    const wrap: WooAuditWrap = (_meta, handler) => handler().then((out) => (audits.push(true), out), (error: unknown) => (audits.push(false), Promise.reject(error)));
    const paths: string[] = [];
    const fail = async (n: number) => {
      if (n === 3) throw new Error("injected");
    };
    const args = parseWooImportArgs(APPLY);
    // Chunks of 2: categories [10, 20] [11, 12], products [201, 202] [203].
    const r = await auditedWooImport(wrap, args, () => applyWooImport(args, deps({ chunkSize: 2, revalidate: (p) => paths.push(p), hooks: { beforeCommit: fail } })));
    expect(outcomes(r)).toEqual(["201 written", "202 written", "203 rolledBack"]);
    expect(r.apply?.stopped).toBe("Error: injected");
    expect(await product("203")).toBeNull();
    expect(Object.keys((await ledger()).products).sort()).toEqual(["201", "202"]);
    expect(paths).not.toContain("/product/kim");
    expect(audits).toEqual([false]);
    expect(formatReport(r)).toContain("  rolledBack product 203");
  });

  it("a category chunk that rolls back leaves every product after it not attempted", async () => {
    const fail = async (n: number) => {
      if (n === 0) throw new Error("injected");
    };
    const r = await apply({ chunkSize: 2, hooks: { beforeCommit: fail } });
    expect(r.apply?.rows.map((row) => `${row.kind} ${row.externalId} ${row.outcome}`)).toEqual([
      "category 10 rolledBack", "category 20 rolledBack", "category 11 notAttempted", "category 12 notAttempted",
      "product 201 notAttempted", "product 202 notAttempted", "product 203 notAttempted",
    ]);
    expect(await prisma.product.count()).toBe(0);
  });

  it("revalidates the old and the new page of a moved product slug, and the product list", async () => {
    await apply();
    const paths: string[] = [];
    edit(201, { slug: "ida-ny" });
    const r = await apply({ revalidate: (p) => paths.push(p) });
    expect(outcomes(r)).toEqual(["201 written"]);
    expect(paths).toEqual(["/product/ida", "/product/ida-ny", "/produkter"]);
    expect((await product("201"))?.slug).toBe("ida-ny");
  });

  it.each([
    ["a hand-made category", async (permalink: string) => void (await admin.category.create({ data: { name: "Hand-made", slug: "hand-made", permalink } }))],
    ["a hand-made product", async (permalink: string) => {
      const { id } = await admin.category.create({ data: { name: "Hand-made", slug: "hand-made" } });
      await admin.product.create({ data: { slug: "hand", name: "Hand", description: "", priceDkk: 1, images: "[]", categoryId: id, permalink } });
    }],
  ])("a permalink claimed by %s in another stored spelling, under the chunk's lock, refuses that product alone", async (_label, claim) => {
    const r = await apply({ hooks: before(1, () => claim("/lamper/bordlamper/ida")) });
    expect(r.plan.products.find((p) => p.externalId === "201")?.action).toBe("create");
    expect(outcomes(r)).toEqual(["201 refused keyTaken", "202 written", "203 written"]);
    expect(await product("201")).toBeNull();
    expect(r.apply?.postconditions).toEqual({ ok: true, failures: [] });
  });

  it("an address taken during the run as a full URL is not seen by the product's chunk, and the read after the run fails the run", async () => {
    const claim = () => admin.category.create({ data: { name: "Hand-made", slug: "hand-made", permalink: "https://elsewhere.example/lamper/bordlamper/ida/" } });
    const r = await apply({ hooks: before(1, claim) });
    expect(outcomes(r)).toEqual(["201 written", "202 written", "203 written"]);
    expect(r.apply?.postconditions).toEqual({ ok: false, failures: [expect.stringMatching(/^product 201: permalink "\/lamper\/bordlamper\/ida\/" is also held by category /)] });
  });

  it("the read after the run checks every product of ours, not only those it wrote: a shared address is not ok", async () => {
    await apply();
    await prisma.category.create({ data: { name: "Hand-made", slug: "hand-made", permalink: "https://elsewhere.example/lamper/bordlamper/ida/" } });
    const r = await apply();
    expect(r.apply?.rows).toEqual([]);
    expect(r.apply?.postconditions).toEqual({ ok: false, failures: [expect.stringMatching(/^product 201: permalink "\/lamper\/bordlamper\/ida\/" is also held by category /)] });
  });

  it.each([
    ["a secondary link the database drops", `CREATE TRIGGER t AFTER INSERT ON "ProductCategory" BEGIN DELETE FROM "ProductCategory" WHERE "productId" = NEW."productId"; END`, /^PostconditionFailed: product 201: core reads back other than it was written$/],
    ["a second holder of the address", `CREATE TRIGGER t AFTER INSERT ON "Product" BEGIN INSERT INTO "Category" ("id","name","slug","permalink") VALUES ('t' || NEW."id", 'T', 't' || NEW."id", NEW."permalink"); END`, /^PostconditionFailed: permalink \/lamper\/bordlamper\/ida has 2 holders after the write$/],
    ["a second holder of the address without its trailing slash", `CREATE TRIGGER t AFTER INSERT ON "Product" BEGIN INSERT INTO "Category" ("id","name","slug","permalink") VALUES ('t' || NEW."id", 'T', 't' || NEW."id", rtrim(NEW."permalink", '/')); END`, /^PostconditionFailed: permalink \/lamper\/bordlamper\/ida has 2 holders after the write$/],
  ])("a write that does not read back as decided (%s) rolls its chunk back and stops the run", async (_label, trigger, stopped) => {
    await apply({}, [...APPLY, "--scope", "categories"]);
    await admin.$executeRawUnsafe(trigger);
    const r = await apply({}, [...APPLY, "--scope", "products"]);
    expect(r.apply?.stopped).toMatch(stopped);
    expect(outcomes(r)).toEqual(["201 rolledBack", "202 rolledBack", "203 rolledBack"]);
    expect(await prisma.product.count()).toBe(0);
    expect((await ledger()).products).toEqual({});
  });

  it.each([
    ["a later write of the chunk", `CREATE TRIGGER t AFTER INSERT ON "Product" WHEN NEW."externalId" = '202' BEGIN UPDATE "Product" SET "priceDkk" = 1 WHERE "externalId" = '201'; END`, "price"],
    ["the ledger's write", `CREATE TRIGGER t AFTER UPDATE ON "MigrationProject" BEGIN UPDATE "Product" SET "priceDkk" = 1 WHERE "externalId" = '201'; END`, "price"],
    ["the ledger's write, on a row the trigger deletes", `CREATE TRIGGER t AFTER UPDATE ON "MigrationProject" BEGIN DELETE FROM "ProductCategory" WHERE "productId" IN (SELECT "id" FROM "Product" WHERE "externalId" = '201'); DELETE FROM "Product" WHERE "externalId" = '201'; END`, "the row"],
    ["the ledger's write, on a row the trigger soft-deletes", `CREATE TRIGGER t AFTER UPDATE ON "MigrationProject" BEGIN UPDATE "Product" SET "deletedAt" = '2026-11-28T00:00:00.000+00:00' WHERE "externalId" = '201'; END`, "the row"],
  ])("a written row changed after its own read-back but inside its chunk (%s) rolls the chunk back: never an edit after the commit", async (_label, trigger, what) => {
    await apply({}, [...APPLY, "--scope", "categories"]);
    await admin.$executeRawUnsafe(trigger);
    const r = await apply({}, [...APPLY, "--scope", "products"]);
    expect(r.apply?.stopped).toBe(`PostconditionFailed: product 201: ${what} is not its baseline as the chunk commits`);
    expect(outcomes(r)).toEqual(["201 rolledBack", "202 rolledBack", "203 rolledBack"]);
    expect(r.apply?.editedAfterCommit).toEqual([]);
    expect(await prisma.product.count()).toBe(0);
    expect((await ledger()).products).toEqual({});
  });

  it("a group refreshed in a write that the write itself changes rolls the chunk back", async () => {
    await apply();
    edit(201, { name: "Ida II", price: "69900" });
    await prisma.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "201" } }, data: { priceDkk: 69900 } });
    await admin.$executeRawUnsafe(`CREATE TRIGGER t AFTER UPDATE OF "name" ON "Product" BEGIN UPDATE "Product" SET "priceDkk" = 1 WHERE "id" = NEW."id"; END`);
    const entry = (await ledger()).products["201"];
    const r = await apply();
    expect(r.plan.products.find((p) => p.externalId === "201")).toMatchObject({ action: "update", groups: ["core"], refresh: ["price"] });
    expect(r.apply?.stopped).toBe("PostconditionFailed: product 201: price is not its baseline as the chunk commits");
    expect(outcomes(r)).toEqual(["201 rolledBack"]);
    expect(r.apply?.editedAfterCommit).toEqual([]);
    expect(await product("201")).toMatchObject({ name: "Ida", priceDkk: 69900 });
    expect((await ledger()).products["201"]).toEqual(entry);
  });

  it("a price changed here after its chunk committed is an edit the run keeps and names, not a failed run", async () => {
    await apply();
    edit(201, { price: "69900" });
    const after = async () => void (await admin.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "201" } }, data: { priceDkk: 1 } }));
    const r = await apply({ hooks: { afterCommit: after } });
    expect(outcomes(r)).toEqual(["201 written"]);
    expect(r.apply?.postconditions).toEqual({ ok: true, failures: [] });
    expect(r.apply?.editedAfterCommit).toEqual(["product 201"]);
    expect(formatReport(r)).toContain("edited here after their chunk committed, and kept (the next run reads them as edits made here): 1 row, product 201");
    expect((await product("201"))?.priceDkk).toBe(1);
    expect(said(await previewWooImport(parseWooImportArgs(APPLY.slice(1)), deps()), "products")).toContain("201 skip localEdit");
  });

  it.each([
    ["soft-deleted (as products.delete does it)",() => admin.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "201" } }, data: { deletedAt: new Date() } })],
    ["deleted", () => admin.product.delete({ where: { source_externalId: { source: "woocommerce", externalId: "201" } } })],
  ])("a product %s here after its chunk committed is an edit the run keeps and names, not a failed run", async (_label, remove) => {
    const r = await apply({ hooks: { afterCommit: async (n) => void (n === 1 ? await remove() : undefined) } });
    expect(outcomes(r)).toEqual(["201 written", "202 written", "203 written"]);
    expect(r.apply?.postconditions).toEqual({ ok: true, failures: [] });
    expect(r.apply?.editedAfterCommit).toEqual(["product 201"]);
  });

  it("the read after the run is done while the run holds the lease: a run that starts once it is free does not fail the one before", async () => {
    // A second import runs the moment the first gives its lease back, and moves 201's price and baseline as it should.
    let second: WooImportReport | undefined;
    let armed = false;
    const leaseFree = async () => (await ledger()).lease === null;
    const db = new Proxy(prisma, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== "$transaction") return value;
        return async (...a: Parameters<PrismaClient["$transaction"]>) => {
          const out = await (value as (...b: typeof a) => Promise<unknown>).apply(target, a);
          if (armed && !second && (await leaseFree())) {
            edit(201, { price: "69900" });
            second = await applyWooImport(parseWooImportArgs(APPLY), { ...deps(), db: admin });
          }
          return out;
        };
      },
    });
    const r = await applyWooImport(parseWooImportArgs(APPLY), { ...deps({ hooks: { afterCommit: async (n) => void (n === 1 && (armed = true)) } }), db });
    expect((second as WooImportReport | undefined)?.apply).toMatchObject({ postconditions: { ok: true }, rows: [{ kind: "product", externalId: "201", outcome: "written" }] });
    expect(r.apply?.postconditions).toEqual({ ok: true, failures: [] });
    expect(r.apply?.editedAfterCommit).toEqual([]);
  });

  it.each([
    ["what it wrote of core", (e: Entry): Entry => ({ ...e, groups: { ...e.groups, core: { saw: e.groups.core?.saw ?? null, wrote: "0".repeat(32) } } })],
    ["what it saw of the price", (e: Entry): Entry => ({ ...e, groups: { ...e.groups, price: { saw: "0".repeat(32), wrote: e.groups.price?.wrote ?? "" } } })],
    ["the row it names", (e: Entry): Entry => ({ ...e, rowId: "another-row" })],
  ])("the read after the run still fails when a baseline is not what its chunk committed (%s)", async (_label, change) => {
    // After the product chunk (1) committed, another writer of the project's settings changes 201's baseline.
    const tamper = async (n: number) => {
      if (n !== 1) return;
      const project = await admin.migrationProject.findFirstOrThrow();
      const settings = project.settings as { wooImport: { products: Record<string, Entry> } };
      const entry = settings.wooImport.products["201"];
      settings.wooImport.products["201"] = change(entry);
      await admin.migrationProject.update({ where: { id: project.id }, data: { settings: settings as Prisma.InputJsonObject } });
    };
    const r = await apply({ hooks: { afterCommit: tamper } });
    expect(outcomes(r)).toEqual(["201 written", "202 written", "203 written"]);
    expect(r.apply?.postconditions).toEqual({ ok: false, failures: ["product 201: its baseline is not what its chunk committed"] });
    expect(r.apply?.editedAfterCommit).toEqual([]);
  });

  it("the read after the run checks a group refreshed in the same write, and the row says it was refreshed", async () => {
    await apply();
    edit(201, { name: "Ida II", price: "69900" });
    // The price is already the shop's here: the update writes core and records the price as it agrees.
    await prisma.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "201" } }, data: { priceDkk: 69900 } });
    const after = async () => void (await admin.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "201" } }, data: { priceDkk: 1 } }));
    const r = await apply({ hooks: { afterCommit: after } });
    expect(r.plan.products.find((p) => p.externalId === "201")).toMatchObject({ action: "update", groups: ["core"] });
    expect(r.apply?.rows).toEqual([{ kind: "product", externalId: "201", outcome: "written", action: "update", refreshed: ["price"] }]);
    expect(r.apply?.postconditions).toEqual({ ok: true, failures: [] });
    expect(r.apply?.editedAfterCommit).toEqual(["product 201"]);
  });

  it("a row that needs a write in a refresh chunk is not attempted, and says which group's baseline it recorded", async () => {
    await apply();
    edit(201, { name: "Ida II", price: "69900" });
    await prisma.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "201" } }, data: { name: "Ida II", priceDkk: 69900 } });
    // The preview sees both groups agree; before its refresh chunk the name goes back to what the last run wrote, so core needs a write.
    const back = () => admin.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "201" } }, data: { name: "Ida" } });
    const r = await apply({ hooks: before(0, back) });
    expect(said(r, "products")).toContain("201 unchanged");
    expect(r.apply?.rows).toEqual([expect.objectContaining({ externalId: "201", outcome: "notAttempted", action: "update", refreshed: ["price"] })]);
    expect(formatReport(r)).toMatch(/ {2}notAttempted product 201 \(update\): the row changed after the preview and needs a write now; run the import again; baseline refreshed: price/);
    expect((await ledger()).products["201"].groups.price).toEqual({ saw: expect.any(String), wrote: expect.any(String) });
  });

  it("late slug, sku and identity claims refuse their own row each", async () => {
    const claims = async () => {
      const { id } = await admin.category.create({ data: { name: "Hand-made", slug: "hand-made" } });
      const hand = { description: "", priceDkk: 1, images: "[]", categoryId: id };
      await admin.product.create({ data: { ...hand, slug: "ida", name: "Slug" } });
      await admin.product.create({ data: { ...hand, slug: "other", name: "Sku", sku: "BO-1" } });
      await admin.product.create({ data: { ...hand, slug: "third", name: "Identity", source: "woocommerce", externalId: "203" } });
    };
    const r = await apply({ hooks: before(1, claims) });
    expect(outcomes(r)).toEqual(["201 refused keyTaken", "202 refused keyTaken", "203 refused noBaseline"]);
    expect(Object.keys((await ledger()).products)).toEqual([]);
  });

  it("a refused primary category blocks its products; a refused secondary one is dropped with a warning and linked by a later run", async () => {
    await prisma.category.create({ data: { name: "Hand-made", slug: "bordlamper" } });
    await prisma.category.create({ data: { name: "Hand-made", slug: "skaerme" } });
    const r = await apply();
    expect(said(r, "categories")).toEqual(["10 create", "20 conflict keyTaken", "11 conflict keyTaken", "12 blocked dependencyMissing"]);
    expect(said(r, "products")).toEqual(["201 blocked dependencyMissing", "202 blocked dependencyMissing", "203 blocked dependencyMissing"]);
    expect(outcomes(r)).toEqual([]);
    // Only the secondary missing: Kim is filed under Messing, without Skærme.
    await prisma.category.deleteMany({ where: { slug: "bordlamper", source: null } });
    const second = await apply();
    expect(said(second, "products")).toEqual(["201 create", "202 blocked dependencyMissing", "203 create"]);
    expect(outcomes(second)).toEqual(["201 written", "203 written"]);
    expect(second.plan.warnings).toContainEqual(expect.objectContaining({ code: "extraCategoryDropped", externalId: "203" }));
    expect((await product("203"))?.extraCategories).toEqual([]);
    // What the source says here, without the link, is what the baseline holds: while Skærme is still missing, a run does nothing.
    expect((await apply()).apply?.rows).toEqual([]);
    // And so does a baseline a refresh records: lost, it comes back once, as the row without the link.
    const kept = await ledger();
    await prisma.migrationProject.updateMany({ data: { settings: { wooImport: { ...kept, products: {} } } as Prisma.InputJsonObject } });
    expect(outcomes(await apply())).toEqual(["201 refreshed", "203 refreshed"]);
    expect((await ledger()).products).toEqual(kept.products);
    expect((await apply()).apply?.rows).toEqual([]);
    await prisma.category.deleteMany({ where: { slug: "skaerme", source: null } });
    const third = await apply();
    expect(third.plan.products.find((p) => p.externalId === "203")).toMatchObject({ action: "update", groups: ["core"] });
    expect(outcomes(third)).toEqual(["202 written", "203 written"]);
    expect((await product("203"))?.extraCategories.map((l) => l.category.externalId)).toEqual(["20"]);
    expect((await apply()).apply?.rows).toEqual([]);
  });

  it("a category deleted or given another source between the preview and the product chunk blocks the products it would file them under", async () => {
    await apply({}, [...APPLY, "--scope", "categories"]);
    const moved = async () => {
      await admin.category.update({ where: { id: (await category("11")).id }, data: { source: "csv" } });
      await admin.category.delete({ where: { id: (await category("20")).id } });
    };
    const r = await apply({ hooks: before(0, moved) }, [...APPLY, "--scope", "products"]);
    expect(said(r, "products")).toEqual(["201 create", "202 create", "203 create"]);
    expect(outcomes(r)).toEqual(["201 refused dependencyMissing", "202 refused dependencyMissing", "203 written"]);
    expect((await product("203"))?.extraCategories).toEqual([]);
    expect(Object.keys((await ledger()).products)).toEqual(["203"]);
  });

  it("a product chunk reads by key: the same statements whether 5 or 2,000 other products are here", async () => {
    const statements = async (others: number) => {
      const url = `file:${join(dir, `n${others}.db`)}`;
      const raw = createClient({ url });
      await raw.executeMultiple(readFileSync(INIT, "utf8"));
      await raw.execute(`INSERT INTO "Category" ("id","name","slug") VALUES ('hand','Hand','hand')`);
      await raw.execute(`INSERT INTO "Product" ("id","name","slug","description","priceDkk","images","categoryId","permalink")
        WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${others}) SELECT 'p' || i, 'P', 'p-' || i, '', 1, '[]', 'hand', '/x/' || i || '/' FROM n`);
      raw.close();
      const counted = new PrismaClient({ adapter: new PrismaLibSql({ url }), log: [{ emit: "event", level: "query" }] });
      await counted.migrationProject.create({ data: { sourceUrl: BUILT_SHOP } });
      await applyWooImport(parseWooImportArgs([...APPLY, "--scope", "categories"]), { ...deps(), db: counted });
      let n = 0;
      let inChunk = false;
      counted.$on("query", () => void (inChunk && n++));
      const r = await applyWooImport(parseWooImportArgs([...APPLY, "--scope", "products"]), { ...deps({ hooks: { beforeChunk: async () => void (inChunk = true), afterCommit: async () => void (inChunk = false) } }), db: counted });
      expect(r.apply?.counts.written).toBe(3);
      await counted.$disconnect();
      return n;
    };
    const few = await statements(5);
    expect(few).toBeGreaterThan(0);
    expect(await statements(2000)).toBe(few);
  }, 30_000);
});
