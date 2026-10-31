import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import { invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";
import type { WooPlanSummary } from "@/lib/migration/woo-plan-summary";
import { decide, type WooSrc, type WooWrite } from "@/lib/woo/decide";
import { htmlDecoder, mapWooCatalog } from "@/lib/woo/map-catalog";
import type { WooStock } from "@/lib/woo/types";
import { WooView, type ViewRow } from "@/lib/woo/view";
import { fixtureTransport, wooSnapshot } from "./woo-fixture-shop";

/**
 * W21-live-2a-1b — migration.woo_plan over real columns: the schema the
 * migration baseline creates, through the real Prisma client over libSQL, so
 * what its read selects is what the plan compares. A row the importer's verdict
 * wrote reads back unchanged; an edit here, a soft delete and a loop in the tree
 * here are seen, none of which a read of the keys alone could see. `write` below
 * is the least that puts a payload into those columns, not the importer's writer
 * (W21-live-2a-4 and 2a-5), as in woo-readback-db.test.ts.
 */

const mocks = vi.hoisted(() => ({
  prisma: null as unknown,
  withAudit: vi.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()),
  gate: vi.fn(async () => ({ available: true, features: { migrationDashboard: true } })),
}));

vi.mock("@/lib/db", () => ({
  get prisma() {
    return mocks.prisma;
  },
}));
// The fixture shop prices in DKK, VAT included: the plan is pinned to that policy, never a scaffold's own.
vi.mock("@/brand.config", async (orig) => {
  const actual = await orig<typeof import("@/brand.config")>();
  return { ...actual, brand: { ...actual.brand, policies: { ...actual.brand.policies, currency: "DKK", pricesIncludeVat: true } } };
});
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/brand", async (orig) => ({ ...(await orig<typeof import("@/lib/brand")>()), getFeatureGateState: mocks.gate }));
vi.mock("@/lib/import/safe-fetch", async (orig) => ({ ...(await orig<typeof import("@/lib/import/safe-fetch")>()), assertResolvedAddressesPublic: vi.fn(async () => {}) }));

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite = existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const CTX: ToolCtx = { actor: "apikey:test", requestId: "test-woo-plan-db" };
const SHOP = "https://shop.example.test";
const STOCK: ReadonlyMap<string, WooStock> = new Map([["101", { id: 101, manage_stock: true, stock_quantity: 5, stock_status: "instock" }]]);

let dir = "";
let prisma: PrismaClient;

beforeEach(async () => {
  vi.stubGlobal("fetch", fixtureTransport());
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-woo-plan-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"));
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  mocks.prisma = prisma;
  await prisma.migrationProject.create({ data: { sourceUrl: SHOP } });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function write(w: WooWrite): Promise<ViewRow> {
  if (w.kind === "category") {
    if (w.op !== "create") throw new Error("a create was expected");
    const row = await prisma.category.create({ data: w.payload });
    return { ...row, kind: "category" };
  }
  if (w.op !== "create") throw new Error("a create was expected");
  const { extraCategoryIds, ...fields } = w.payload;
  const row = await prisma.product.create({ data: { ...fields, images: "[]", extraCategories: { create: extraCategoryIds.map((categoryId) => ({ categoryId })) } } });
  return { ...row, kind: "product" };
}

/** The fixture shop's categories and its one simple product in the columns, as the importer's verdict means them to be. */
async function importShop(): Promise<void> {
  const snap = wooSnapshot();
  const { categories, products } = mapWooCatalog(snap, await htmlDecoder());
  const view = new WooView({ categories: [], products: [] });
  const sources: WooSrc[] = [...categories.map((row): WooSrc => ({ kind: "category", row })), ...products.filter((p) => p.externalId === "101").map((row): WooSrc => ({ kind: "product", row, type: "simple" }))];
  for (const src of sources) {
    const d = decide(src, view, undefined, STOCK);
    if (!d.write) throw new Error(`${src.kind} ${src.row.externalId}: ${d.action} ${d.reason ?? ""}`);
    view.record(undefined, await write(d.write));
  }
}

async function plan(): Promise<WooPlanSummary> {
  const r = await invokeTool("migration.woo_plan", { sourcePricesIncludeVat: true }, CTX, ["settings:read"] as never);
  if (!r.ok) throw new Error(r.error);
  return r.result as WooPlanSummary;
}
const issue = (s: WooPlanSummary, kind: string, externalId: string) => s.issues.first.find((i) => i.kind === kind && i.externalId === externalId);

describe.skipIf(!sqlite)("migration.woo_plan on real columns", () => {
  it("every row the importer's verdict wrote reads back unchanged, with a price, secondary categories and a NULL description among them", async () => {
    await importShop();
    expect(await prisma.category.count({ where: { description: null } })).toBe(3);
    expect(await prisma.productCategory.count()).toBe(2);
    const s = await plan();
    expect(s.counts.categories).toMatchObject({ unchanged: 4, create: 0, conflict: 0, update: 0 });
    expect(s.counts.products).toMatchObject({ unchanged: 1, skip: 2, create: 0, conflict: 0, update: 0 });
  });

  it("an edit here reads as a difference the plan cannot place: a conflict, on the row edited and no other", async () => {
    await importShop();
    await prisma.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "101" } }, data: { name: "Edited here" } });
    const s = await plan();
    expect(issue(s, "product", "101")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^noBaseline: /), dbId: expect.any(String) });
    expect(s.counts.products.unchanged).toBe(0);
    expect(s.counts.categories.unchanged).toBe(4);
  });

  it.each<[string, (id: string) => Promise<unknown>]>([
    ["a price edited here", (id) => prisma.product.update({ where: { id }, data: { priceDkk: 1 } })],
    ["a description edited here", (id) => prisma.product.update({ where: { id }, data: { description: "Edited" } })],
    ["a summary edited here", (id) => prisma.product.update({ where: { id }, data: { answerSummary: "Edited" } })],
    ["attributes edited here", (id) => prisma.product.update({ where: { id }, data: { attributes: { tags: ["edited"] } } })],
    ["filed under another primary category here", async (id) => {
      const other = await prisma.category.findFirstOrThrow({ where: { externalId: "20" } });
      return prisma.product.update({ where: { id }, data: { categoryId: other.id } });
    }],
    ["a secondary category removed here", (id) => prisma.productCategory.deleteMany({ where: { productId: id, category: { externalId: "12" } } })],
  ])("every owned column is read: %s is a difference", async (_label, edit) => {
    await importShop();
    const { id } = await prisma.product.findFirstOrThrow({ where: { externalId: "101" } });
    await edit(id);
    expect(issue(await plan(), "product", "101")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^noBaseline: /) });
  });

  it("a category's own columns are read too: its parent, its name, its description", async () => {
    await importShop();
    const [lamper, messing, skaerme] = await Promise.all(["10", "12", "20"].map((externalId) => prisma.category.findFirstOrThrow({ where: { externalId } })));
    await prisma.category.update({ where: { id: messing.id }, data: { parentId: skaerme.id } });
    await prisma.category.update({ where: { id: skaerme.id }, data: { name: "Edited" } });
    await prisma.category.update({ where: { id: lamper.id }, data: { description: "Edited" } });
    const s = await plan();
    for (const id of ["10", "12", "20"]) expect(issue(s, "category", id), id).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^noBaseline: /) });
    expect(s.counts.categories.unchanged).toBe(1);
  });

  it("a product soft-deleted here is a skip, seen in its deletedAt, and the row is not touched", async () => {
    await importShop();
    await prisma.product.update({ where: { source_externalId: { source: "woocommerce", externalId: "101" } }, data: { deletedAt: new Date("2026-10-01T00:00:00Z") } });
    const s = await plan();
    expect(issue(s, "product", "101")).toMatchObject({ action: "skip", reason: expect.stringMatching(/^deletedHere: /) });
    expect(await prisma.product.count({ where: { externalId: "101", deletedAt: { not: null } } })).toBe(1);
  });

  it("the tree here is read from its parentId: a loop above a new row's parent blocks the row", async () => {
    await importShop();
    await prisma.product.deleteMany({});
    const [lamper, skaerme] = await Promise.all(["10", "20"].map((externalId) => prisma.category.findFirstOrThrow({ where: { externalId } })));
    await prisma.category.delete({ where: { source_externalId: { source: "woocommerce", externalId: "12" } } });
    await prisma.category.delete({ where: { source_externalId: { source: "woocommerce", externalId: "11" } } });
    await prisma.category.update({ where: { id: lamper.id }, data: { parentId: skaerme.id } });
    await prisma.category.update({ where: { id: skaerme.id }, data: { parentId: lamper.id } });
    const s = await plan();
    expect(issue(s, "category", "11")).toMatchObject({ action: "blocked", reason: expect.stringMatching(/^parentLoop: /) });
  });

  it("a key held by a row that is not ours stays a conflict, and writes nothing to the catalogue", async () => {
    const category = await prisma.category.create({ data: { slug: "hand", name: "Hand", source: "csv" } });
    await prisma.product.create({ data: { slug: "bordlampe-ida", name: "Hand", description: "", priceDkk: 1, images: "[]", categoryId: category.id } });
    const before = await prisma.product.findMany();
    const s = await plan();
    expect(issue(s, "product", "101")).toMatchObject({ action: "conflict", reason: expect.stringMatching(/^keyTaken: slug "bordlampe-ida" is taken by a hand-made product /) });
    expect(await prisma.product.findMany()).toEqual(before);
    expect(await prisma.category.count()).toBe(1);
  });
});
