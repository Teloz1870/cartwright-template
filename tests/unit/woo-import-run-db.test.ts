import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient, type Prisma } from "@/app/generated/prisma/client";
import type { WooAuth, WooTransport } from "@/lib/woo/client";
import { WooHttpError } from "@/lib/woo/client";
import { decide, type WooSrc, type WooWrite } from "@/lib/woo/decide";
import { groupFp, groupNames, groupStates, type WooKind } from "@/lib/woo/groups";
import { DialectMismatch, LeaseHeld, LedgerInvalid, StoreChanged } from "@/lib/woo/ledger";
import { htmlDecoder, mapWooCatalog, type MappedCategory, type MappedProduct } from "@/lib/woo/map-catalog";
import type { WooAction, WooPlanItem } from "@/lib/woo/plan";
import { readFullView } from "@/lib/woo/read-view";
import { REPORT_ROW_CAP, formatReport } from "@/lib/woo/report";
import { parseWooImportArgs, previewWooImport, wooImportAuth, type WooImportReport } from "@/lib/woo/run-import";
import type { WooStock, WooStoreCategory, WooStoreProduct } from "@/lib/woo/types";
import { WooView, type ViewRow } from "@/lib/woo/view";
import { fixtureTransport, wooSnapshot, type RecordedCall } from "./woo-fixture-shop";

/**
 * W21-live-2a-2b — the dry run a person and an agent can run (lib/woo/run-import.ts,
 * spec 2026-10-25, §3C, §3D), on a real libSQL file built from the migration
 * baseline, with the synthetic fixture shop behind a fake transport: Lamper ›
 * Bordlamper › Messing and Skærme, product 101 simple, 102 variable, 103 grouped.
 * The currency and VAT basis are injected, DKK incl. VAT as the fixture prices
 * in, never a scaffold's own. A write here is the test's own, the least that puts
 * a decision into the columns: nothing in the dry run can write.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const INIT = join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite = existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));
/** The repository, not a scaffold: `.github/sync-excludes.txt` never ships (tests/unit/repo-hygiene.test.ts). */
const engine = existsSync(join(ROOT, ".github", "sync-excludes.txt"));

const SHOP = "https://shop.example.test";
const KEY: WooAuth = { user: "ck_test", pass: "cs_test" };
const POLICY = { currency: "DKK", pricesIncludeVat: true };
const VAT = ["--source-prices-include-vat", "yes"];

let dir = "";
let file = "";
let prisma: PrismaClient;
let calls: RecordedCall[];

/** A fresh file for each test of a block that reads one. */
function useDatabase(): void {
  beforeEach(async () => {
    calls = [];
    dir = mkdtempSync(join(tmpdir(), "cw-woo-run-"));
    file = join(dir, "shop.db");
    const url = `file:${file}`;
    const raw = createClient({ url });
    await raw.executeMultiple(readFileSync(INIT, "utf8"));
    raw.close();
    prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  });
  afterEach(async () => {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });
}

type ShopOptions = {
  stock?: Record<string, Partial<WooStock>>;
  product?: (row: WooStoreProduct) => WooStoreProduct;
  extraCategories?: (WooStoreCategory & { count: number })[];
  v3Status?: number;
  beforeRequest?: () => Promise<unknown>;
};

/** The fixture shop, plus wc/v3's stock (every id counts 7 unless told otherwise), and every call recorded. */
function shop({ stock, product, extraCategories, v3Status, beforeRequest }: ShopOptions = {}): WooTransport {
  const fixture = fixtureTransport(calls, { extraCategories });
  return async (raw, init) => {
    await beforeRequest?.();
    const url = new URL(raw);
    if (url.pathname.endsWith("/wc/v3/products")) {
      calls.push({ url, init });
      if (v3Status) return new Response("refused", { status: v3Status });
      const ids = (url.searchParams.get("include") ?? "").split(",").filter(Boolean);
      return Response.json(ids.map((id) => ({ id: Number(id), manage_stock: true, stock_quantity: 7, stock_status: "instock", ...stock?.[id] })));
    }
    const answer = await fixture(raw, init);
    if (!product || !url.pathname.endsWith("/wc/store/v1/products") || url.searchParams.has("type")) return answer;
    return Response.json(((await answer.json()) as WooStoreProduct[]).map(product), { headers: answer.headers });
  };
}

type RunOptions = ShopOptions & { auth?: WooAuth | null; dialect?: "sqlite" | "postgres" };
function dryRun(argv: readonly string[] = VAT, { auth = KEY, dialect = "sqlite", ...shopOptions }: RunOptions = {}): Promise<WooImportReport> {
  return previewWooImport(parseWooImportArgs(argv), {
    db: prisma,
    dialect,
    policy: POLICY,
    client: { siteUrl: "https://new.example.test", transport: shop(shopOptions), assertHostPublic: async () => {}, sleep: async () => {}, ...(auth && { auth }) },
  });
}

const project = (data: { sourceUrl?: string; settings?: Prisma.InputJsonValue } = {}) => prisma.migrationProject.create({ data: { sourceUrl: SHOP, ...data } });
const bytes = () => readFileSync(file).toString("base64");
const row = (items: readonly WooPlanItem[], id: string) => items.find((item) => item.externalId === id);
const rowsAsked = () => calls.filter((c) => c.url.pathname.endsWith("/wc/v3/products")).map((c) => c.url.searchParams.get("include"));

/** The least that puts a decision into the columns; the importer's writer is W21-live-2a-4's and 2a-5's. */
async function write(w: WooWrite): Promise<ViewRow> {
  if (w.op !== "create") throw new Error("a create was expected");
  if (w.kind === "category") return { ...(await prisma.category.create({ data: w.payload })), kind: "category" };
  const { extraCategoryIds, ...fields } = w.payload;
  return { ...(await prisma.product.create({ data: { ...fields, images: "[]", extraCategories: { create: extraCategoryIds.map((categoryId) => ({ categoryId })) } } })), kind: "product" };
}

/** Writes the fixture shop's four categories and product 101 as decide() means them, and, unless told not to, stores the baseline a run would leave. */
async function simulateWriteSet(projectId: string, { baseline = true } = {}): Promise<void> {
  const { categories, products } = mapWooCatalog(wooSnapshot(), await htmlDecoder());
  const ida = products.filter((p) => p.externalId === "101");
  const stock = new Map([["101", { id: 101, manage_stock: true, stock_quantity: 7, stock_status: "instock" }]]);
  const sources = [...categories.map((row): WooSrc => ({ kind: "category", row })), ...ida.map((row): WooSrc => ({ kind: "product", row, type: "simple" }))];
  const view = new WooView({ categories: [], products: [] });
  for (const src of sources) {
    const { write: w, action, reason } = decide(src, view, undefined, stock);
    if (!w) throw new Error(`${src.row.externalId}: ${action} ${reason ?? ""}`);
    view.record(undefined, await write(w));
  }
  if (!baseline) return;
  const here = await readFullView(prisma, "sqlite");
  const entry = (kind: WooKind, source: MappedCategory | MappedProduct) => {
    const own = here.own(kind, source.externalId);
    if (!own?.owned) throw new Error(`${source.externalId} did not read back`);
    const { owned } = own;
    return { rowId: own.id, groups: Object.fromEntries(groupNames(kind).filter((g) => groupStates(kind, source)[g] === "confirmed").map((g) => [g, { saw: groupFp(kind, g, source), wrote: groupFp(kind, g, owned) }])) };
  };
  const wooImport = {
    v: 2, store: SHOP, lease: null,
    categories: Object.fromEntries(categories.map((c) => [c.externalId, entry("category", c)])),
    products: Object.fromEntries(ida.map((p) => [p.externalId, entry("product", p)])),
  };
  await prisma.migrationProject.update({ where: { id: projectId }, data: { settings: { wooImport } } });
}

const IDA = { source_externalId: { source: "woocommerce", externalId: "101" } };
const renamed = (p: WooStoreProduct) => (p.id === 101 ? { ...p, name: "Renamed in the shop" } : p);

describe("parseWooImportArgs — a typo, a repeat or an empty value is an error, never the whole catalogue", () => {
  it.each<[string, readonly string[], object]>([
    ["no arguments: the whole shop", [], { scope: "all", only: null, json: false }],
    ["--dry-run says what is the default anyway", ["--dry-run"], { scope: "all", only: null, json: false }],
    ["--json", ["--json"], { scope: "all", only: null, json: true }],
    ["--name value", ["--scope", "categories"], { scope: "categories", only: null }],
    ["--name=value", ["--scope=products"], { scope: "products", only: null }],
    ["--only by kind", ["--only", "category:10,product:101"], { scope: "all", only: new Set(["category:10", "product:101"]) }],
    ["--only with spaces", ["--only=category:10, product:101"], { only: new Set(["category:10", "product:101"]) }],
    ["a bare id takes its scope's kind", ["--scope", "categories", "--only", "10,11"], { scope: "categories", only: new Set(["category:10", "category:11"]) }],
    ["a bare id takes its scope's kind", ["--only=101", "--scope=products"], { scope: "products", only: new Set(["product:101"]) }],
    ["a kind that agrees with its scope", ["--scope", "products", "--only", "product:101"], { only: new Set(["product:101"]) }],
    ["the VAT basis, yes", VAT, { sourcePricesIncludeVat: true }],
    ["the VAT basis, no", ["--source-prices-include-vat=no"], { sourcePricesIncludeVat: false }],
  ])("reads %s", (_label, argv, expected) => {
    expect(parseWooImportArgs(argv)).toMatchObject(expected);
  });

  it("an unstated VAT basis stays unstated", () => {
    expect(parseWooImportArgs([])).not.toHaveProperty("sourcePricesIncludeVat");
  });

  it.each<[readonly string[], RegExp]>([
    [["--onl", "101"], /unknown argument "--onl"/],
    [["101"], /unknown argument "101"/],
    [["--json=yes"], /unknown argument "--json=yes"/],
    [["--baseline", "x.json"], /unknown argument "--baseline"/],
    [["--store", SHOP], /unknown argument "--store"/],
    [["--only"], /--only needs a value/],
    [["--only", "--json"], /--only needs a value/],
    [["--only="], /--only needs a value/],
    [["--only", "  "], /--only needs a value/],
    [["--scope"], /--scope needs a value/],
    [["--only", ","], /"" is neither/],
    [["--only", "category:10,"], /"" is neither/],
    [["--only", "category:abc"], /"category:abc" is neither/],
    [["--only", "category:"], /"category:" is neither/],
    [["--only", "brand:10"], /"brand:10" is neither/],
    [["--only", "product:0"], /"product:0" is neither/],
    [["--only", "product:01"], /"product:01" is neither/],
    [["--only", "category:10", "--only", "category:11"], /--only is given twice/],
    [["--only", "category:10,category:10"], /names category:10 twice/],
    [["--scope", "categories", "--only", "10,category:10"], /names category:10 twice/],
    [["--only", "15"], /--only 15 does not say which kind it is: write category:15 or product:15/],
    [["--scope", "all", "--only", "15"], /--only 15 does not say which kind it is/],
    [["--scope", "categories", "--only", "product:101"], /--only product:101 is outside --scope categories/],
    [["--scope", "products", "--only", "category:10"], /--only category:10 is outside --scope products/],
    [["--scope", "category"], /--scope is one of categories, products, all/],
    [["--scope", "all", "--scope=all"], /--scope is given twice/],
    [["--json", "--json"], /--json is given twice/],
    [["--dry-run", "--dry-run"], /--dry-run is given twice/],
    [["--source-prices-include-vat", "ja"], /yes or no/],
    [["--source-prices-include-vat=yes", "--source-prices-include-vat=yes"], /given twice/],
  ])("refuses %j", (argv, why) => {
    expect(() => parseWooImportArgs(argv)).toThrow(why);
  });

  it.each<[readonly string[]]>([[["--apply"]], [["--apply", "--scope", "categories"]], [["--dry-run", "--apply"]]])("%j answers that it is not in this version", (argv) => {
    expect(() => parseWooImportArgs(argv)).toThrow(/^--apply is not in this version.*Nothing was read or written\.$/);
  });

  it("--apply= and a repeat stay what they are: not a way past the refusal", () => {
    expect(() => parseWooImportArgs(["--apply=yes"])).toThrow(/unknown argument/);
    expect(() => parseWooImportArgs(["--apply", "--apply"])).toThrow(/--apply is given twice/);
  });
});

describe("wooImportAuth — the key is whole or absent", () => {
  it("none, or both halves", () => {
    expect(wooImportAuth({})).toBeUndefined();
    expect(wooImportAuth({ WOO_AUTH_USER: "  ", WOO_AUTH_PASS: "" })).toBeUndefined();
    expect(wooImportAuth({ WOO_AUTH_USER: " ck ", WOO_AUTH_PASS: "cs" })).toEqual({ user: "ck", pass: "cs" });
  });

  it.each([[{ WOO_AUTH_USER: "ck" }], [{ WOO_AUTH_PASS: "cs" }], [{ WOO_AUTH_USER: "ck", WOO_AUTH_PASS: "  " }]])("half a key is an error, never \"no key\": %j", (env) => {
    expect(() => wooImportAuth(env)).toThrow(/both WOO_AUTH_USER and WOO_AUTH_PASS/);
  });
});

describe.skipIf(!sqlite)("the pre-flight — refused before any request to the shop", () => {
  useDatabase();

  const ledger = (over: object) => ({ v: 2, store: SHOP, lease: null, categories: {}, products: {}, ...over });
  const heartbeat = (ago: number) => new Date(Date.now() - ago).toISOString();

  it("no migration project: there is no shop to read", async () => {
    await expect(dryRun()).rejects.toThrow(/^No migration project yet/);
    expect(calls).toEqual([]);
  });

  it("another shop's baseline, through the ledger", async () => {
    await project({ settings: { wooImport: ledger({ store: "https://other.example.test" }) } });
    await expect(dryRun()).rejects.toThrow(StoreChanged);
    await expect(dryRun()).rejects.toThrow(/baseline belongs to https:\/\/other\.example\.test, but its source is https:\/\/shop\.example\.test/);
    expect(calls).toEqual([]);
  });

  it("a shop in another directory of the same host is another shop", async () => {
    await project({ sourceUrl: `${SHOP}/shop`, settings: { wooImport: ledger({}) } });
    await expect(dryRun()).rejects.toThrow(StoreChanged);
    expect(calls).toEqual([]);
  });

  it("a baseline this version cannot read", async () => {
    await project({ settings: { wooImport: { v: 1 } } });
    await expect(dryRun()).rejects.toThrow(LedgerInvalid);
    expect(calls).toEqual([]);
  });

  it("settings that are not an object", async () => {
    await project({ settings: ["not", "an", "object"] });
    await expect(dryRun()).rejects.toThrow(LedgerInvalid);
    expect(calls).toEqual([]);
  });

  it("a live run's lease, where a stale one lets it through", async () => {
    const { id } = await project({ settings: { wooImport: ledger({ lease: { runId: "other-run", heartbeatAt: heartbeat(60_000) } }) } });
    await expect(dryRun()).rejects.toThrow(LeaseHeld);
    expect(calls).toEqual([]);
    const stale = ledger({ lease: { runId: "other-run", heartbeatAt: heartbeat(11 * 60_000) } });
    await prisma.migrationProject.update({ where: { id }, data: { settings: { wooImport: stale } } });
    await expect(dryRun()).resolves.toMatchObject({ mode: "dry-run" });
    expect(calls.length).toBeGreaterThan(0);
    // A dry run takes no lease over, stale or not.
    expect((await prisma.migrationProject.findUniqueOrThrow({ where: { id } })).settings).toEqual({ wooImport: stale });
  });

  it("a database that is not the dialect the run was told", async () => {
    await project();
    await expect(dryRun(VAT, { dialect: "postgres" })).rejects.toThrow(DialectMismatch);
    expect(calls).toEqual([]);
  });

  it("a key over plain http, and half a key that reaches the client: the constructor refuses, and neither half is named", async () => {
    await project({ sourceUrl: "http://shop.example.test" });
    await expect(dryRun()).rejects.toThrow(/sent over https only/);
    await prisma.migrationProject.updateMany({ data: { sourceUrl: SHOP } });
    const half = await dryRun(VAT, { auth: { user: "ck_test", pass: " " } }).catch((err: Error) => err.message);
    expect(half).toMatch(/needs both halves/);
    expect(half).not.toContain("ck_test");
    expect(calls).toEqual([]);
  });

  it("a plain-http shop with no key is read: the key is what needs https", async () => {
    await project({ sourceUrl: "http://shop.example.test" });
    await expect(dryRun(VAT, { auth: null })).resolves.toMatchObject({ store: "http://shop.example.test" });
  });

  it("a source address with a query", async () => {
    await project({ sourceUrl: `${SHOP}/?lang=da` });
    await expect(dryRun()).rejects.toThrow(/must not carry a query or fragment/);
    expect(calls).toEqual([]);
  });

  it("the shop is the newest project's, the one the board reads, and nothing else names it", async () => {
    await prisma.migrationProject.create({ data: { sourceUrl: "https://old.example.test", createdAt: new Date("2026-01-01T00:00:00Z") } });
    await prisma.migrationProject.create({ data: { sourceUrl: SHOP, createdAt: new Date("2026-06-01T00:00:00Z") } });
    await prisma.migrationProject.create({ data: { sourceUrl: "https://older.example.test", createdAt: new Date("2025-01-01T00:00:00Z") } });
    vi.stubEnv("WOO_STORE_URL", "https://from-env.example.test");
    await expect(dryRun()).resolves.toMatchObject({ store: SHOP });
    vi.unstubAllEnvs();
    expect(new Set(calls.map((c) => c.url.origin))).toEqual(new Set([SHOP]));
  });
});

describe.skipIf(!sqlite)("the preview — end to end on a real file", () => {
  useDatabase();

  it("an empty catalogue: parents first, every simulated write seen by the rows after it, only GETs, the key only to wc/v3, and the file as it was", async () => {
    await project();
    const before = bytes();
    const { plan, stock, store, read } = await dryRun();
    expect(plan.categories.map((c) => [c.externalId, c.action])).toEqual([["10", "create"], ["20", "create"], ["11", "create"], ["12", "create"]]);
    expect(plan.products.map((p) => [p.externalId, p.action])).toEqual([["101", "create"], ["102", "skip"], ["103", "skip"]]);
    expect(plan.counts.categories).toMatchObject({ create: 4, blocked: 0 });
    expect(plan.counts.products).toMatchObject({ create: 1, skip: 2 });
    expect(stock).toEqual({ read: true, candidates: 1, withoutExactStock: 0 });
    expect(store).toBe(SHOP);
    expect(read.products).toEqual({ complete: true, total: 3, fetched: 3 });
    expect(new Set(calls.map((c) => `${c.init.method} ${c.url.origin}`))).toEqual(new Set([`GET ${SHOP}`]));
    expect(calls.filter((c) => c.init.headers.authorization).map((c) => c.url.pathname)).toEqual(["/wp-json/wc/v3/products"]);
    expect(bytes()).toBe(before);
    expect(await prisma.category.count()).toBe(0);
    expect((await prisma.migrationProject.findFirstOrThrow()).settings).toBeNull();
  });

  it("no key: stock is not read and is unknown, never 0, and a create still says create", async () => {
    await project();
    const { plan, stock } = await dryRun(VAT, { auth: null });
    expect(stock).toEqual({ read: false, candidates: 1, withoutExactStock: null });
    expect(rowsAsked()).toEqual([]);
    expect(row(plan.products, "101")).toMatchObject({ action: "create" });
    expect(row(plan.categories, "11")).toMatchObject({ action: "create" });
  });

  it("the second run after a simulated write set says unchanged: nothing to write, nothing to record, no stock to read", async () => {
    const { id } = await project();
    await simulateWriteSet(id);
    const before = bytes();
    const { plan, stock } = await dryRun();
    expect(plan.counts.categories).toMatchObject({ unchanged: 4, create: 0, update: 0, conflict: 0 });
    expect(plan.counts.products).toMatchObject({ unchanged: 1, skip: 2, create: 0, update: 0, conflict: 0 });
    expect([...plan.categories, ...plan.products].filter((item) => item.refresh)).toEqual([]);
    expect(row(plan.products, "101")).toMatchObject({ action: "unchanged", dbId: expect.any(String) });
    expect(stock).toEqual({ read: true, candidates: 0, withoutExactStock: 0 });
    expect(rowsAsked()).toEqual([]);
    expect(bytes()).toBe(before);
  });

  it("the same columns with no baseline yet: unchanged, and a run would record them", async () => {
    const { id } = await project();
    await simulateWriteSet(id, { baseline: false });
    const { plan, stock } = await dryRun();
    expect(plan.counts.products).toMatchObject({ unchanged: 1 });
    expect(row(plan.products, "101")?.refresh).toEqual(["core", "price"]);
    expect(row(plan.categories, "10")?.refresh).toEqual(["core"]);
    // A row already here needs no stock, baseline or not: an update writes none.
    expect(stock).toEqual({ read: true, candidates: 0, withoutExactStock: 0 });
    expect(rowsAsked()).toEqual([]);
  });

  it("a row soft-deleted here with no baseline yet is still here: a skip, and no stock to read", async () => {
    const { id } = await project();
    await simulateWriteSet(id, { baseline: false });
    await prisma.product.update({ where: IDA, data: { deletedAt: new Date("2026-10-01T00:00:00Z") } });
    const { plan, stock } = await dryRun();
    expect(row(plan.products, "101")).toMatchObject({ action: "skip", reason: expect.stringMatching(/^deletedHere: /) });
    expect(stock).toEqual({ read: true, candidates: 0, withoutExactStock: 0 });
    expect(rowsAsked()).toEqual([]);
  });

  describe("through the stored baseline", () => {
    let id = "";
    beforeEach(async () => {
      ({ id } = await project());
      await simulateWriteSet(id);
    });

    it("a change in the source is an update of its group alone", async () => {
      expect(row((await dryRun(VAT, { product: renamed })).plan.products, "101")).toMatchObject({ action: "update", groups: ["core"] });
      const repriced = (p: WooStoreProduct) => (p.id === 101 ? { ...p, prices: { ...p.prices, price: "89900" } } : p);
      expect(row((await dryRun(VAT, { product: repriced })).plan.products, "101")).toMatchObject({ action: "update", groups: ["price"] });
    });

    it("an edit here is kept, and with a change in the source it is a conflict", async () => {
      await prisma.product.update({ where: IDA, data: { name: "Edited here" } });
      expect(row((await dryRun()).plan.products, "101")).toMatchObject({ action: "skip", reason: expect.stringMatching(/^localEdit: /) });
      expect(row((await dryRun(VAT, { product: renamed })).plan.products, "101")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^bothChanged: /) });
    });

    it("a row deleted here, hard or soft, is not created again and needs no stock", async () => {
      await prisma.product.update({ where: IDA, data: { deletedAt: new Date("2026-10-01T00:00:00Z") } });
      const soft = await dryRun();
      expect(row(soft.plan.products, "101")).toMatchObject({ action: "skip", reason: expect.stringMatching(/^deletedHere: /) });
      expect(soft.stock).toEqual({ read: true, candidates: 0, withoutExactStock: 0 });
      await prisma.product.delete({ where: IDA });
      const { plan, stock } = await dryRun();
      expect(row(plan.products, "101")).toMatchObject({ action: "skip", reason: expect.stringMatching(/^deletedHere: /) });
      expect(stock).toEqual({ read: true, candidates: 0, withoutExactStock: 0 });
      expect(rowsAsked()).toEqual([]);
    });

    it("the same identity on a row the baseline does not name is a conflict", async () => {
      const category = await prisma.category.findFirstOrThrow({ where: { externalId: "10" } });
      const ida = await prisma.product.findUniqueOrThrow({ where: IDA });
      await prisma.product.delete({ where: IDA });
      await prisma.product.create({ data: { source: "woocommerce", externalId: "101", slug: ida.slug, name: ida.name, permalink: ida.permalink, sku: ida.sku, description: ida.description, priceDkk: ida.priceDkk, images: "[]", categoryId: category.id } });
      expect(row((await dryRun()).plan.products, "101")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^replacedHere: /) });
    });
  });

  it.each<[string, Date | null]>([
    ["live here", null],
    ["soft-deleted here", new Date("2026-10-01T00:00:00Z")],
  ])("a row gone from the source is listed, counted and left, within the run's scope: %s", async (_label, deletedAt) => {
    const { id } = await project();
    await simulateWriteSet(id);
    const { id: categoryId } = await prisma.category.findFirstOrThrow({ where: { externalId: "10" } });
    const gone = await prisma.product.create({ data: { source: "woocommerce", externalId: "999", slug: "gone", name: "Gone", description: "", priceDkk: 1, images: "[]", categoryId, deletedAt } });
    const whole = await dryRun();
    expect(whole.plan.missingInSource).toEqual([{ kind: "product", externalId: "999", dbId: gone.id }]);
    expect(formatReport(whole).split("\n")).toContain("gone from the source, and left as they are: 1 row (--json lists them)");
    expect((await dryRun(["--scope", "categories", ...VAT])).plan.missingInSource).toEqual([]);
    expect((await dryRun(["--only", "product:101", ...VAT])).plan.missingInSource).toEqual([]);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: gone.id } })).toEqual(gone);
  });

  it("the project naming another shop by the time the catalogue is read stops the run", async () => {
    const { id } = await project();
    let moved = false;
    const move = async () => {
      if (moved) return;
      moved = true;
      await prisma.migrationProject.update({ where: { id }, data: { sourceUrl: "https://other.example.test" } });
    };
    await expect(dryRun(VAT, { beforeRequest: move })).rejects.toThrow(/This run read https:\/\/shop\.example\.test, but the migration project's source is now https:\/\/other\.example\.test/);
  });
});

describe.skipIf(!sqlite)("the preview — what the selection takes", () => {
  useDatabase();

  beforeEach(async () => {
    await project();
  });

  it("--only product:101 on an empty catalogue: the product alone, stock asked for it alone, and its category is not created for it", async () => {
    const { plan, stock, only } = await dryRun(["--only", "product:101", ...VAT]);
    expect(only).toEqual(["product:101"]);
    expect(plan.categories).toEqual([]);
    expect(plan.products.map((p) => p.externalId)).toEqual(["101"]);
    expect(row(plan.products, "101")).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^dependencyMissing: its category 11 does not exist here/) });
    expect(plan.counts.categories).toMatchObject({ create: 0 });
    expect(stock).toEqual({ read: true, candidates: 1, withoutExactStock: 0 });
    expect(rowsAsked()).toEqual(["101"]);
  });

  it("an id means its kind and no other: --only product:101 leaves category 101, and --only category:101 leaves product 101", async () => {
    const twin = { id: 101, name: "Twin", slug: "twin", parent: 0, permalink: `${SHOP}/twin/`, count: 1 };
    const asProduct = await dryRun(["--only", "product:101", ...VAT], { extraCategories: [twin] });
    expect(asProduct.plan.categories).toEqual([]);
    expect(asProduct.plan.products.map((p) => p.externalId)).toEqual(["101"]);
    calls.length = 0;
    const asCategory = await dryRun(["--only", "category:101", ...VAT], { extraCategories: [twin] });
    expect(asCategory.plan.categories.map((c) => [c.externalId, c.action])).toEqual([["101", "create"]]);
    expect(asCategory.plan.products).toEqual([]);
    expect(rowsAsked()).toEqual([]);
  });

  it("a child without its parent in the run waits for it; with it, it sees the parent's simulated create", async () => {
    const alone = await dryRun(["--only", "category:11", ...VAT]);
    expect(row(alone.plan.categories, "11")).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^dependencyMissing: parent 10 does not exist here/) });
    const together = await dryRun(["--only", "category:11,category:10", ...VAT]);
    expect(together.plan.categories.map((c) => [c.externalId, c.action])).toEqual([["10", "create"], ["11", "create"]]);
  });

  it("--scope categories decides no product and reads no stock, with a key or without", async () => {
    const { plan, stock, scope } = await dryRun(["--scope", "categories", ...VAT]);
    expect(scope).toBe("categories");
    expect(plan.products).toEqual([]);
    expect(plan.counts.categories).toMatchObject({ create: 4 });
    expect(stock).toEqual({ read: true, candidates: 0, withoutExactStock: 0 });
    expect(rowsAsked()).toEqual([]);
  });

  it("--scope products decides no category, so a new product waits for its categories", async () => {
    const { plan } = await dryRun(["--scope", "products", ...VAT]);
    expect(plan.categories).toEqual([]);
    expect(row(plan.products, "101")).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^dependencyMissing: /) });
  });

  it("an id the shop does not list stops the run: a typo never reads as nothing to do, and nothing about its rows is previewed", async () => {
    await expect(dryRun(["--only", "category:10,product:999,category:101", ...VAT])).rejects.toThrow(/^--only names what the shop does not list: product:999, category:101\. Nothing was previewed\.$/);
    expect(rowsAsked()).toEqual([]);
  });

  it("the warnings are the rows it took, where the whole shop's would read as theirs", async () => {
    const codes = async (argv: readonly string[]) => (await dryRun([...argv, ...VAT])).plan.warnings.map((w) => `${w.code} ${w.externalId}`);
    expect((await codes([])).sort()).toEqual(["noPrice 103", "slugRewritten 103", "slugRewritten 20"]);
    expect((await codes(["--only", "product:103"])).sort()).toEqual(["noPrice 103", "slugRewritten 103"]);
    expect(await codes(["--scope", "categories"])).toEqual(["slugRewritten 20"]);
    expect(await codes(["--only", "product:101"])).toEqual(["extraCategoryDropped 101", "extraCategoryDropped 101"]);
  });

  it("what the source alone says reads the whole source: a key another, unselected row claims is still a conflict", async () => {
    const twinSlug = (p: WooStoreProduct) => (p.id === 102 ? { ...p, slug: "bordlampe-ida" } : p);
    const { plan } = await dryRun(["--only", "product:101", ...VAT], { product: twinSlug });
    expect(row(plan.products, "101")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^keyDuplicated: /) });
  });
});

describe.skipIf(!sqlite)("the preview — stock is counted from the facts", () => {
  useDatabase();

  beforeEach(async () => {
    await project();
  });

  it("a product Woo does not count is blocked and counted", async () => {
    const { plan, stock } = await dryRun(VAT, { stock: { "101": { manage_stock: false, stock_quantity: null } } });
    expect(row(plan.products, "101")).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^stockUntracked: /) });
    expect(stock).toEqual({ read: true, candidates: 1, withoutExactStock: 1 });
  });

  it("a verdict that comes first does not hide it: with no VAT basis every product is blocked, and the count stands (R1-COUNTER-FROM-REASON-STRINGS)", async () => {
    const { plan, stock } = await dryRun([], { stock: { "101": { manage_stock: false, stock_quantity: null } } });
    expect(row(plan.products, "101")).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^taxBasisUnknown: /) });
    expect(stock).toEqual({ read: true, candidates: 1, withoutExactStock: 1 });
    expect(plan.snapshotWarnings).toEqual([expect.stringMatching(/^Nobody has said whether the shop's prices include VAT/)]);
  });

  it("a negative count is a create at 0, with a warning", async () => {
    const { plan, stock } = await dryRun(VAT, { stock: { "101": { stock_quantity: -3 } } });
    expect(row(plan.products, "101")).toMatchObject({ action: "create" });
    expect(plan.warnings).toContainEqual({ code: "stockClamped", externalId: "101", detail: "stock -3 is created as 0" });
    expect(stock).toEqual({ read: true, candidates: 1, withoutExactStock: 0 });
  });

  it("a refused key ends the run: nothing is read as no stock", async () => {
    await expect(dryRun(VAT, { v3Status: 401 })).rejects.toThrow(WooHttpError);
  });

  it("a product the shop does not answer for ends the run too", async () => {
    await expect(previewWooImport(parseWooImportArgs(VAT), {
      db: prisma,
      dialect: "sqlite",
      policy: POLICY,
      client: {
        siteUrl: "https://new.example.test",
        auth: KEY,
        assertHostPublic: async () => {},
        sleep: async () => {},
        transport: async (raw, init) => (new URL(raw).pathname.endsWith("/wc/v3/products") ? Response.json([]) : shop()(raw, init)),
      },
    })).rejects.toThrow(/did not answer with one row each/);
  });
});

function report(over: Partial<WooImportReport> = {}, plan: Partial<WooImportReport["plan"]> = {}): WooImportReport {
  const none = { create: 0, update: 0, unchanged: 0, skip: 0, conflict: 0, orphan: 0, blocked: 0 };
  const list = { complete: true, total: 2, fetched: 2 };
  return {
    mode: "dry-run",
    store: SHOP,
    scope: "all",
    only: null,
    read: { categories: list, products: list, variations: list, wpProducts: list },
    stock: { read: true, candidates: 0, withoutExactStock: 0 },
    plan: { mappingVersion: 2, categories: [], products: [], variations: { attached: 0, orphans: [] }, counts: { categories: none, products: none }, missingInSource: [], warnings: [], snapshotWarnings: [], ...plan },
    ...over,
  };
}

describe("formatReport — the text a person reads", () => {
  const lines = (r: WooImportReport) => formatReport(r).split("\n");

  it.each<[WooAction, Partial<WooPlanItem>, string]>([
    ["create", {}, "  create    product 101 ida"],
    ["update", { groups: ["core", "price"] }, "  update    product 101 ida: core, price"],
    ["unchanged", {}, "  unchanged product 101 ida"],
    ["skip", { reason: "localEdit: edited here since the last run; the edit is kept" }, "  skip      product 101 ida: localEdit: edited here since the last run; the edit is kept"],
    ["conflict", { reason: 'keyTaken: slug "ida" is taken by a hand-made product p1' }, '  conflict  product 101 ida: keyTaken: slug "ida" is taken by a hand-made product p1'],
    ["orphan", { reason: "its category 77 is not in the source" }, "  orphan    product 101 ida: its category 77 is not in the source"],
    ["blocked", { reason: "noPrice: the source sends no usable price, and no price is written as 0" }, "  blocked   product 101 ida: noPrice: the source sends no usable price, and no price is written as 0"],
  ])("%s: its row and its count", (action, item, line) => {
    const counts = { create: 0, update: 0, unchanged: 0, skip: 0, conflict: 0, orphan: 0, blocked: 0, [action]: 1 };
    const text = lines(report({}, { products: [{ externalId: "101", slug: "ida", action, ...item }], counts: { categories: report().plan.counts.categories, products: counts } }));
    expect(text).toContain(line);
    expect(text).toContain(`products: ${["create", "update", "unchanged", "skip", "conflict", "orphan", "blocked"].map((a) => `${a} ${a === action ? 1 : 0}`).join(", ")}`);
  });

  it("the rows to act on come first, categories before products within a verdict, and the rest are counted, not lost", () => {
    const creates: WooPlanItem[] = Array.from({ length: REPORT_ROW_CAP }, (_, i) => ({ externalId: String(1000 + i), action: "create" }));
    const text = lines(report({}, {
      categories: [{ externalId: "1", action: "create" }, { externalId: "2", action: "conflict", reason: "r" }, { externalId: "3", action: "skip", reason: "r" }, { externalId: "4", action: "unchanged" }],
      products: [...creates, { externalId: "5", action: "blocked", reason: "r" }, { externalId: "6", action: "orphan", reason: "r" }, { externalId: "7", action: "update", groups: ["core"] }, { externalId: "8", action: "conflict", reason: "r" }],
    }));
    const rows = text.filter((l) => l.startsWith("  ") && !l.includes("more"));
    expect(rows).toHaveLength(REPORT_ROW_CAP);
    expect(rows.slice(0, 7)).toEqual([
      "  conflict  category 2: r", "  conflict  product 8: r", "  orphan    product 6: r", "  blocked   product 5: r", "  update    product 7: core", "  skip      category 3: r", "  create    category 1",
    ]);
    expect(text).toContain("  8 more (--json lists them)");
    expect(formatReport(report({}, { products: creates }))).not.toContain("more (--json");
  });

  it("what it read, its narrowing, and a list it could not read whole", () => {
    const short = { complete: false, total: 4, fetched: 3 };
    const unknown = { complete: false, total: null, fetched: 2 };
    const text = lines(report({ scope: "products", only: ["product:101", "product:102"], read: { ...report().read, products: short, variations: unknown } }));
    expect(text[0]).toBe(`DRY RUN, nothing written · ${SHOP} · scope products · only product:101,product:102`);
    expect(text[1]).toBe("read: 2 of 2 categories, 3 of 4 products (incomplete, so nothing of them is called gone), 2 of ? variations (incomplete, so nothing of them is called gone)");
  });

  it("stock read and not read: what is unknown is said to be, never 0", () => {
    expect(lines(report({ stock: { read: true, candidates: 3, withoutExactStock: 1 } }))).toContain("stock: read for new products, 3; without an exact count, 1");
    const unread = formatReport(report({ stock: { read: false, candidates: 3, withoutExactStock: null } }));
    expect(unread).toContain("stock: not read, there is no wc/v3 key (WOO_AUTH_USER, WOO_AUTH_PASS); new products not checked for an exact count, 3");
    expect(unread).not.toContain("null");
  });

  it("the baseline a run would record, warnings by code, rows gone, and a snapshot warning are said only when there are any", () => {
    const quiet = formatReport(report());
    for (const word of ["baseline:", "warnings:", "gone from the source", "! "]) expect(quiet).not.toContain(word);
    const text = lines(report({}, {
      categories: [{ externalId: "1", action: "unchanged", refresh: ["core"] }],
      products: [{ externalId: "2", action: "unchanged", refresh: ["core", "price"] }, { externalId: "3", action: "unchanged" }],
      warnings: [{ code: "noPrice", externalId: "2", detail: "" }, { code: "slugRewritten", externalId: "2", detail: "" }, { code: "noPrice", externalId: "3", detail: "" }],
      missingInSource: [{ kind: "product", externalId: "9", dbId: "p9" }],
      snapshotWarnings: ["wp/v2 answered 1 of 2 products"],
      variations: { attached: 3, orphans: [{ externalId: "299", action: "orphan" }] },
    }));
    expect(text).toContain("baseline: a run records what 2 rows agree on with the source, with no catalogue write");
    expect(text).toContain("warnings: 2 noPrice, 1 slugRewritten (--json lists them)");
    expect(text).toContain("gone from the source, and left as they are: 1 row (--json lists them)");
    expect(text).toContain("! wp/v2 answered 1 of 2 products");
    expect(text).toContain("variations: 3 attached (not imported until schema batch B), 1 orphaned");
  });

  it("a shop's text cannot add a row or drive the terminal", () => {
    const text = formatReport(report({}, {
      products: [{ externalId: "1", action: "conflict", reason: 'keyTaken: sku "a\n  create    product 2\u001b[2J"' }],
      snapshotWarnings: ["The shop prices in EUR\n! forged\u001b[2J, this shop in DKK"],
    }));
    expect(text).toContain('  conflict  product 1: keyTaken: sku "a   create    product 2 [2J"');
    expect(text.split("\n").filter((l) => l.startsWith("  "))).toHaveLength(1);
    expect(text.split("\n").filter((l) => l.startsWith("! "))).toEqual(["! The shop prices in EUR ! forged [2J, this shop in DKK"]);
    expect(text).not.toContain("\u001b");
  });
});

describe.skipIf(!sqlite)("the script's output, from the fixture shop, whole", () => {
  useDatabase();

  it("an empty catalogue, with a key", async () => {
    await project();
    expect(formatReport(await dryRun()).split("\n")).toEqual([
      `DRY RUN, nothing written · ${SHOP} · scope all`,
      "read: 4 of 4 categories, 3 of 3 products, 3 of 3 variations",
      "categories: create 4, update 0, unchanged 0, skip 0, conflict 0, orphan 0, blocked 0",
      "products: create 1, update 0, unchanged 0, skip 2, conflict 0, orphan 0, blocked 0",
      "variations: 2 attached (not imported until schema batch B), 1 orphaned",
      "stock: read for new products, 1; without an exact count, 0",
      "  skip      product 102 loftlampe-bo: unsupportedType: a variable product is not imported until schema batch B: its variants have no externalId yet",
      "  skip      product 103 lampesaet-duo: unsupportedType: a grouped product is not imported until schema batch B: its variants have no externalId yet",
      "  create    category 10 lamper",
      "  create    category 20 skaerme",
      "  create    category 11 bordlamper",
      "  create    category 12 messing",
      "  create    product 101 bordlampe-ida",
      "warnings: 2 slugRewritten, 1 noPrice (--json lists them)",
    ]);
  });

  it("a currency the shop sends is the shop's text: it reaches a warning and a row as sent, and the report keeps each to one line of plain text", async () => {
    await project();
    const forged = "EUR\n  create    product 2\u001b[2J";
    const sent = await dryRun(VAT, { product: (p) => ({ ...p, prices: { ...p.prices, currency_code: forged } }) });
    expect(sent.plan.snapshotWarnings).toEqual([`The shop prices in ${forged}, this shop in DKK: no product is planned, and prices are never converted`]);
    const text = formatReport(sent);
    expect(text).not.toContain("\u001b");
    expect(text.split("\n")).toEqual(expect.arrayContaining([
      "! The shop prices in EUR   create    product 2 [2J, this shop in DKK: no product is planned, and prices are never converted",
      "  blocked   product 101 bordlampe-ida: currencyMismatch: priced in EUR   create    product 2 [2J, this shop sells in DKK",
    ]));
    expect(text.split("\n").filter((l) => l.startsWith("  create    product"))).toEqual([]);
  });

  it("--json is the report, and it holds no key: neither half reaches it, nor the text", async () => {
    await project();
    const report = await dryRun(["--json", ...VAT]);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(report.only).toBeNull();
    for (const text of [JSON.stringify(report), formatReport(report)]) for (const half of [KEY.user, KEY.pass]) expect(text).not.toContain(half);
  });
});

describe("lib/woo's run reaches for nothing beside the catalogue (INV-27)", () => {
  it.each(["run-import.ts", "report.ts"])("%s imports no tool, no IndexNow and no server-only of its own", (name) => {
    expect(readFileSync(join(ROOT, "lib", "woo", name), "utf8")).not.toMatch(/from "@\/lib\/(tools|indexnow|audit)|import "server-only"/);
  });
});

describe.skipIf(!engine)("scripts/woo-import.ts — what ships beside it", () => {
  const script = () => readFileSync(join(ROOT, "scripts", "woo-import.ts"), "utf8");

  it("runs with the condition its server-only imports need", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["woo:import"]).toBe("tsx --conditions react-server scripts/woo-import.ts");
  });

  it("parses its arguments and key before it opens the database, so --apply and a typo stop with nothing read", () => {
    const code = script();
    const opened = code.indexOf('import("../lib/db")');
    expect(opened).toBeGreaterThan(0);
    expect(code.indexOf("parseWooImportArgs(process.argv.slice(2))")).toBeGreaterThan(0);
    expect(code.indexOf("parseWooImportArgs(process.argv.slice(2))")).toBeLessThan(opened);
    expect(code.indexOf("wooImportAuth(process.env)")).toBeGreaterThan(0);
    expect(code.indexOf("wooImportAuth(process.env)")).toBeLessThan(opened);
  });

  it("holds none of what #704's did: no shop from the environment, no baseline file", () => {
    const code = script();
    for (const gone of ["WOO_STORE_URL", "--baseline", "readFileSync", "writeFileSync", "existsSync"]) expect(code).not.toContain(gone);
  });
});
