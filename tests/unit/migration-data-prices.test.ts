import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";
import { DATA_DIFF_CAP } from "@/lib/migration/checks/data";
import { judgeDataPrices, unreadablePrices, type DataPricesInput, type ImportedPrice, type PriceSourceRow } from "@/lib/migration/checks/data-prices";
import { RUNNABLE_CHECKS } from "@/lib/migration/runner";
import { configHashOf } from "@/lib/migration/store";
import * as commerceSeam from "@/lib/tools/packs/commerce";
import * as commerceStatic from "@/lib/tools/packs/commerce.static";
import { htmlDecoder, mapWooCatalog } from "@/lib/woo/map-catalog";
import { wooPriceSource } from "@/lib/woo/price-source";
import { fixtureTransport, wooSnapshot, type RecordedCall } from "./woo-fixture-shop";

/**
 * MIGD-5b — `data.prices`: every product imported here (source = "woocommerce")
 * held against the shop's price as the importer maps it, to the øre, on the tax
 * basis the owner stated on the last migration.woo_plan. The judge is pure
 * (lib/migration/checks/data-prices.ts); the shop side reuses the importer's
 * mapping and L2 verdicts (lib/woo/price-source.ts); migration.run_checks runs
 * it end to end over the synthetic fixture shop (woo-fixture-shop.ts: product
 * 101 is simple and on sale, 799.00 from 999.00) behind a stubbed `fetch`.
 */

const mocks = vi.hoisted(() => {
  const state = {
    project: null as Record<string, unknown> | null,
    categories: [] as Record<string, unknown>[],
    products: [] as Record<string, unknown>[],
    features: { migrationDashboard: true } as Record<string, boolean>,
  };
  type Where = { source?: string; externalId?: { not: null }; deletedAt?: null };
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
    $transaction: vi.fn(async (read: (tx: unknown) => Promise<unknown>, _options: unknown) => read(prisma)),
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
    productCategory: { findMany: vi.fn(async () => []) },
  };
  return {
    state,
    prisma,
    withAudit: vi.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()),
    gate: vi.fn(async () => ({ available: true, features: { ...state.features } })),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma, isPostgresDriver: () => false }));
// The fixture shop prices in DKK, VAT included: the policy is pinned to that, never a scaffold's own.
vi.mock("@/brand.config", async (orig) => {
  const actual = await orig<typeof import("@/brand.config")>();
  return { ...actual, brand: { ...actual.brand, policies: { ...actual.brand.policies, currency: "DKK", pricesIncludeVat: true } } };
});
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/brand", async (orig) => ({ ...(await orig<typeof import("@/lib/brand")>()), getFeatureGateState: mocks.gate }));
vi.mock("@/lib/import/safe-fetch", async (orig) => ({ ...(await orig<typeof import("@/lib/import/safe-fetch")>()), assertResolvedAddressesPublic: vi.fn(async () => {}) }));

const P = mocks.prisma;
const S = mocks.state;
const CTX: ToolCtx = { actor: "apikey:test", requestId: "test-data-prices" };
const SHOP = "https://shop.example.test";
const NEW = "https://new-shop.example";
const READ = new Date("2026-10-24T08:00:00Z");
const DISABLED = "Migration dashboard is disabled. Enable 'migrationDashboard' (/admin/features) first.";
const INCL = { sourcePricesIncludeVat: true, pricesIncludeVat: true };

const run = (args: unknown = { checkIds: ["data.prices"] }) => invokeTool("migration.run_checks", args, CTX, ["settings:read"] as never);
const statePlan = () => invokeTool("migration.woo_plan", { sourcePricesIncludeVat: true }, CTX, ["settings:read"] as never);
/** An imported product row as Prisma returns it. */
const woo = (externalId: string, extra: Record<string, unknown> = {}) => ({
  id: `db-${externalId}`, source: "woocommerce", externalId, slug: `woo-${externalId}`, deletedAt: null, priceDkk: 79900, compareAtDkk: 99900, ...extra,
});
const runData = () => (P.migrationCheckRun.create.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;
let calls: RecordedCall[];

const src = (rows: PriceSourceRow[], over: Partial<DataPricesInput["source"]> = {}): DataPricesInput["source"] => ({ complete: true, total: rows.length, rows, ...over });
const row = (externalId: string, priceDkk: number | null, regularDkk: number | null = null, held?: PriceSourceRow["held"]): PriceSourceRow =>
  ({ externalId, priceDkk, regularDkk, ...(held && { held }) });
const here = (externalId: string, priceDkk: number, compareAtDkk: number | null = null): ImportedPrice => ({ externalId, priceDkk, compareAtDkk });

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

describe("data.prices — the judge", () => {
  it("passes only when every imported price equals the shop's, to the øre", () => {
    const r = judgeDataPrices({ source: src([row("1", 12500), row("2", 9900)]), imported: [here("1", 12500), here("2", 9900)], taxBasis: INCL });
    expect(r).toMatchObject({ status: "pass", source: 2, imported: 2, compared: 2, matched: 2, mispriced: 0, notCompared: 0 });
    expect(r.diffs).toEqual({ count: 0, first: [] });
    expect(r.detail).toBeUndefined();
  });

  it("one øre off is a fail, listed with both prices", () => {
    const r = judgeDataPrices({ source: src([row("1", 12500), row("2", 9900)]), imported: [here("1", 12501), here("2", 9900)], taxBasis: INCL });
    expect(r).toMatchObject({ status: "fail", compared: 2, matched: 1, mispriced: 1 });
    expect(r.diffs.first).toEqual([{ externalId: "1", diff: "mispriced", field: "priceDkk", source: 12500, here: 12501, reason: "1 øre above the shop's price" }]);
    expect(r.detail).toContain("1 of 2 compared prices match");
  });

  it("an unstated tax basis compares nothing: inconclusive, and the run says so — never a pass, nor a fail", () => {
    const input = { source: src([row("1", 12500)]), imported: [here("1", 99999)] };
    const unstated = judgeDataPrices({ ...input, taxBasis: { pricesIncludeVat: true } });
    expect(unstated).toMatchObject({ status: "inconclusive", compared: 0, mispriced: 0, diffs: { count: 0 } });
    expect(unstated.detail).toMatch(/^Nobody has said whether the shop's prices include VAT/);
    // A matching price is not a pass either.
    expect(judgeDataPrices({ source: src([row("1", 12500)]), imported: [here("1", 12500)], taxBasis: { pricesIncludeVat: true } }).status).toBe("inconclusive");
    // Nor a basis that differs from this shop's: prices are never converted.
    const other = judgeDataPrices({ ...input, taxBasis: { sourcePricesIncludeVat: false, pricesIncludeVat: true } });
    expect(other).toMatchObject({ status: "inconclusive", compared: 0 });
    expect(other.detail).toContain("exclude VAT, this shop's include VAT");
  });

  it("a sale whose before-price is not here is its own warn; the shop's before-price set here passes; one the shop does not show fails", () => {
    const sale = src([row("1", 7990, 9990)]);
    const missing = judgeDataPrices({ source: sale, imported: [here("1", 7990)], taxBasis: INCL });
    expect(missing).toMatchObject({ status: "warn", compared: 1, matched: 0, compareAtNotImported: 1, mispriced: 0 });
    expect(missing.diffs.first[0]).toMatchObject({ diff: "compareAtNotImported", field: "compareAtDkk", source: 9990, here: null });
    expect(judgeDataPrices({ source: sale, imported: [here("1", 7990, 9990)], taxBasis: INCL }).status).toBe("pass");
    const wrong = judgeDataPrices({ source: sale, imported: [here("1", 7990, 9991)], taxBasis: INCL });
    expect(wrong).toMatchObject({ status: "fail", compareAtDiffers: 1 });
    const invented = judgeDataPrices({ source: src([row("1", 7990)]), imported: [here("1", 7990, 9990)], taxBasis: INCL });
    expect(invented).toMatchObject({ status: "fail", compareAtDiffers: 1 });
    expect(invented.diffs.first[0].reason).toBe("a before-price is set here, and the shop shows none");
  });

  it("a price the import holds back is not compared: inconclusive, named in the importer's words and tallied by its code", () => {
    const r = judgeDataPrices({
      source: src([row("1", 12500, null, { code: "currencyMismatch", reason: "currencyMismatch: priced in EUR, this shop sells in DKK" }), row("2", null), row("3", 100)]),
      imported: [here("1", 12500), here("2", 500), here("3", 100)],
      taxBasis: INCL,
    });
    expect(r).toMatchObject({ status: "inconclusive", compared: 1, matched: 1, notCompared: 2, held: { currencyMismatch: 1, noPrice: 1 } });
    expect(r.diffs.first.map((d) => `${d.code}:${d.externalId}`)).toEqual(["currencyMismatch:1", "noPrice:2"]);
    // A difference elsewhere still fails, and leads the list.
    const failed = judgeDataPrices({ source: src([row("1", null), row("3", 100)]), imported: [here("1", 5), here("3", 101)], taxBasis: INCL });
    expect(failed.status).toBe("fail");
    expect(failed.diffs.first.map((d) => d.diff)).toEqual(["mispriced", "notCompared"]);
  });

  it("keeps every difference counted but only the first DATA_DIFF_CAP", () => {
    const ids = Array.from({ length: DATA_DIFF_CAP + 10 }, (_, i) => String(i));
    const r = judgeDataPrices({ source: src(ids.map((id) => row(id, 100))), imported: ids.map((id) => here(id, 101)), taxBasis: INCL });
    expect(r).toMatchObject({ status: "fail", mispriced: DATA_DIFF_CAP + 10, diffs: { count: DATA_DIFF_CAP + 10 } });
    expect(r.diffs.first).toHaveLength(DATA_DIFF_CAP);
  });

  it("an incomplete list is inconclusive unless a difference fails it; nothing compared is never a pass; nothing to move is a skip", () => {
    expect(judgeDataPrices({ source: src([row("1", 100)], { complete: false, total: 9 }), imported: [here("1", 100), here("2", 5)], taxBasis: INCL }))
      .toMatchObject({ status: "inconclusive", compared: 1, matched: 1, notInSource: 1, sourceTotal: 9 });
    expect(judgeDataPrices({ source: src([row("1", 100)], { complete: false }), imported: [here("1", 101)], taxBasis: INCL }).status).toBe("fail");
    const none = judgeDataPrices({ source: src([row("1", 100)]), imported: [], taxBasis: INCL });
    expect(none).toMatchObject({ status: "inconclusive", compared: 0 });
    expect(none.detail).toContain("no imported product to compare yet");
    // An imported product the shop does not list is data.counts' to fail: counted here, never compared.
    expect(judgeDataPrices({ source: src([row("1", 100)]), imported: [here("1", 100), here("9", 1)], taxBasis: INCL })).toMatchObject({ status: "pass", notInSource: 1 });
    expect(judgeDataPrices({ source: src([]), imported: [], taxBasis: INCL }).status).toBe("skip");
  });

  it("an unreadable shop is inconclusive with why, and counts what is imported", () => {
    expect(unreadablePrices("Reading the shop failed: x.", 3)).toMatchObject({ status: "inconclusive", imported: 3, compared: 0, detail: "Reading the shop failed: x." });
  });
});

describe("data.prices — the shop's prices are the importer's", () => {
  const POLICY = { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true };

  it("only simple products, priced by the importer's own mapping, the regular price only on a sale", async () => {
    const snapshot = wooSnapshot();
    const source = await wooPriceSource(snapshot, POLICY);
    expect(source).toEqual({ complete: true, total: 3, rows: [{ externalId: "101", priceDkk: 79900, regularDkk: 99900 }] });
    const mapped = mapWooCatalog(snapshot, await htmlDecoder()).products.find((p) => p.externalId === "101");
    expect(source.rows[0].priceDkk).toBe(mapped?.priceDkk);
    // Off sale, there is no regular price to hold a before-price against.
    snapshot.products[0].prices.regular_price = snapshot.products[0].prices.price;
    expect((await wooPriceSource(snapshot, POLICY)).rows[0].regularDkk).toBeNull();
  });

  it("the regular price is scaled from the currency's minor unit exactly as the price is", async () => {
    const snapshot = wooSnapshot();
    Object.assign(snapshot.products[0].prices, { price: "799000", regular_price: "999000", currency_minor_unit: 3 });
    expect((await wooPriceSource(snapshot, POLICY)).rows[0]).toEqual({ externalId: "101", priceDkk: 79900, regularDkk: 99900 });
  });

  it("a price the plan holds back carries the plan's L2 reason: another currency, an unstated tax basis", async () => {
    const snapshot = wooSnapshot();
    snapshot.products[0].prices.currency_code = "EUR";
    expect((await wooPriceSource(snapshot, POLICY)).rows[0].held).toEqual({ code: "currencyMismatch", reason: expect.stringMatching(/^currencyMismatch: priced in EUR/) });
    const unstated = await wooPriceSource(wooSnapshot(), { currency: "DKK", pricesIncludeVat: true });
    expect(unstated.rows[0].held).toMatchObject({ code: "taxBasisUnknown" });
  });

  it("a price the importer cannot use is null, never 0", async () => {
    const snapshot = wooSnapshot();
    snapshot.products[0].prices.price = "799.5";
    expect((await wooPriceSource(snapshot, POLICY)).rows[0].priceDkk).toBeNull();
  });
});

describe("data.prices — through migration.run_checks", () => {
  it("is runnable and listed; the flag off refuses before any read or request", async () => {
    expect(RUNNABLE_CHECKS).toContain("data.prices");
    S.features = { migrationDashboard: false };
    expect(await run()).toMatchObject({ ok: false, status: 500, error: DISABLED });
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
    expect(P.product.findMany).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("runs on its own: never with a cursor", async () => {
    const r = await run({ checkIds: ["data.prices"], cursor: "run-1" });
    expect(r).toMatchObject({ ok: false, status: 500, error: 'data.prices runs on its own in one call: pass checkIds: ["data.prices"] and no cursor.' });
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("the shop's price and before-price both here: a pass, ONE finished run under ONE audit entry that holds no rows, GETs only", async () => {
    expect(await statePlan()).toMatchObject({ ok: true });
    vi.clearAllMocks();
    calls.length = 0;
    S.products = [woo("101")];
    const r = await run();
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    if (!r.ok) return;
    expect(getTool("migration.run_checks")!.output.safeParse(JSON.parse(JSON.stringify(r.result))).success).toBe(true);
    expect(r.result).toMatchObject({ checkId: "data.prices", status: "pass", finished: true, nextCursor: null, compared: 1, matched: 1, source: 1, sourceTotal: 3 });
    expect(new Set(calls.map((c) => `${c.init.method} ${c.url.origin}`))).toEqual(new Set([`GET ${SHOP}`]));
    expect(P.migrationCheckRun.create).toHaveBeenCalledTimes(1);
    const data = runData()!;
    expect(data).toMatchObject({ projectId: "proj-1", checkId: "data.prices", phase: "before", status: "pass", actor: CTX.actor, id: (r.result as { runId: string }).runId });
    expect(data.bindings).toEqual({ snapshotId: "snap-1", configHash: configHashOf(NEW) });
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.withAudit.mock.calls[0][0] as { tool: string; args: Record<string, unknown> };
    expect(audit).toMatchObject({ tool: "migration.run_checks", args: { checkIds: ["data.prices"], status: "pass" } });
    expect(JSON.stringify(audit.args)).not.toContain("101");
  });

  it("an imported price one øre below the shop's fails, and the run keeps the row", async () => {
    expect(await statePlan()).toMatchObject({ ok: true });
    S.products = [woo("101", { priceDkk: 79899 })];
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "fail", mispriced: 1, diffs: { count: 1, first: [{ externalId: "101", diff: "mispriced", source: 79900, here: 79899 }] } } });
    expect(runData()).toMatchObject({ checkId: "data.prices", status: "fail" });
  });

  it("the sale's before-price not imported: the price matches, and the run is a warn that names it", async () => {
    expect(await statePlan()).toMatchObject({ ok: true });
    S.products = [woo("101", { compareAtDkk: null })];
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "warn", compareAtNotImported: 1, mispriced: 0, diffs: { first: [{ externalId: "101", diff: "compareAtNotImported", source: 99900, here: null }] } } });
  });

  it("with no tax basis stated on the last plan, nothing is compared: inconclusive, recorded with why", async () => {
    S.products = [woo("101", { priceDkk: 1 })];
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "inconclusive", compared: 0, mispriced: 0 } });
    if (r.ok) expect((r.result as { detail: string }).detail).toMatch(/^Nobody has said whether the shop's prices include VAT/);
    expect(runData()).toMatchObject({ checkId: "data.prices", status: "inconclusive" });
  });

  it("a product soft-deleted here is not one of the imported prices", async () => {
    expect(await statePlan()).toMatchObject({ ok: true });
    S.products = [woo("101"), woo("102", { deletedAt: new Date(), priceDkk: 1 })];
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "pass", imported: 1 } });
  });

  it("a shop that cannot be read is an inconclusive run, never a fail — recorded with why", async () => {
    expect(await statePlan()).toMatchObject({ ok: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    S.products = [woo("101", { priceDkk: 1 })];
    const r = await run();
    expect(r).toMatchObject({ ok: true, result: { status: "inconclusive", imported: 1, compared: 0 } });
    if (r.ok) expect((r.result as { detail: string }).detail).toMatch(/^Reading the shop failed: WooCommerce answered HTTP 404/);
    expect(runData()).toMatchObject({ checkId: "data.prices", status: "inconclusive" });
  });

  it("the static commerce seam takes the same arguments as the real runWooDataPrices, and refuses", async () => {
    type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const sameParameters: Same<Parameters<typeof commerceSeam.runWooDataPrices>, Parameters<typeof commerceStatic.runWooDataPrices>> = true;
    expect(sameParameters).toBe(true);
    expect(commerceStatic.runWooDataPrices.length).toBe(commerceSeam.runWooDataPrices.length);
    await expect(commerceStatic.runWooDataPrices("apikey:test", { requestId: "r" } as never)).rejects.toThrow(/does not have/);
  });
});
