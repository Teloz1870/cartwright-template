import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";
import { DATA_DIFF_CAP, judgeDataCounts, unreadableSource, type DataCountsInput, type DataSourceList } from "@/lib/migration/checks/data";
import { RUNNABLE_CHECKS } from "@/lib/migration/runner";
import { configHashOf } from "@/lib/migration/store";
import { wooDataSource, wooTypeSkip } from "@/lib/woo/counts";
import * as commerceSeam from "@/lib/tools/packs/commerce";
import * as commerceStatic from "@/lib/tools/packs/commerce.static";
import { planWooCatalog } from "@/lib/woo/plan";
import { fixtureTransport, wooSnapshot, type RecordedCall } from "./woo-fixture-shop";

/**
 * MIGD-5a — `data.counts`: the WooCommerce shop's categories and products
 * held against the rows imported here (source = "woocommerce"), with the
 * skip list explaining what the import leaves out in the importer's own words.
 * The judge is pure (lib/migration/checks/data.ts); the shop side reuses the
 * import plan (lib/woo/counts.ts); migration.run_checks runs it end to end
 * over the synthetic fixture shop (woo-fixture-shop.ts) behind a stubbed
 * `fetch`, with a small in-memory database.
 */

const mocks = vi.hoisted(() => {
  const state = {
    project: null as Record<string, unknown> | null,
    categories: [] as Record<string, unknown>[],
    products: [] as Record<string, unknown>[],
    features: { migrationDashboard: true } as Record<string, boolean>,
  };
  type Where = { source?: string; externalId?: { not: null }; deletedAt?: null };
  // Filters the way the two reads ask: every row (the plan's key read), or the imported ones.
  const find = (rows: () => Record<string, unknown>[]) =>
    vi.fn(async (args: { where?: Where } = {}) =>
      rows().filter((r) => {
        const w = args.where;
        if (!w) return true;
        return (w.source === undefined || r.source === w.source)
          && (!w.externalId || r.externalId != null)
          && (w.deletedAt !== null || r.deletedAt == null);
      }));
  const prisma = {
    migrationProject: {
      findFirst: vi.fn(async () => state.project),
      findUnique: vi.fn(async () => state.project),
      updateMany: vi.fn(async (args: { where: { updatedAt?: Date }; data: Record<string, unknown> }) => {
        if (args.where.updatedAt?.getTime() !== (state.project?.updatedAt as Date | undefined)?.getTime()) return { count: 0 };
        state.project = { ...state.project, ...args.data };
        return { count: 1 };
      }),
    },
    migrationCheckRun: { create: vi.fn(async (args: unknown) => args), findMany: vi.fn(async () => []) },
    category: { findMany: find(() => state.categories) },
    product: { findMany: find(() => state.products) },
  };
  return {
    state,
    prisma,
    withAudit: vi.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()),
    gate: vi.fn(async () => ({ available: true, features: { ...state.features } })),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
// The fixture shop prices in DKK, VAT included: the plan is pinned to that policy, never a scaffold's own.
vi.mock("@/brand.config", async (orig) => {
  const actual = await orig<typeof import("@/brand.config")>();
  return { ...actual, brand: { ...actual.brand, policies: { ...actual.brand.policies, currency: "DKK", pricesIncludeVat: true } } };
});
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/brand", async (orig) => ({ ...(await orig<typeof import("@/lib/brand")>()), getFeatureGateState: mocks.gate }));
vi.mock("@/lib/import/safe-fetch", async (orig) => ({ ...(await orig<typeof import("@/lib/import/safe-fetch")>()), assertResolvedAddressesPublic: vi.fn(async () => {}) }));

const P = mocks.prisma;
const S = mocks.state;
const CTX: ToolCtx = { actor: "apikey:test", requestId: "test-data-counts" };
const SHOP = "https://shop.example.test";
const NEW = "https://new-shop.example";
const READ = new Date("2026-10-24T08:00:00Z");
const DISABLED = "Migration dashboard is disabled. Enable 'migrationDashboard' (/admin/features) first.";

const run = (args: unknown = { checkIds: ["data.counts"] }) => invokeTool("migration.run_checks", args, CTX, ["settings:read"] as never);
/** A row of ours as the plan's read returns it: its keys, and the owned fields and links a category or a product has. */
const woo = (externalId: string, extra: Record<string, unknown> = {}) => ({
  id: `db-${externalId}`, source: "woocommerce", externalId, slug: `woo-${externalId}`, name: `Woo ${externalId}`, permalink: null, sku: null, deletedAt: null, priceDkk: 100,
  description: null, answerSummary: null, attributes: null, parent: null, category: { id: "c-hand", source: null, externalId: null }, extraCategories: [], ...extra,
});
const ALL_CATEGORIES = ["10", "11", "12", "20"].map((id) => woo(id));
const runData = () => (P.migrationCheckRun.create.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;
let calls: RecordedCall[];

const list = (ids: string[], over: Partial<DataSourceList> = {}): DataSourceList =>
  ({ complete: true, total: ids.length, rows: ids.map((externalId) => ({ externalId })), ...over });
const input = (source: Partial<DataCountsInput["source"]>, imported: Partial<DataCountsInput["imported"]> = {}): DataCountsInput => ({
  source: { categories: list([]), products: list([]), ...source },
  imported: { categories: [], products: [], ...imported },
});

beforeEach(() => {
  vi.clearAllMocks();
  S.project = {
    id: "proj-1", sourceUrl: SHOP, targetUrl: NEW, sourceKind: "woocommerce", frozenAt: READ, switchedAt: null,
    snapshot: { id: "snap-1" }, settings: null, attestations: null, createdAt: READ, updatedAt: READ,
  };
  S.categories = [];
  S.products = [];
  S.features = { migrationDashboard: true };
  calls = [];
  vi.stubGlobal("fetch", fixtureTransport(calls));
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("data.counts — the judge", () => {
  it("passes only when every source row is imported and none is extra", () => {
    const r = judgeDataCounts(input({ categories: list(["1", "2"]), products: list(["7"]) }, { categories: ["1", "2"], products: ["7"] }));
    expect(r.status).toBe("pass");
    expect(r.kinds.products).toMatchObject({ status: "pass", source: 1, sourceTotal: 1, imported: 1, matched: 1, skipped: 0, missing: 0, extra: 0 });
    expect(r.diffs).toEqual({ count: 0, first: [] });
  });

  it("a difference the skip list explains is a warn — never a pass — and the skip list is tallied by its code", () => {
    const products: DataSourceList = {
      complete: true, total: 3,
      rows: [{ externalId: "7" }, { externalId: "8", skip: { code: "variantsNeedBatchB", reason: "variable" } }, { externalId: "9", skip: { code: "conflict", reason: "slug taken" } }],
    };
    const r = judgeDataCounts(input({ products }, { products: ["7"] }));
    expect(r.status).toBe("warn");
    expect(r.kinds.products).toMatchObject({ status: "warn", matched: 1, skipped: 2, missing: 0 });
    expect(r.skipped).toEqual({ variantsNeedBatchB: 1, conflict: 1 });
    expect(r.diffs.first).toContainEqual({ kind: "products", externalId: "9", diff: "skipped", code: "conflict", reason: "slug taken" });
  });

  it("an unexplained missing row and an extra imported row both fail, and they lead the id list", () => {
    const products: DataSourceList = { complete: true, total: 2, rows: [{ externalId: "7" }, { externalId: "8", skip: { code: "blocked", reason: "currency" } }] };
    const r = judgeDataCounts(input({ categories: list(["1"]), products }, { categories: ["1", "99"] }));
    expect(r.status).toBe("fail");
    expect(r.kinds.categories).toMatchObject({ status: "fail", matched: 1, extra: 1 });
    expect(r.kinds.products).toMatchObject({ status: "fail", missing: 1, skipped: 1 });
    expect(r.diffs.first.map((d) => `${d.diff}:${d.externalId}`)).toEqual(["missing:7", "extra:99", "skipped:8"]);
  });

  it("keeps every difference counted but only the first DATA_DIFF_CAP ids", () => {
    const ids = Array.from({ length: DATA_DIFF_CAP + 10 }, (_, i) => String(i));
    const r = judgeDataCounts(input({ products: list(ids) }));
    expect(r.diffs.count).toBe(DATA_DIFF_CAP + 10);
    expect(r.diffs.first).toHaveLength(DATA_DIFF_CAP);
  });

  it("an incomplete source list is inconclusive: no row is called missing or extra on it", () => {
    const r = judgeDataCounts(input({ categories: list(["1"]), products: list(["7"], { complete: false, total: 5 }) }, { categories: ["1"], products: ["8"] }));
    expect(r.status).toBe("inconclusive");
    expect(r.kinds.products).toMatchObject({ status: "inconclusive", sourceTotal: 5, source: 1, imported: 1, missing: 0, extra: 0 });
    expect(r.kinds.products.detail).toContain("1 of 5 read");
    expect(r.diffs.count).toBe(0);
    // A fail elsewhere still wins.
    expect(judgeDataCounts(input({ categories: list(["1"]), products: list(["7"], { complete: false }) })).status).toBe("fail");
  });

  it("a shop with nothing to move is a skip, which never counts toward the switch", () => {
    expect(judgeDataCounts(input({})).status).toBe("skip");
  });
});

describe("data.counts — the skip list is the importer's own", () => {
  it("variable and grouped products wait for schema batch B; a simple one the plan would create is not explained", async () => {
    const snapshot = wooSnapshot();
    const plan = await planWooCatalog(snapshot, { categories: [], products: [] }, { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true });
    const source = wooDataSource(snapshot, plan);
    expect(source.products.rows).toEqual([
      { externalId: "101" },
      { externalId: "102", skip: { code: "variantsNeedBatchB", reason: expect.stringContaining("a variable product is not imported until schema batch B") } },
      { externalId: "103", skip: { code: "variantsNeedBatchB", reason: expect.stringContaining("a grouped product") } },
    ]);
    expect(source.categories.rows).toEqual(["10", "11", "12", "20"].map((externalId) => ({ externalId })));
    expect(source.products).toMatchObject({ complete: true, total: 3 });
  });

  it("a product deleted here is left out in the plan's words: a skip that explains, where a local edit counts as imported and never reads it", async () => {
    const snapshot = wooSnapshot();
    const plan = await planWooCatalog(snapshot, { categories: [], products: [woo("101", { deletedAt: new Date() })] }, { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true });
    const source = wooDataSource(snapshot, plan);
    expect(source.products.rows[0]).toEqual({ externalId: "101", skip: { code: "skip", reason: expect.stringMatching(/^deletedHere:/) } });
    const judged = judgeDataCounts({ source, imported: { categories: [], products: [] } });
    expect(judged.kinds.products).toMatchObject({ missing: 0, skipped: 3 });
  });

  it("a simple product with no usable price is held back by the plan, so the skip list says why it is not here", async () => {
    const snapshot = wooSnapshot();
    snapshot.products[0].prices.price = "";
    const plan = await planWooCatalog(snapshot, { categories: [], products: [] }, { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true });
    expect(wooDataSource(snapshot, plan).products.rows[0]).toEqual({ externalId: "101", skip: { code: "blocked", reason: expect.stringMatching(/^noPrice:/) } });
  });

  it("a row the plan holds back carries the plan's reason: blocked on an unstated tax basis, a conflict on a key held here", async () => {
    const snapshot = wooSnapshot();
    const held = { id: "c-csv", source: "csv", externalId: "x", slug: "lamper", permalink: null };
    const plan = await planWooCatalog(snapshot, { categories: [held], products: [] }, { currency: "DKK", pricesIncludeVat: true });
    const source = wooDataSource(snapshot, plan);
    expect(source.products.rows[0]).toEqual({ externalId: "101", skip: { code: "blocked", reason: expect.stringContaining("taxBasisUnknown") } });
    expect(source.categories.rows[0]).toEqual({ externalId: "10", skip: { code: "conflict", reason: expect.stringContaining('slug "lamper" is taken by csv category c-csv') } });
  });
});

describe("data.counts — review round 1 (MIGD-5a R1)", () => {
  it("the static commerce seam takes the same arguments as the real runWooDataCounts, and refuses", async () => {
    // migration.run_checks calls runWooDataCounts(ctx.actor, meta(ctx)); a stub with fewer parameters
    // breaks the typecheck of every materialization that swaps commerce.static.ts in (TS2554).
    type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const sameParameters: Same<Parameters<typeof commerceSeam.runWooDataCounts>, Parameters<typeof commerceStatic.runWooDataCounts>> = true;
    expect(sameParameters).toBe(true);
    expect(commerceStatic.runWooDataCounts.length).toBe(commerceSeam.runWooDataCounts.length);
    await expect(commerceStatic.runWooDataCounts("apikey:test", { requestId: "r" } as never)).rejects.toThrow(/does not have/);
  });

  it("seo.product-jsonld's lead-only lookup: a site without the webshop has no such product, through the same arguments (MIGD-4b)", async () => {
    type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const sameParameters: Same<Parameters<typeof commerceSeam.leadOnlyPaths>, Parameters<typeof commerceStatic.leadOnlyPaths>> = true;
    expect(sameParameters).toBe(true);
    expect(commerceStatic.leadOnlyPaths.length).toBe(commerceSeam.leadOnlyPaths.length);
    await expect(commerceStatic.leadOnlyPaths(["/a/"])).resolves.toEqual(new Set());
  });

  it("an unreadable shop counts imported ids the way a readable one does: distinct", () => {
    const ids = { categories: ["10", "10"], products: ["101"] };
    expect(unreadableSource("x", ids).kinds.categories.imported).toBe(1);
    const complete = (rows: string[]): DataSourceList => ({ complete: true, total: rows.length, rows: rows.map((externalId) => ({ externalId })) });
    expect(judgeDataCounts({ source: { categories: complete(["10"]), products: complete(["101"]) }, imported: ids }).kinds.categories.imported).toBe(1);
  });

  it("a skip reason reads as English for a type that starts with a vowel", () => {
    expect(wooTypeSkip("external")?.reason).toBe("an external product is not imported");
    expect(wooTypeSkip("bundle")?.reason).toBe("a bundle product is not imported");
    expect(wooTypeSkip("")?.reason).toBe("a typeless product is not imported");
  });
});

describe("data.counts — through migration.run_checks", () => {
  it("is runnable and listed; the flag off refuses before any read or request", async () => {
    expect(RUNNABLE_CHECKS).toContain("data.counts");
    S.features = { migrationDashboard: false };
    expect(await run()).toMatchObject({ ok: false, status: 500, error: DISABLED });
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("runs on its own: not beside url.parity, never with a cursor", async () => {
    // One check per call is the input schema's rule since MIGD-4a: refused (422) before any handler code runs.
    expect(await run({ checkIds: ["url.parity", "data.counts"] })).toMatchObject({ ok: false, status: 422, error: expect.stringContaining("One check per call.") });
    expect(mocks.gate).not.toHaveBeenCalled();
    // A cursor is refused by the handler, before any read of the project or the shop.
    const args = { checkIds: ["data.counts"], cursor: "run-1" };
    expect(await run(args), JSON.stringify(args)).toMatchObject({ ok: false, status: 500, error: expect.stringContaining("data.counts runs on its own") });
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(P.migrationCheckRun.create).not.toHaveBeenCalled();
  });

  it("everything importable is here: a warn naming the skip list, ONE finished run under ONE audit entry, GETs only to the shop", async () => {
    S.categories = ALL_CATEGORIES;
    S.products = [woo("101")];
    const r = await run();
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    if (!r.ok) return;
    expect(getTool("migration.run_checks")!.output.safeParse(JSON.parse(JSON.stringify(r.result))).success).toBe(true);
    expect(r.result).toMatchObject({
      checkId: "data.counts", status: "warn", finished: true, nextCursor: null,
      kinds: { categories: { status: "pass", matched: 4 }, products: { status: "warn", matched: 1, skipped: 2 } },
      skipped: { variantsNeedBatchB: 2 },
    });
    expect(new Set(calls.map((c) => `${c.init.method} ${c.url.origin}`))).toEqual(new Set([`GET ${SHOP}`]));
    expect(P.migrationCheckRun.create).toHaveBeenCalledTimes(1);
    const data = runData()!;
    expect(data).toMatchObject({ projectId: "proj-1", checkId: "data.counts", phase: "before", status: "warn", actor: CTX.actor, id: (r.result as { runId: string }).runId });
    expect(data.bindings).toEqual({ snapshotId: "snap-1", configHash: configHashOf(NEW) });
    expect(data.finishedAt).toBeInstanceOf(Date);
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    expect(mocks.withAudit.mock.calls[0][0]).toMatchObject({ tool: "migration.run_checks", args: { checkIds: ["data.counts"], status: "warn" } });
  });

  it("with the tax basis stated on the last plan, a product nothing holds back that is not here fails", async () => {
    expect(await invokeTool("migration.woo_plan", { sourcePricesIncludeVat: true }, CTX, ["settings:read"] as never)).toMatchObject({ ok: true });
    S.categories = ALL_CATEGORIES;
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "fail", kinds: { products: { missing: 1, imported: 0 } } } });
    if (r.ok) expect((r.result as { diffs: { first: unknown[] } }).diffs.first[0]).toMatchObject({ kind: "products", externalId: "101", diff: "missing" });
  });

  it("a product soft-deleted here is not counted as imported", async () => {
    S.categories = ALL_CATEGORIES;
    S.products = [woo("101", { deletedAt: new Date() })];
    const r = await run();
    // No tax basis stated, so it is held back as blocked, which outranks deleted here; the skip list explains it either way.
    expect(r).toMatchObject({ ok: true, result: { status: "warn", kinds: { products: { imported: 0, matched: 0, missing: 0, skipped: 3 } }, skipped: { blocked: 1, variantsNeedBatchB: 2 } } });
    expect(P.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ source: "woocommerce", deletedAt: null }) }));
  });

  it("unstated, the same product is held back as blocked by the plan: explained, so a warn", async () => {
    S.categories = ALL_CATEGORIES;
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "warn", skipped: { blocked: 1, variantsNeedBatchB: 2 } } });
  });

  it("an imported product the shop no longer lists fails as extra", async () => {
    S.categories = ALL_CATEGORIES;
    S.products = [woo("101"), woo("999")];
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "fail", kinds: { products: { extra: 1, matched: 1 } } } });
  });

  it("a shop that cannot be read is an inconclusive run, never a fail — recorded with why", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    S.categories = ALL_CATEGORIES;
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "inconclusive", kinds: { categories: { status: "inconclusive", imported: 4 } } } });
    if (r.ok) expect((r.result as { detail: string }).detail).toMatch(/^Reading the shop failed: WooCommerce answered HTTP 404/);
    expect(runData()).toMatchObject({ checkId: "data.counts", status: "inconclusive" });
  });

  it("a list shorter than the shop's X-WP-Total is inconclusive", async () => {
    const shop = fixtureTransport(calls);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: never) => {
      const res = await shop(url, init);
      if (!new URL(url).pathname.endsWith("/wc/store/v1/products") || new URL(url).searchParams.has("type")) return res;
      return Response.json(await res.json(), { headers: { "x-wp-total": "4", "x-wp-totalpages": "1" } });
    }));
    S.categories = ALL_CATEGORIES;
    S.products = [woo("101")];
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "inconclusive", kinds: { products: { status: "inconclusive", sourceTotal: 4, source: 3 } } } });
  });
});
