import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import { applyWooImport, auditedWooImport, type WooApplyDeps, type WooAuditWrap } from "@/lib/woo/apply";
import type { WooTransport } from "@/lib/woo/client";
import { groupFp } from "@/lib/woo/groups";
import { readFullView } from "@/lib/woo/read-view";
import { formatReport } from "@/lib/woo/report";
import { parseWooImportArgs, previewWooImport, type WooImportReport } from "@/lib/woo/run-import";
import type { WooStoreCategory } from "@/lib/woo/types";
import { fixtureTransport, type RecordedCall } from "./woo-fixture-shop";

/**
 * W21-live-2a-4 — `--apply --scope categories` (lib/woo/apply.ts, spec 2026-10-25
 * §3F) on a real libSQL file built from the init migration, the fixture shop
 * (Lamper › Bordlamper › Messing, and Skærme) behind a fake transport, and a
 * second PrismaClient on the same file as the admin who edits between chunks.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const INIT = join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql");
const sqlite = existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const SHOP = "https://shop.example.test";
const APPLY = ["--apply", "--scope", "categories"];

let dir = "";
let prisma: PrismaClient;
let admin: PrismaClient;
let calls: RecordedCall[];

type Shop = (c: WooStoreCategory) => WooStoreCategory;
function shop(category?: Shop): WooTransport {
  const fixture = fixtureTransport(calls);
  return async (raw, init) => {
    const answer = await fixture(raw, init);
    if (!category || !new URL(raw).pathname.endsWith("/wc/store/v1/products/categories")) return answer;
    return Response.json(((await answer.json()) as WooStoreCategory[]).map(category), { headers: answer.headers });
  };
}

const deps = (category?: Shop, more: Partial<WooApplyDeps> = {}): WooApplyDeps => ({
  db: prisma,
  dialect: "sqlite",
  policy: { currency: "DKK", pricesIncludeVat: true },
  client: { siteUrl: "https://new.example.test", transport: shop(category), assertHostPublic: async () => {}, sleep: async () => {} },
  ...more,
});
const apply = (category?: Shop, more: Partial<WooApplyDeps> = {}, argv: readonly string[] = APPLY) => applyWooImport(parseWooImportArgs(argv), deps(category, more));
const outcomes = (r: WooImportReport) => r.apply?.rows.map((row) => `${row.externalId} ${row.outcome}${row.reason ? ` ${row.reason.split(":")[0]}` : ""}`);
const ledger = async () => ((await prisma.migrationProject.findFirstOrThrow()).settings as { wooImport: { lease: { runId: string; heartbeatAt: string } | null; categories: Record<string, { rowId: string; groups: { core: { saw: string; wrote: string } } }> } }).wooImport;
const ours = () => prisma.category.findMany({ where: { source: "woocommerce" }, orderBy: { externalId: "asc" }, select: { externalId: true, name: true, slug: true, parentId: true } });
const byExt = async (ext: string) => prisma.category.findUnique({ where: { source_externalId: { source: "woocommerce", externalId: ext } } });
const rename = (id: number, name: string): Shop => (c) => (c.id === id ? { ...c, name } : c);

describe.skipIf(!sqlite)("applyWooImport — the write path, on a real file", () => {
  beforeEach(async () => {
    calls = [];
    dir = mkdtempSync(join(tmpdir(), "cw-woo-apply-"));
    const url = `file:${join(dir, "shop.db")}`;
    const raw = createClient({ url });
    await raw.executeMultiple(readFileSync(INIT, "utf8"));
    raw.close();
    prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
    admin = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
    await prisma.migrationProject.create({ data: { sourceUrl: SHOP } });
  });
  afterEach(async () => {
    await prisma.$disconnect();
    await admin.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it("the first apply writes the tree parents first, with each row's baseline as read back, revalidates each page and gives the lease back", async () => {
    const paths: string[] = [];
    const r = await apply(undefined, { revalidate: (p) => paths.push(p) });
    expect(outcomes(r)).toEqual(["10 written", "20 written", "11 written", "12 written"]);
    expect(r.apply).toMatchObject({ stopped: null, postconditions: { ok: true }, cache: "all", counts: { written: 4, rolledBack: 0 } });
    const rows = await ours();
    expect(rows.map((c) => [c.externalId, c.slug])).toEqual([["10", "lamper"], ["11", "bordlamper"], ["12", "messing"], ["20", "skaerme"]]);
    expect((await byExt("12"))?.parentId).toBe((await byExt("11"))?.id);
    expect((await byExt("11"))?.parentId).toBe((await byExt("10"))?.id);
    const { lease, categories } = await ledger();
    expect(lease).toBeNull();
    expect(Object.keys(categories).sort()).toEqual(["10", "11", "12", "20"]);
    for (const entry of Object.values(categories)) expect(entry.groups.core.saw).toBe(entry.groups.core.wrote);
    expect(paths.sort()).toEqual(["/category/bordlamper", "/category/lamper", "/category/messing", "/category/skaerme"]);
    expect(formatReport(r).split("\n")).toEqual(expect.arrayContaining([
      "applied: written 4, refreshed 0, refused 0, rolledBack 0, notAttempted 0",
      "postconditions: ok",
      "cache: 4 pages revalidated",
    ]));
  });

  it("a second apply is idempotent: no write, no revalidate, and the next preview says unchanged", async () => {
    await apply();
    const before = { rows: await ours(), categories: (await ledger()).categories };
    const paths: string[] = [];
    const r = await apply(undefined, { revalidate: (p) => paths.push(p) });
    expect(r.apply?.rows).toEqual([]);
    expect(paths).toEqual([]);
    expect({ rows: await ours(), categories: (await ledger()).categories }).toEqual(before);
    const preview = await previewWooImport(parseWooImportArgs(["--scope", "categories"]), deps());
    expect(preview.plan.counts.categories).toMatchObject({ unchanged: 4, create: 0, update: 0 });
  });

  it("a converged row with no baseline gets its baseline in a transaction that writes no category", async () => {
    await apply();
    const rows = await prisma.category.findMany({ orderBy: { id: "asc" } });
    const project = await prisma.migrationProject.findFirstOrThrow();
    const wooImport = { ...(await ledger()), categories: {} };
    await prisma.migrationProject.update({ where: { id: project.id }, data: { settings: { wooImport } } });
    const r = await apply();
    expect(outcomes(r)).toEqual(["10 refreshed", "20 refreshed", "11 refreshed", "12 refreshed"]);
    expect(r.apply?.paths).toEqual([]);
    expect(await prisma.category.findMany({ orderBy: { id: "asc" } })).toEqual(rows);
    const { categories } = await ledger();
    expect(Object.keys(categories).sort()).toEqual(["10", "11", "12", "20"]);
    expect(categories["10"].rowId).toBe((await byExt("10"))?.id);
  });

  it("an edit made between the preview and the chunk is kept: the chunk decides again over what it read after its lock", async () => {
    await apply();
    const entry = (await ledger()).categories["10"];
    const r = await apply(rename(10, "Lys"), { hooks: { beforeChunk: async () => void (await admin.category.update({ where: { source_externalId: { source: "woocommerce", externalId: "10" } }, data: { name: "Edited here" } })) } });
    expect(r.plan.categories.find((c) => c.externalId === "10")?.action).toBe("update");
    expect(outcomes(r)).toEqual(["10 refused bothChanged"]);
    expect((await byExt("10"))?.name).toBe("Edited here");
    expect((await ledger()).categories["10"]).toEqual(entry);
  });

  it("a late slug claim by a hand-made row refuses that row alone, and its children with it: no child, no baseline", async () => {
    const claim = async () => void (await admin.category.create({ data: { name: "Hand-made", slug: "lamper" } }));
    const r = await apply(undefined, { hooks: { beforeChunk: claim } });
    expect(outcomes(r)).toEqual(["10 refused keyTaken", "20 written", "11 refused dependencyMissing", "12 refused dependencyMissing"]);
    expect((await ours()).map((c) => c.externalId)).toEqual(["20"]);
    expect(Object.keys((await ledger()).categories)).toEqual(["20"]);
    expect(r.apply?.paths).toEqual(["/category/skaerme"]);
  });

  it("a category deleted here, before the run or between the preview and the chunk, is never created again", async () => {
    await apply();
    await prisma.category.delete({ where: { source_externalId: { source: "woocommerce", externalId: "12" } } });
    const before = await apply();
    expect(before.plan.categories.find((c) => c.externalId === "12")).toMatchObject({ action: "skip", reason: expect.stringMatching(/^deletedHere/) });
    expect(await byExt("12")).toBeNull();
    // Mid-run: the preview plans an update of 11, and the admin deletes it before its chunk.
    const del = async () => void (await admin.category.delete({ where: { source_externalId: { source: "woocommerce", externalId: "11" } } }));
    const r = await apply(rename(11, "Bordlamper ny"), { hooks: { beforeChunk: del } });
    expect(outcomes(r)).toEqual(["11 refused deletedHere"]);
    expect(await byExt("11")).toBeNull();
    expect((await ledger()).categories["11"]).toBeDefined();
  });

  it("a scope that leaves a row out cannot close a loop: in the preview, nor when the tree changes before the chunk", async () => {
    await apply();
    const tree = await ours();
    // The source swaps 10 and 11; only 10 is applied, so 10 under 11 would loop.
    const flip: Shop = (c) => (c.id === 10 ? { ...c, parent: 11 } : c.id === 11 ? { ...c, parent: 0 } : c);
    const partial = await apply(flip, {}, [...APPLY, "--only", "10"]);
    expect(partial.plan.categories).toMatchObject([{ externalId: "10", action: "blocked", reason: expect.stringMatching(/^parentLoop/) }]);
    expect(partial.apply?.rows).toEqual([]);
    // The source moves 10 under 20; before the chunk the admin moves 20 under 12, so 10 → 20 → 12 → 11 → 10.
    const under20: Shop = (c) => (c.id === 10 ? { ...c, parent: 20 } : c);
    const move = async () => {
      const twelve = await admin.category.findUniqueOrThrow({ where: { source_externalId: { source: "woocommerce", externalId: "12" } } });
      await admin.category.update({ where: { source_externalId: { source: "woocommerce", externalId: "20" } }, data: { parentId: twelve.id } });
    };
    const r = await apply(under20, { hooks: { beforeChunk: move } }, [...APPLY, "--only", "10"]);
    expect(r.plan.categories[0]).toMatchObject({ externalId: "10", action: "update" });
    expect(outcomes(r)).toEqual(["10 refused parentLoop"]);
    expect((await byExt("10"))?.parentId).toBeNull();
    expect((await ours()).filter((c) => c.externalId !== "20")).toEqual(tree.filter((c) => c.externalId !== "20"));
  });

  it("a chunk that rolls back leaks no id, path or baseline into the run; the chunk before it stays", async () => {
    const paths: string[] = [];
    const fail = async (n: number) => {
      if (n === 1) throw new Error("injected");
    };
    const r = await apply(undefined, { chunkSize: 2, revalidate: (p) => paths.push(p), hooks: { beforeCommit: fail } });
    expect(outcomes(r)).toEqual(["10 written", "20 written", "11 rolledBack", "12 rolledBack"]);
    expect(r.apply?.stopped).toBe("Error: injected");
    expect((await ours()).map((c) => c.externalId)).toEqual(["10", "20"]);
    expect(Object.keys((await ledger()).categories).sort()).toEqual(["10", "20"]);
    expect(paths.sort()).toEqual(["/category/lamper", "/category/skaerme"]);
    expect(r.apply?.paths.sort()).toEqual(paths);
    expect((await ledger()).lease).toBeNull();
  });

  it("a stopped run says what came of each row, records ok:false in the audit and still returns its report", async () => {
    const audits: { ok: boolean; tool: string; error?: string }[] = [];
    const wrap: WooAuditWrap = async (meta, handler) => {
      try {
        const out = await handler();
        audits.push({ ok: true, tool: meta.tool });
        return out;
      } catch (error) {
        audits.push({ ok: false, tool: meta.tool, error: String(error) });
        throw error;
      }
    };
    const fail = async (n: number) => {
      if (n === 1) throw new Error("injected");
    };
    const args = parseWooImportArgs(APPLY);
    const r = await auditedWooImport(wrap, args, () => applyWooImport(args, deps(undefined, { chunkSize: 1, hooks: { beforeCommit: fail } })));
    expect(outcomes(r)).toEqual(["10 written", "20 rolledBack", "11 notAttempted", "12 notAttempted"]);
    expect(r.apply?.counts).toEqual({ written: 1, refreshed: 0, refused: 0, rolledBack: 1, notAttempted: 2 });
    expect(audits).toEqual([{ ok: false, tool: "woo.import", error: expect.stringContaining("stopped: Error: injected") }]);
    expect(formatReport(r)).toContain("stopped: Error: injected");
    const clean = await auditedWooImport(wrap, args, () => applyWooImport(args, deps()));
    expect(clean.apply?.stopped).toBeNull();
    expect(audits.at(-1)).toEqual({ ok: true, tool: "woo.import" });
  });

  it("after a stop, rows that already agree are still recorded", async () => {
    await apply();
    const kept = await ledger();
    const wooImport = { ...kept, categories: { "20": kept.categories["20"] } };
    await prisma.migrationProject.updateMany({ data: { settings: { wooImport } } });
    // 20 renamed in the source needs a write; it rolls back, and the other three, which agree, still get their baseline.
    const fail = async (n: number) => {
      if (n === 0) throw new Error("injected");
    };
    const r = await apply(rename(20, "Skærme og lys"), { hooks: { beforeCommit: fail } });
    expect(outcomes(r)).toEqual(["20 rolledBack", "10 refreshed", "11 refreshed", "12 refreshed"]);
    expect(Object.keys((await ledger()).categories).sort()).toEqual(["10", "11", "12", "20"]);
    expect((await ledger()).categories["20"]).toEqual(kept.categories["20"]);
    expect((await byExt("20"))?.name).toBe("Skærme");
  });

  it.each([
    ["after a stop", true, ["20 rolledBack", "10 notAttempted the row needs a write, and after a stop this run only records rows that agree"]],
    ["with no stop", false, ["20 written", "10 notAttempted the row changed after the preview and needs a write now; run the import again"]],
  ])("%s, a row the admin moved back to what the last run wrote is not written by a refresh, and the reason says why", async (_label, stop, expected) => {
    await apply();
    const owned = (await readFullView(prisma, "sqlite")).own("category", "10")?.owned;
    if (!owned) throw new Error("10 did not read back");
    const kept = await ledger();
    // 10's baseline says the last run wrote "Old" and the source said so: the row agrees with the source now, so it is a refresh.
    const old = groupFp("category", "core", { ...owned, name: "Old" });
    const categories = { ...kept.categories, "10": { ...kept.categories["10"], groups: { core: { saw: old, wrote: old } } } };
    await prisma.migrationProject.updateMany({ data: { settings: { wooImport: { ...kept, categories } } } });
    const hooks = {
      beforeCommit: async (n: number) => {
        if (stop && n === 0) throw new Error("injected");
      },
      // Before the refresh chunk, the admin puts back "Old": 10 now reads as a source change, a write.
      beforeChunk: async (n: number) => void (n === 1 && (await admin.category.update({ where: { source_externalId: { source: "woocommerce", externalId: "10" } }, data: { name: "Old" } }))),
    };
    const r = await apply(rename(20, "Skærme og lys"), { hooks });
    expect(r.plan.categories.find((c) => c.externalId === "10")).toMatchObject({ action: "unchanged", refresh: ["core"] });
    expect(outcomes(r)).toEqual(expected);
    expect((await byExt("10"))?.name).toBe("Old");
  });

  it("a permalink held in another spelling is seen under the chunk's lock: that row is refused in the transaction, with no commit and no baseline", async () => {
    // Same permalinkKey as category 10's "/lamper/", in a spelling no list of variants would hold.
    const claim = async () => {
      const { id } = await admin.category.create({ data: { name: "Hand-made", slug: "hand-made" } });
      await admin.product.create({ data: { slug: "p", name: "P", description: "", priceDkk: 1, images: "[]", categoryId: id, permalink: "https://elsewhere.example/lamper/" } });
    };
    const r = await apply(undefined, { hooks: { beforeChunk: claim } });
    expect(r.plan.categories[0]).toMatchObject({ externalId: "10", action: "create" });
    expect(outcomes(r)).toEqual(["10 refused keyTaken", "20 written", "11 refused dependencyMissing", "12 refused dependencyMissing"]);
    expect(await byExt("10")).toBeNull();
    expect(Object.keys((await ledger()).categories)).toEqual(["20"]);
    expect(r.apply?.postconditions).toEqual({ ok: true, failures: [] });
  });

  it("the read after the run checks every row of ours, not only those it wrote: a re-run over a shared permalink is not ok", async () => {
    await apply();
    const { id } = await prisma.category.create({ data: { name: "Hand-made", slug: "hand-made" } });
    await prisma.product.create({ data: { slug: "p", name: "P", description: "", priceDkk: 1, images: "[]", categoryId: id, permalink: "https://elsewhere.example/lamper/" } });
    const audits: boolean[] = [];
    const wrap: WooAuditWrap = (_meta, handler) => handler().then((out) => (audits.push(true), out), (error: unknown) => (audits.push(false), Promise.reject(error)));
    const args = parseWooImportArgs(APPLY);
    const r = await auditedWooImport(wrap, args, () => applyWooImport(args, deps()));
    expect(r.apply?.rows.filter((row) => row.outcome === "written")).toEqual([]);
    expect(r.apply?.postconditions).toEqual({ ok: false, failures: [expect.stringMatching(/^category 10: permalink "\/lamper\/" is also held by product /)] });
    expect(audits).toEqual([false]);
    expect(formatReport(r)).toContain("postconditions: FAILED, category 10: permalink");
  });

  it("an audit that fails to write is not swallowed: an un-audited apply does not come back as a report", async () => {
    const wrap: WooAuditWrap = async (_meta, handler) => {
      await handler();
      throw new Error("AuditLog write failed");
    };
    const args = parseWooImportArgs(APPLY);
    await expect(auditedWooImport(wrap, args, () => applyWooImport(args, deps()))).rejects.toThrow("AuditLog write failed");
  });

  it("a lost lease stops the run, and nothing after it is attempted, refreshes included", async () => {
    await apply();
    const kept = await ledger();
    await prisma.migrationProject.updateMany({ data: { settings: { wooImport: { ...kept, categories: { "20": kept.categories["20"] } } } } });
    const takeOver = async (n: number) => {
      if (n !== 0) return;
      const project = await admin.migrationProject.findFirstOrThrow();
      const now = (project.settings as { wooImport: object }).wooImport;
      await admin.migrationProject.update({ where: { id: project.id }, data: { settings: { wooImport: { ...now, lease: { runId: "other-run", heartbeatAt: new Date().toISOString() } } } } });
    };
    const r = await apply(rename(20, "Skærme og lys"), { hooks: { beforeChunk: takeOver } });
    expect(r.apply?.stopped).toMatch(/^LeaseLost: /);
    expect(outcomes(r)).toEqual(["20 rolledBack", "10 notAttempted", "11 notAttempted", "12 notAttempted"]);
    expect(Object.keys((await ledger()).categories)).toEqual(["20"]);
  });

  it("a chunk size below 1 is 1, never a run that hangs", async () => {
    const r = await apply(undefined, { chunkSize: 0 });
    expect(r.apply?.counts.written).toBe(4);
  });

  it("a throw after a commit keeps that chunk's rows and their baseline, and gives the lease back", async () => {
    const crash = async (n: number) => {
      if (n === 0) throw new Error("killed after commit");
    };
    await expect(apply(undefined, { chunkSize: 2, hooks: { afterCommit: crash } })).rejects.toThrow("killed after commit");
    expect((await ours()).map((c) => c.externalId)).toEqual(["10", "20"]);
    const { lease, categories } = await ledger();
    expect(Object.keys(categories).sort()).toEqual(["10", "20"]);
    expect(lease).toBeNull();
    expect(outcomes(await apply())).toEqual(["11 written", "12 written"]);
  });

  it("revalidates the old and the new page of a moved slug and no other; a throwing revalidate does not fail the run", async () => {
    await apply();
    const paths: string[] = [];
    const revalidate = (p: string) => {
      paths.push(p);
      if (p === "/category/bordlamper") throw new Error("not in a request");
    };
    const r = await apply((c) => (c.id === 11 ? { ...c, slug: "bordlamper-ny" } : c), { revalidate });
    expect(outcomes(r)).toEqual(["11 written"]);
    expect(paths).toEqual(["/category/bordlamper", "/category/bordlamper-ny"]);
    expect(r.apply).toMatchObject({ stopped: null, cache: "partial", postconditions: { ok: true } });
    expect((await byExt("11"))?.slug).toBe("bordlamper-ny");
  });

  it("a BUSY chunk runs again from the top, and lands once", async () => {
    let attempts = 0;
    const busy = async () => {
      if (attempts++ === 0) throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
    };
    const r = await apply(undefined, { hooks: { beforeCommit: busy } });
    expect(attempts).toBe(2);
    expect(r.apply?.counts.written).toBe(4);
    expect(await prisma.category.count()).toBe(4);
  });

  it("a competing writer that holds the write lock ~100 ms when a chunk starts: the chunk waits it out and lands once", async () => {
    let competitor: Promise<unknown> = Promise.resolve();
    const hold = async (n: number) => {
      if (n !== 0) return;
      let locked: () => void = () => {};
      const ready = new Promise<void>((resolve) => (locked = resolve));
      competitor = admin.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE "MigrationProject" SET "sourceKind"="sourceKind"`;
        locked();
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      await ready;
    };
    const r = await apply(undefined, { hooks: { beforeChunk: hold } });
    await competitor;
    expect(r.apply).toMatchObject({ stopped: null, counts: { written: 4, rolledBack: 0 } });
    expect(await prisma.category.count()).toBe(4);
  });

  it("--apply with products in scope and no wc/v3 key is refused before anything is read or written", async () => {
    await expect(apply(undefined, {}, ["--apply"])).rejects.toThrow(/^--apply writes products, and a new product is created only with wc\/v3's exact stock: .*Nothing was read or written\.$/);
    await expect(apply(undefined, {}, ["--apply", "--scope", "products"])).rejects.toThrow(/Nothing was read or written/);
    await expect(applyWooImport(parseWooImportArgs(["--scope", "categories"]), deps())).rejects.toThrow(/needs --apply/);
    expect(calls).toEqual([]);
    expect(await prisma.category.count()).toBe(0);
    expect((await prisma.migrationProject.findFirstOrThrow()).settings).toBeNull();
  });
});
