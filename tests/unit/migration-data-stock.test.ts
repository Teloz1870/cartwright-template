import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";
import { CHECK_CATALOG } from "@/lib/migration/catalog";
import { DATA_DIFF_CAP } from "@/lib/migration/checks/data";
import { judgeDataStock, unreadableStock, type ImportedStock, type StockSourceList, type StockSourceRow } from "@/lib/migration/checks/data-stock";
import { RUNNABLE_CHECKS } from "@/lib/migration/runner";
import { configHashOf } from "@/lib/migration/store";
import * as commerceSeam from "@/lib/tools/packs/commerce";
import * as commerceStatic from "@/lib/tools/packs/commerce.static";
import type { WooTransport } from "@/lib/woo/client";
import { wooStockSource } from "@/lib/woo/stock-source";
import type { WooStock } from "@/lib/woo/types";
import { fixtureTransport, wooSnapshot, type RecordedCall } from "./woo-fixture-shop";

/**
 * MIGD-5c — `data.stock`, redefined (DRØM159 (ii), under owner decision E2):
 * every product imported here keeps the stock policy the importer plans from
 * the shop's wc/v3 facts, and a counted policy (tracked, backorder) holds Woo's
 * exact count; untracked and unavailable need none. The judge is pure
 * (lib/migration/checks/data-stock.ts); the shop side is the importer's own
 * `stockPolicyOf` over a keyed read (lib/woo/stock-source.ts); migration.run_checks
 * runs it end to end over the synthetic fixture shop (product 101 is simple)
 * behind a stubbed `fetch` that also answers wc/v3.
 */

const mocks = vi.hoisted(() => {
  const state = {
    project: null as Record<string, unknown> | null,
    products: [] as Record<string, unknown>[],
    features: { migrationDashboard: true } as Record<string, boolean>,
  };
  type Where = { source?: string; externalId?: { not: null }; deletedAt?: null };
  const prisma = {
    $transaction: vi.fn(async (read: (tx: unknown) => Promise<unknown>, _options: unknown) => read(prisma)),
    migrationProject: { findFirst: vi.fn(async () => state.project), findUnique: vi.fn(async () => state.project) },
    migrationCheckRun: { create: vi.fn(async (args: unknown) => args), findMany: vi.fn(async () => []) },
    product: {
      findMany: vi.fn(async (args: { where?: Where } = {}) =>
        state.products.filter((r) => {
          const w = args.where;
          if (!w) return true;
          return (w.source === undefined || r.source === w.source) && (!w.externalId || r.externalId != null) && (w.deletedAt !== null || r.deletedAt == null);
        })),
    },
  };
  return {
    state,
    prisma,
    withAudit: vi.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()),
    gate: vi.fn(async () => ({ available: true, features: { ...state.features } })),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma, isPostgresDriver: () => false }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/brand", async (orig) => ({ ...(await orig<typeof import("@/lib/brand")>()), getFeatureGateState: mocks.gate }));
vi.mock("@/lib/import/safe-fetch", async (orig) => ({ ...(await orig<typeof import("@/lib/import/safe-fetch")>()), assertResolvedAddressesPublic: vi.fn(async () => {}) }));

const P = mocks.prisma;
const S = mocks.state;
const CTX: ToolCtx = { actor: "apikey:test", requestId: "test-data-stock" };
const SHOP = "https://shop.example.test";
const NEW = "https://new-shop.example";
const READ = new Date("2026-10-24T08:00:00Z");
const DISABLED = "Migration dashboard is disabled. Enable 'migrationDashboard' (/admin/features) first.";
const KEY = { WOO_AUTH_USER: "ck_test_stock", WOO_AUTH_PASS: "cs_test_stock" };
const V3 = "/wp-json/wc/v3/products";

const run = (args: unknown = { checkIds: ["data.stock"] }) => invokeTool("migration.run_checks", args, CTX, ["settings:read"] as never);
/** An imported product row as Prisma returns it. */
const woo = (externalId: string, extra: Record<string, unknown> = {}) => ({
  id: `db-${externalId}`, source: "woocommerce", externalId, slug: `woo-${externalId}`, deletedAt: null, stock: 7, stockPolicy: "tracked", ...extra,
});
const runData = () => (P.migrationCheckRun.create.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;
let calls: RecordedCall[];

/** The fixture shop, plus wc/v3's stock facts per id (counted, 7, no backorders unless told otherwise). */
function shop(opts: { stock?: Record<string, Partial<WooStock>>; v3Status?: number } = {}): WooTransport {
  const fixture = fixtureTransport(calls);
  return async (raw, init) => {
    const url = new URL(raw);
    if (url.pathname !== V3) return fixture(raw, init);
    calls.push({ url, init });
    if (opts.v3Status) return new Response("refused", { status: opts.v3Status });
    const ids = (url.searchParams.get("include") ?? "").split(",").filter(Boolean);
    return Response.json(ids.map((id) => ({ id: Number(id), manage_stock: true, stock_quantity: 7, stock_status: "instock", backorders: "no", ...opts.stock?.[id] })));
  };
}

const src = (rows: StockSourceRow[], over: Partial<StockSourceList> = {}): StockSourceList => ({ complete: true, total: rows.length, listed: rows.length, rows, ...over });
const counted = (externalId: string, policy: "tracked" | "backorder", count: number): StockSourceRow => ({ externalId, policy, count });
const uncounted = (externalId: string, policy: "untracked" | "unavailable"): StockSourceRow => ({ externalId, policy, count: null });
const here = (externalId: string, stockPolicy: string | null, stock = 0): ImportedStock => ({ externalId, stock, stockPolicy });

beforeEach(() => {
  vi.clearAllMocks();
  S.project = {
    id: "proj-1", sourceUrl: SHOP, targetUrl: NEW, sourceKind: "woocommerce", frozenAt: READ, switchedAt: null,
    snapshot: { id: "snap-1" }, settings: null, attestations: null, createdAt: READ, updatedAt: READ,
  };
  S.products = [];
  S.features = { migrationDashboard: true };
  calls = [];
  vi.stubGlobal("fetch", shop());
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  vi.stubEnv("WOO_AUTH_USER", KEY.WOO_AUTH_USER);
  vi.stubEnv("WOO_AUTH_PASS", KEY.WOO_AUTH_PASS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("data.stock — the judge", () => {
  it("all four policies kept, and both counted ones at Woo's exact count: a pass; the uncounted ones need no figure", () => {
    const r = judgeDataStock({
      source: src([counted("1", "tracked", 5), counted("2", "backorder", 3), uncounted("3", "untracked"), uncounted("4", "unavailable")]),
      imported: [here("1", "tracked", 5), here("2", "backorder", 3), here("3", "untracked", 0), here("4", "unavailable", 12)],
    });
    expect(r).toMatchObject({ status: "pass", source: 4, imported: 4, compared: 4, matched: 4, policyMismatch: 0, stockDiffers: 0, stockClamped: 0, notCompared: 0 });
    expect(r.policies).toEqual({ tracked: 1, backorder: 1, untracked: 1, unavailable: 1 });
    expect(r.diffs).toEqual({ count: 0, first: [] });
    expect(r.detail).toBeUndefined();
  });

  it("a tracked count one off is a fail, listed with both counts; so is a backorder's", () => {
    const r = judgeDataStock({ source: src([counted("1", "tracked", 5), counted("2", "backorder", 0)]), imported: [here("1", "tracked", 4), here("2", "backorder", 1)] });
    expect(r).toMatchObject({ status: "fail", compared: 2, matched: 0, stockDiffers: 2 });
    expect(r.diffs.first).toEqual([
      { externalId: "1", diff: "stockDiffers", field: "stock", source: 5, here: 4, reason: "1 below Woo's count" },
      { externalId: "2", diff: "stockDiffers", field: "stock", source: 0, here: 1, reason: "1 above Woo's count" },
    ]);
    expect(r.detail).toContain("0 of 2 compared products keep Woo's stock policy and count");
  });

  it("a policy that is not Woo's fails — backorder in Woo, tracked here — and so does none set here, even at the right count", () => {
    const r = judgeDataStock({ source: src([counted("1", "backorder", 5), counted("2", "tracked", 5), uncounted("3", "untracked")]), imported: [here("1", "tracked", 5), here("2", null, 5), here("3", "unavailable")] });
    expect(r).toMatchObject({ status: "fail", compared: 3, matched: 0, policyMismatch: 3, stockDiffers: 0 });
    expect(r.diffs.first).toEqual([
      { externalId: "1", diff: "policyMismatch", field: "stockPolicy", source: "backorder", here: "tracked", reason: "Woo's facts say backorder, and here it is tracked" },
      { externalId: "2", diff: "policyMismatch", field: "stockPolicy", source: "tracked", here: null, reason: "no stock policy is set here, and Woo's facts say tracked" },
      { externalId: "3", diff: "policyMismatch", field: "stockPolicy", source: "untracked", here: "unavailable", reason: "Woo's facts say untracked, and here it is unavailable" },
    ]);
  });

  it("a Woo count below zero stored as 0 is a warn with its own code, never a pass; stored as anything else it fails", () => {
    const clamped = judgeDataStock({ source: src([counted("1", "backorder", -3)]), imported: [here("1", "backorder", 0)] });
    expect(clamped).toMatchObject({ status: "warn", compared: 1, matched: 0, stockClamped: 1, stockDiffers: 0 });
    expect(clamped.diffs.first).toEqual([{ externalId: "1", diff: "stockClamped", field: "stock", source: -3, here: 0, code: "stockClamped", reason: "Woo counts -3 (sold past zero), and the import stored it as 0" }]);
    expect(clamped.detail).toContain("1 counted below zero in Woo are stored as 0 here");
    expect(judgeDataStock({ source: src([counted("1", "backorder", -3)]), imported: [here("1", "backorder", 3)] })).toMatchObject({ status: "fail", stockDiffers: 1, stockClamped: 0 });
  });

  it("stock facts the import refuses are not compared: inconclusive, in the importer's words and tallied by its code; a difference elsewhere still fails and leads", () => {
    const refused: StockSourceRow = { externalId: "1", refused: { code: "stockNotExact", reason: "stockNotExact: Woo counts its stock, but not in whole units" } };
    const r = judgeDataStock({ source: src([refused, counted("2", "tracked", 4)]), imported: [here("1", "tracked", 0), here("2", "tracked", 4)] });
    expect(r).toMatchObject({ status: "inconclusive", compared: 1, matched: 1, notCompared: 1, held: { stockNotExact: 1 } });
    expect(r.diffs.first).toEqual([{ externalId: "1", diff: "notCompared", field: "stockPolicy", source: null, here: "tracked", code: "stockNotExact", reason: refused.refused.reason }]);
    const failed = judgeDataStock({ source: src([refused, counted("2", "tracked", 4)]), imported: [here("1", "tracked"), here("2", "tracked", 9)] });
    expect(failed.status).toBe("fail");
    expect(failed.diffs.first.map((d) => d.diff)).toEqual(["stockDiffers", "notCompared"]);
  });

  it("keeps every difference counted but only the first DATA_DIFF_CAP, failures first", () => {
    const ids = Array.from({ length: DATA_DIFF_CAP + 10 }, (_, i) => String(i));
    const r = judgeDataStock({ source: src([...ids.map((id) => counted(id, "tracked", -1)), counted("x", "tracked", 1)]), imported: [...ids.map((id) => here(id, "tracked", 0)), here("x", "tracked", 2)] });
    expect(r).toMatchObject({ status: "fail", compared: DATA_DIFF_CAP + 11, stockClamped: DATA_DIFF_CAP + 10, stockDiffers: 1, diffs: { count: DATA_DIFF_CAP + 11 } });
    expect(r.diffs.first).toHaveLength(DATA_DIFF_CAP);
    expect(r.diffs.first[0]).toMatchObject({ externalId: "x", diff: "stockDiffers" });
  });

  it("an incomplete list is inconclusive unless a difference fails it; nothing compared is never a pass; nothing to move is a skip", () => {
    expect(judgeDataStock({ source: src([counted("1", "tracked", 1)], { complete: false, total: 9 }), imported: [here("1", "tracked", 1), here("2", "tracked")] }))
      .toMatchObject({ status: "inconclusive", compared: 1, matched: 1, notInSource: 1, sourceTotal: 9 });
    expect(judgeDataStock({ source: src([counted("1", "tracked", 1)], { complete: false }), imported: [here("1", "tracked", 2)] }).status).toBe("fail");
    const none = judgeDataStock({ source: src([]), imported: [here("9", "tracked")] });
    expect(none).toMatchObject({ status: "inconclusive", compared: 0, notInSource: 1 });
    // The one imported product is there, just not in the shop's list: the detail says so (data.counts judges it).
    expect(none.detail).toContain("1 imported product is not in the shop's list; see data.counts");
    // An imported product the shop does not list is data.counts' to fail: counted here, never compared.
    expect(judgeDataStock({ source: src([counted("1", "tracked", 1)]), imported: [here("1", "tracked", 1), here("9", null, 3)] })).toMatchObject({ status: "pass", notInSource: 1 });
    expect(judgeDataStock({ source: src([]), imported: [] }).status).toBe("skip");
    // Before the import: the shop lists simple products, none is imported here. `rows` is empty (only imported products
    // are asked for), but there IS stock to move: nothing compared, so inconclusive — never a skip that says the shop has none.
    const before = judgeDataStock({ source: src([], { listed: 3, total: 3 }), imported: [] });
    expect(before).toMatchObject({ status: "inconclusive", compared: 0, imported: 0 });
    expect(before.detail).toContain("no imported product to compare yet");
    expect(before.detail).not.toMatch(/lists no simple product/);
  });

  it("a stock that cannot be read is inconclusive with why, and counts what is imported", () => {
    expect(unreadableStock("Reading the shop failed: x.", 3)).toMatchObject({ status: "inconclusive", imported: 3, compared: 0, policies: {}, detail: "Reading the shop failed: x." });
  });
});

describe("data.stock — the shop's policies are the importer's", () => {
  it("asks wc/v3 only for the simple products imported here, and maps each fact as stockPolicyOf does", async () => {
    const asked: number[][] = [];
    const facts: Record<number, Partial<WooStock>> = { 101: { manage_stock: false, stock_quantity: null, stock_status: "outofstock" } };
    const stockOf = async (ids: readonly number[]) => {
      asked.push([...ids]);
      return new Map(ids.map((id) => [String(id), { id, manage_stock: true, stock_quantity: 7, stock_status: "instock", backorders: "no", ...facts[id] } as WooStock]));
    };
    // 102 (variable) and 103 (grouped) are imported here by id but not simple: left out, never asked for.
    const source = await wooStockSource(wooSnapshot(), new Set(["101", "102", "103", "999"]), stockOf);
    expect(asked).toEqual([[101]]);
    expect(source).toEqual({ complete: true, total: 3, listed: 1, rows: [{ externalId: "101", policy: "unavailable", count: null }] });
    facts[101] = { backorders: "notify", stock_quantity: -2 };
    expect((await wooStockSource(wooSnapshot(), new Set(["101"]), stockOf)).rows).toEqual([{ externalId: "101", policy: "backorder", count: -2 }]);
    facts[101] = { backorders: "sometimes" };
    expect((await wooStockSource(wooSnapshot(), new Set(["101"]), stockOf)).rows).toEqual([
      { externalId: "101", refused: { code: "backordersUnknown", reason: 'backordersUnknown: wc/v3 sent backorders "sometimes", not "no", "notify" or "yes"' } },
    ]);
    // Nothing imported: nothing asked for.
    const nothing = await wooStockSource(wooSnapshot(), new Set(), stockOf);
    expect(nothing).toMatchObject({ rows: [], listed: 1 });
    expect(asked.at(-1)).toEqual([]);
    // …and that is a shop with stock to move, not one with none: inconclusive, not skip.
    expect(judgeDataStock({ source: nothing, imported: [] })).toMatchObject({ status: "inconclusive", compared: 0 });
  });
});

describe("data.stock — through migration.run_checks", () => {
  it("is runnable and listed, and its required catalogue row says a policy Woo does not count needs no figure", async () => {
    expect(RUNNABLE_CHECKS).toContain("data.stock");
    const row = CHECK_CATALOG.find((r) => r.id === "data.stock")!;
    expect(row.required).toBe(true);
    expect(`${row.label} ${row.compares.a} ${row.compares.b}`).not.toMatch(/no product without an exact figure/);
    expect(row.compares.a).toContain("untracked");
    S.features = { migrationDashboard: false };
    expect(await run()).toMatchObject({ ok: false, status: 500, error: DISABLED });
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
    expect(P.product.findMany).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("runs on its own: never with a cursor", async () => {
    const r = await run({ checkIds: ["data.stock"], cursor: "run-1" });
    expect(r).toMatchObject({ ok: false, status: 500, error: 'data.stock runs on its own in one call: pass checkIds: ["data.stock"] and no cursor.' });
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("Woo's policy and count both here: a pass, ONE finished run under ONE audit entry that holds no rows, GETs only, the key only to wc/v3", async () => {
    S.products = [woo("101")];
    const r = await run();
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    if (!r.ok) return;
    expect(getTool("migration.run_checks")!.output.safeParse(JSON.parse(JSON.stringify(r.result))).success).toBe(true);
    expect(r.result).toMatchObject({ checkId: "data.stock", status: "pass", finished: true, nextCursor: null, compared: 1, matched: 1, source: 1, sourceTotal: 3, policies: { tracked: 1 } });
    expect(new Set(calls.map((c) => `${c.init.method} ${c.url.origin}`))).toEqual(new Set([`GET ${SHOP}`]));
    expect(calls.filter((c) => c.init.headers.authorization).map((c) => `${c.url.pathname}?${c.url.searchParams.get("include")}`)).toEqual([`${V3}?101`]);
    expect(P.migrationCheckRun.create).toHaveBeenCalledTimes(1);
    const data = runData()!;
    expect(data).toMatchObject({ projectId: "proj-1", checkId: "data.stock", phase: "before", status: "pass", actor: CTX.actor, id: (r.result as { runId: string }).runId });
    expect(data.bindings).toEqual({ snapshotId: "snap-1", configHash: configHashOf(NEW) });
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.withAudit.mock.calls[0][0] as { tool: string; args: Record<string, unknown> };
    expect(audit).toMatchObject({ tool: "migration.run_checks", args: { checkIds: ["data.stock"], status: "pass" } });
    expect(JSON.stringify(audit.args)).not.toContain("101");
    expect(JSON.stringify([r.result, data, audit])).not.toContain(KEY.WOO_AUTH_PASS);
  });

  it("backorder in Woo, tracked here: a fail that names it; one off Woo's count: a fail with both counts", async () => {
    vi.stubGlobal("fetch", shop({ stock: { 101: { backorders: "yes" } } }));
    S.products = [woo("101")];
    expect(await run()).toMatchObject({ ok: true, result: { status: "fail", policyMismatch: 1, diffs: { first: [{ externalId: "101", diff: "policyMismatch", source: "backorder", here: "tracked" }] } } });
    expect(runData()).toMatchObject({ checkId: "data.stock", status: "fail" });
    vi.clearAllMocks();
    vi.stubGlobal("fetch", shop());
    S.products = [woo("101", { stock: 8 })];
    expect(await run()).toMatchObject({ ok: true, result: { status: "fail", stockDiffers: 1, diffs: { first: [{ externalId: "101", diff: "stockDiffers", source: 7, here: 8 }] } } });
  });

  it("an untracked product needs no figure; a count below zero stored as 0 is the warn", async () => {
    vi.stubGlobal("fetch", shop({ stock: { 101: { manage_stock: false, stock_quantity: null, stock_status: "onbackorder" } } }));
    S.products = [woo("101", { stockPolicy: "untracked", stock: 0 })];
    expect(await run()).toMatchObject({ ok: true, result: { status: "pass", policies: { untracked: 1 } } });
    vi.stubGlobal("fetch", shop({ stock: { 101: { backorders: "notify", stock_quantity: -4 } } }));
    S.products = [woo("101", { stockPolicy: "backorder", stock: 0 })];
    expect(await run()).toMatchObject({ ok: true, result: { status: "warn", stockClamped: 1, diffs: { first: [{ code: "stockClamped", source: -4, here: 0 }] } } });
  });

  it("without a key, or with half of one, nothing is read: inconclusive, recorded with which env vars to set", async () => {
    S.products = [woo("101", { stock: 1 })];
    vi.stubEnv("WOO_AUTH_USER", "");
    vi.stubEnv("WOO_AUTH_PASS", "");
    const none = await run();
    expect(none).toMatchObject({ ok: true, result: { status: "inconclusive", imported: 1, compared: 0, stockDiffers: 0 } });
    if (none.ok) expect((none.result as { detail: string }).detail).toMatch(/needs a read key, and this site has none: set WOO_AUTH_USER and WOO_AUTH_PASS/);
    expect(runData()).toMatchObject({ checkId: "data.stock", status: "inconclusive" });
    expect(calls).toEqual([]);
    vi.stubEnv("WOO_AUTH_USER", KEY.WOO_AUTH_USER);
    const half = await run();
    expect(half).toMatchObject({ ok: true, result: { status: "inconclusive", compared: 0 } });
    if (half.ok) {
      expect((half.result as { detail: string }).detail).toMatch(/^The wc\/v3 read key is set by half: set both WOO_AUTH_USER and WOO_AUTH_PASS/);
      expect(JSON.stringify(half.result)).not.toContain(KEY.WOO_AUTH_USER);
    }
    expect(calls).toEqual([]);
  });

  it("a key the shop refuses, or a shop that cannot be read, is an inconclusive run, never a fail — recorded with why", async () => {
    vi.stubGlobal("fetch", shop({ v3Status: 401 }));
    S.products = [woo("101", { stock: 1 })];
    const refused = await run();
    expect(refused).toMatchObject({ ok: true, result: { status: "inconclusive", imported: 1, compared: 0 } });
    if (refused.ok) expect((refused.result as { detail: string }).detail).toMatch(/^The shop refused the wc\/v3 read key \(HTTP 401\)/);
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    const gone = await run();
    expect(gone).toMatchObject({ ok: true, result: { status: "inconclusive", imported: 1, compared: 0 } });
    if (gone.ok) expect((gone.result as { detail: string }).detail).toMatch(/^Reading the shop failed: WooCommerce answered HTTP 404/);
    expect(runData()).toMatchObject({ checkId: "data.stock", status: "inconclusive" });
  });

  it("a product soft-deleted here is not one of the imported products", async () => {
    S.products = [woo("101"), woo("102", { deletedAt: new Date(), stock: 1, stockPolicy: null })];
    expect(await run()).toMatchObject({ ok: true, result: { status: "pass", imported: 1 } });
  });

  it("before the import (the shop lists a simple product, none is here): inconclusive, recorded so — never a skip", async () => {
    S.products = [];
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "inconclusive", imported: 0, compared: 0, sourceTotal: 3 } });
    if (r.ok) expect((r.result as { detail: string }).detail).toContain("no imported product to compare yet");
    expect(runData()).toMatchObject({ checkId: "data.stock", status: "inconclusive" });
  });

  it("the static commerce seam takes the same arguments as the real runWooDataStock, and refuses", async () => {
    type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const sameParameters: Same<Parameters<typeof commerceSeam.runWooDataStock>, Parameters<typeof commerceStatic.runWooDataStock>> = true;
    expect(sameParameters).toBe(true);
    expect(commerceStatic.runWooDataStock.length).toBe(commerceSeam.runWooDataStock.length);
    await expect(commerceStatic.runWooDataStock("apikey:test", { requestId: "r" } as never)).rejects.toThrow(/does not have/);
  });
});
