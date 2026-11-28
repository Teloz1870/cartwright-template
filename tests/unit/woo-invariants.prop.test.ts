import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import { permalinkKey } from "@/lib/urls";
import { applyWooImport, type WooApplyDeps } from "@/lib/woo/apply";
import { parseWooImportArgs, type WooImportReport } from "@/lib/woo/run-import";
import type { WooStock } from "@/lib/woo/types";
import { BUILT_SHOP, builtTransport, type BuiltShop } from "./woo-shop-builder";

/**
 * W21-live-2 INV-0, the oracle (spec 2026-10-25 §2, §6): after ANY `--apply`, also with
 * edits made here before its chunks, the tree has no loop (INV-12), every row the run
 * wrote is filed as the source says (INV-13), no address has two holders across the two
 * tables (INV-14), every edit made here before or during the run is still there (INV-7,
 * INV-8), the report's counts are the database's, and a run after a run with nothing new
 * writes nothing and opens no transaction (INV-22). 200 seeds, chunks of 3: a random tree
 * of at most 12 categories and at most 30 products with secondary categories, random
 * changes in the shop between runs, and random edits here before random chunks.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const INIT = join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql");
const sqlite = existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));
const SEEDS = 200;
const APPLY = parseWooImportArgs(["--apply", "--source-prices-include-vat", "yes"]);
const WOO = "woocommerce";

/** mulberry32: the same seed, the same shop and the same edits. */
function random(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return { chance: (p: number) => next() < p, int, pick: <T,>(xs: readonly T[]): T => xs[int(xs.length)] };
}
type Random = ReturnType<typeof random>;

function stockOf(r: Random): Partial<WooStock> {
  return r.pick<Partial<WooStock>>([
    { manage_stock: true, stock_quantity: r.int(12) - 3, backorders: "no" },
    { manage_stock: true, stock_quantity: r.int(12) - 3, backorders: "notify" },
    { manage_stock: false, stock_quantity: null, stock_status: "instock" },
    { manage_stock: false, stock_quantity: null, stock_status: "outofstock" },
    { manage_stock: true, stock_quantity: 1.5, backorders: "no" },
  ]);
}

function newShop(r: Random): BuiltShop {
  const categories = Array.from({ length: 1 + r.int(12) }, (_, i) => ({ id: 100 + i, slug: `c${i}`, name: `C${i}`, parent: i > 0 && r.chance(0.6) ? 100 + r.int(i) : 0 }));
  const shop: BuiltShop = { categories, products: [], stock: {} };
  for (let j = 0; j < r.int(31); j++) addProduct(r, shop, 1000 + j);
  return shop;
}

function addProduct(r: Random, shop: BuiltShop, id: number): void {
  const ids = shop.categories.map((c) => c.id);
  const cats = r.chance(0.05) ? [] : [...new Set(Array.from({ length: 1 + r.int(3) }, () => r.pick(ids)))];
  const sku = r.chance(0.3) ? undefined : r.chance(0.05) ? "DUP" : `S${id}`;
  shop.products.push({ id, slug: `p${id}`, name: `P${id}`, sku, cats, price: r.chance(0.05) ? "" : String(100 * (1 + r.int(900))) });
  (shop.stock ??= {})[id] = stockOf(r);
}

/** What the shop changes between two runs. */
function changeShop(r: Random, shop: BuiltShop): void {
  for (const c of shop.categories) {
    if (r.chance(0.15)) c.name = `${c.name}'`;
    // Any parent, a later one too: the source may hold a loop, and an orphan says so.
    if (r.chance(0.1)) c.parent = r.chance(0.3) ? 0 : r.pick(shop.categories).id;
  }
  if (r.chance(0.3) && shop.categories.length < 12) shop.categories.push({ id: 100 + shop.categories.length, slug: `c${shop.categories.length}`, name: "New", parent: r.pick(shop.categories).id });
  for (const p of shop.products) {
    if (r.chance(0.15)) p.name = `${p.name}'`;
    if (r.chance(0.1)) p.price = String(100 * (1 + r.int(900)));
    if (r.chance(0.05)) p.slug = `${p.slug}-x`;
    if (r.chance(0.1)) p.cats = [...new Set([r.pick(shop.categories).id, ...p.cats])];
  }
  for (let k = r.int(4); k > 0; k--) addProduct(r, shop, 2000 + shop.products.length);
}

/** Edits made here, by row and field, and what must still read so after the run: a later edit of the same field replaces an earlier one, and a delete every one of its row. */
type Kept = Map<string, { what: string; check: (db: PrismaClient) => Promise<boolean> }>;
const keep = (kept: Kept, id: string, field: string, what: string, check: (db: PrismaClient) => Promise<boolean>) => kept.set(`${id} ${field}`, { what, check });

/** Products deleted here during a run, by Woo id. */
type Deleted = { product: number; ids: Set<string> };

/** Edits made here before a chunk: each returns what must hold after the run, or null when there was nothing to edit. */
async function editHere(r: Random, db: PrismaClient, shop: BuiltShop, kept: Kept, deleted: Deleted): Promise<void> {
  const ours = await db.product.findMany({ where: { source: WOO }, select: { id: true, deletedAt: true } });
  const cats = await db.category.findMany({ where: { source: WOO }, select: { id: true } });
  const roll = r.int(6);
  if (roll === 0 && ours.length) {
    const { id } = r.pick(ours);
    const name = `edited ${r.int(1000)}`;
    await db.product.update({ where: { id }, data: { name } });
    keep(kept, id, "name", `product ${id} named ${name}`, async (d) => (await d.product.findUnique({ where: { id } }))?.name === name);
  } else if (roll === 1 && ours.length) {
    const { id } = r.pick(ours);
    const priceDkk = 1 + r.int(99_999);
    await db.product.update({ where: { id }, data: { priceDkk } });
    keep(kept, id, "price", `product ${id} priced ${priceDkk}`, async (d) => (await d.product.findUnique({ where: { id } }))?.priceDkk === priceDkk);
  } else if (roll === 2 && ours.length) {
    const { id, deletedAt } = r.pick(ours);
    const at = deletedAt ?? new Date(Date.UTC(2026, 10, 1 + r.int(20)));
    // What only an import writes: a soft-deleted row keeps it as it was when deleted.
    const keys = { slug: true, permalink: true, categoryId: true, sku: true } as const;
    const shown = (row: { slug: string; permalink: string | null; categoryId: string; sku: string | null }) => JSON.stringify([row.slug, row.permalink, row.categoryId, row.sku]);
    const was = shown(await db.product.update({ where: { id }, data: { deletedAt: at }, select: keys }));
    keep(kept, id, "deletedAt", `product ${id} soft-deleted, and not written since`, async (d) => {
      const now = await d.product.findUnique({ where: { id }, select: { ...keys, deletedAt: true } });
      return now?.deletedAt?.getTime() === at.getTime() && shown(now) === was;
    });
  } else if (roll === 3 && ours.length) {
    const row = await db.product.findUniqueOrThrow({ where: { id: r.pick(ours).id }, select: { id: true, externalId: true } });
    await db.product.delete({ where: { id: row.id } });
    deleted.product++;
    deleted.ids.add(row.externalId ?? "");
    for (const key of [...kept.keys()]) if (key.startsWith(`${row.id} `)) kept.delete(key);
    keep(kept, row.id, "deleted", `product ${row.externalId} deleted`, async (d) => (await d.product.count({ where: { source: WOO, externalId: row.externalId } })) === 0);
  } else if (roll === 4 && cats.length) {
    const { id } = r.pick(cats);
    const name = `edited ${r.int(1000)}`;
    await db.category.update({ where: { id }, data: { name } });
    keep(kept, id, "name", `category ${id} named ${name}`, async (d) => (await d.category.findUnique({ where: { id } }))?.name === name);
  } else if (roll === 5) {
    // A hand-made row takes a key a source row wants, if nobody holds it yet.
    const p = r.pick<{ slug: string }>(shop.products.length ? shop.products : [{ slug: "none" }]);
    const c = r.pick(shop.categories);
    try {
      const hand = await db.category.create({ data: { name: "Hand", slug: r.chance(0.5) ? c.slug : `hand-${r.int(1e6)}` } });
      if (r.chance(0.5)) await db.product.create({ data: { name: "Hand", slug: p.slug, description: "", priceDkk: 1, images: "[]", categoryId: hand.id } });
      keep(kept, hand.id, "source", `hand-made ${hand.id}`, async (d) => (await d.category.findUnique({ where: { id: hand.id } }))?.source === null);
    } catch {
      // Taken already: nothing to claim.
    }
  }
}

async function checkInvariants(db: PrismaClient, shop: BuiltShop, report: WooImportReport, kept: Kept, before: { categories: number; products: number }, deleted: Deleted): Promise<string[]> {
  const failures: string[] = [];
  const apply = report.apply;
  if (!apply) return ["no apply"];
  if (apply.stopped !== null) failures.push(`stopped: ${apply.stopped}`);
  // Every failure counts: an edit here after a row's chunk committed is an edit the run keeps (`editedAfterCommit`), not a failed run.
  if (!apply.postconditions.ok) failures.push(`postconditions: ${apply.postconditions.failures.join("; ")}`);
  // A row named as edited after its commit is one this run wrote, in a run that had edits made here.
  const wrote = new Set(apply.rows.filter((x) => x.outcome === "written").map((x) => `${x.kind} ${x.externalId}`));
  for (const row of apply.editedAfterCommit) if (kept.size === 0 || !wrote.has(row)) failures.push(`${row} is named as edited after its commit`);
  const categories = await db.category.findMany();
  const products = await db.product.findMany({ include: { category: true, extraCategories: { include: { category: true } } } });
  // INV-12
  const parent = new Map(categories.map((c) => [c.id, c.parentId]));
  for (const c of categories) {
    const seen = new Set<string>();
    for (let at: string | null = c.id; at !== null; at = parent.get(at) ?? null) {
      if (seen.has(at)) {
        failures.push(`category ${c.externalId ?? c.id} loops`);
        break;
      }
      seen.add(at);
    }
  }
  // INV-14
  const keys = [...categories, ...products].flatMap((row) => (row.permalink ? [permalinkKey(row.permalink)] : []));
  for (const key of new Set(keys)) if (keys.filter((k) => k === key).length > 1) failures.push(`permalink ${key} has two holders`);
  // INV-13, for the rows this run wrote
  const ext = new Map(categories.map((c) => [c.id, c.source === WOO ? c.externalId : null]));
  for (const row of apply.rows.filter((x) => x.outcome === "written")) {
    if (row.kind === "category") {
      const src = shop.categories.find((c) => String(c.id) === row.externalId);
      const here = categories.find((c) => c.source === WOO && c.externalId === row.externalId);
      const parentExt = here?.parentId ? ext.get(here.parentId) : null;
      if (!src || !here || (parentExt ?? "0") !== String(src.parent ?? 0)) failures.push(`category ${row.externalId} is not filed as the source says`);
    } else {
      const src = shop.products.find((p) => String(p.id) === row.externalId);
      const here = products.find((p) => p.source === WOO && p.externalId === row.externalId);
      if (!here && deleted.ids.has(row.externalId)) continue;
      const extras = here?.extraCategories.map((l) => Number(l.category.externalId)) ?? [];
      if (!src || !here || here.category.externalId !== String(src.cats[0]) || extras.some((id) => !src.cats.slice(1).includes(id))) failures.push(`product ${row.externalId} is not filed as the source says`);
    }
  }
  // INV-7, INV-8
  for (const k of kept.values()) if (!(await k.check(db))) failures.push(`an edit here was not kept: ${k.what}`);
  // The report's counts are the database's: the run deletes nothing, so what it created is what was added.
  const created = (kind: string) => apply.rows.filter((x) => x.kind === kind && x.outcome === "written" && x.action === "create").length;
  const ours = { categories: categories.filter((c) => c.source === WOO).length, products: products.filter((p) => p.source === WOO).length };
  if (ours.categories - before.categories !== created("category")) failures.push(`categories: ${created("category")} created, ${ours.categories - before.categories} added`);
  if (ours.products - before.products + deleted.product !== created("product")) failures.push(`products: ${created("product")} created, ${ours.products - before.products + deleted.product} added`);
  return failures;
}

describe.skipIf(!sqlite)("INV-0 — the oracle, over seeded shops and edits made here", () => {
  let dir = "";
  beforeAll(() => void (dir = mkdtempSync(join(tmpdir(), "cw-woo-prop-"))));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);
  // Forty seeds a test, so a slow machine meets one test's timeout and not all 200's.
  it.each(Array.from({ length: SEEDS / 40 }, (_, i) => [seeds[i * 40], seeds.slice(i * 40, i * 40 + 40)] as const))("seeds %i to %i + 39", async (_first, block) => {
    const failed: string[] = [];
    for (const seed of block) {
      const r = random(seed);
      const url = `file:${join(dir, `s${seed}.db`)}`;
      const raw = createClient({ url });
      await raw.executeMultiple(readFileSync(INIT, "utf8"));
      raw.close();
      const db = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
      const admin = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
      try {
        await db.migrationProject.create({ data: { sourceUrl: BUILT_SHOP } });
        const shop = newShop(r);
        const deps = (hooks?: WooApplyDeps["hooks"]): WooApplyDeps => ({
          db,
          dialect: "sqlite",
          policy: { currency: "DKK", pricesIncludeVat: true },
          client: { siteUrl: "https://new.example.test", auth: { user: "ck", pass: "cs" }, transport: builtTransport(() => shop), assertHostPublic: async () => {}, sleep: async () => {} },
          chunkSize: 3,
          ...(hooks && { hooks }),
        });
        const count = async () => ({ categories: await db.category.count({ where: { source: WOO } }), products: await db.product.count({ where: { source: WOO } }) });
        const fails: string[] = [];
        // Run 1 on an empty catalogue; run 2 after the shop changed, with edits here before random chunks; run 3 with nothing new.
        for (const [run, edits] of [[1, false], [2, true], [3, false]] as const) {
          if (run === 2) changeShop(r, shop);
          const kept: Kept = new Map();
          const deleted: Deleted = { product: 0, ids: new Set() };
          const before = await count();
          if (edits && r.chance(0.5)) await editHere(r, admin, shop, kept, deleted);
          const hooks = edits ? { beforeChunk: async () => void (r.chance(0.3) && (await editHere(r, admin, shop, kept, deleted))) } : undefined;
          const report = await applyWooImport(APPLY, deps(hooks));
          fails.push(...(await checkInvariants(db, shop, report, kept, before, deleted)).map((f) => `run ${run}: ${f}`));
        }
        // INV-22: after a run with nothing new, one more opens no transaction and writes nothing.
        let chunks = 0;
        const last = await applyWooImport(APPLY, deps({ beforeChunk: async () => void chunks++ }));
        if (chunks !== 0 || last.apply?.rows.length !== 0) fails.push(`idempotent: ${chunks} chunks, rows ${JSON.stringify(last.apply?.rows.slice(0, 3))}`);
        failed.push(...fails.map((f) => `seed ${seed} ${f}`));
      } finally {
        await db.$disconnect();
        await admin.$disconnect();
        rmSync(join(dir, `s${seed}.db`), { force: true });
      }
    }
    expect(failed).toEqual([]);
  }, 120_000);
});
