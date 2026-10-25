import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { getTool, invokeTool } from "@/lib/tools/registry";
import type { ToolCtx } from "@/lib/tools/types";
import { ADMIN_TOOL_ALLOWLIST, CONFIRM_REQUIRED, CUSTOMER_TOOL_ALLOWLIST, needsConfirmation } from "@/lib/ai/client";
import { buildVoiceShopTools } from "@/lib/voice/tools";
import { planWooCatalog } from "@/lib/woo/plan";
import { loadMigrationBoard } from "@/lib/migration/store";
import type { WooPlanSummary } from "@/lib/migration/woo-plan-summary";
import { assertResolvedAddressesPublic } from "@/lib/import/safe-fetch";
import { fixtureTransport, wooSnapshot, type RecordedCall } from "./woo-fixture-shop";

/**
 * W21-live-7-a — migration.woo_plan (lib/tools/migration-woo.ts), mirroring
 * migration-tools.test.ts: the registry contract and the moat (admin / build
 * agent only, no confirm, never the shopper chat or voice), the runtime flag
 * off ⇒ refused before any read or request, and the point of the tool: it
 * plans against the catalogue and writes NO catalogue row — its one write is
 * the summary, a compare-and-set on the project under one audit entry.
 *
 * The shop is the synthetic fixture shop (woo-fixture-shop.ts) behind a
 * stubbed `fetch`; the database is a small in-memory fake.
 */

const mocks = vi.hoisted(() => {
  const state = {
    project: null as Record<string, unknown> | null,
    categories: [] as Record<string, unknown>[],
    products: [] as Record<string, unknown>[],
    features: { migrationDashboard: true } as Record<string, boolean>,
    available: true,
  };
  /** Every catalogue write a Prisma delegate has: none may be called. */
  const writes = () => Object.fromEntries(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"].map((op) => [op, vi.fn()]));
  const prisma = {
    migrationProject: {
      findFirst: vi.fn(async () => state.project),
      findUnique: vi.fn(async () => state.project),
      // Compare-and-set: only a row still carrying the updatedAt the caller read is written.
      updateMany: vi.fn(async (args: { where: { updatedAt?: Date }; data: Record<string, unknown> }) => {
        if (args.where.updatedAt?.getTime() !== (state.project?.updatedAt as Date | undefined)?.getTime()) return { count: 0 };
        state.project = { ...state.project, ...args.data };
        return { count: 1 };
      }),
    },
    migrationUrlMap: { count: vi.fn(async () => 0) },
    migrationCheckRun: { findMany: vi.fn(async () => []) },
    category: { findMany: vi.fn(async () => state.categories), ...writes() },
    product: { findMany: vi.fn(async () => state.products), ...writes() },
    productVariant: { findMany: vi.fn(async () => []), ...writes() },
  };
  return {
    state,
    prisma,
    withAudit: vi.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()),
    gate: vi.fn(async () => ({ available: state.available, features: { ...state.features } })),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
// The plan is pinned to a DKK shop whose prices include VAT, as the fixture shop's are. A scaffold
// writes its own currency and VAT basis into brand.config.ts, and a different basis turns every
// product into `blocked` — so the test sets the policy instead of inheriting the engine's.
vi.mock("@/brand.config", async (orig) => {
  const actual = await orig<typeof import("@/brand.config")>();
  return { ...actual, brand: { ...actual.brand, policies: { ...actual.brand.policies, currency: "DKK", pricesIncludeVat: true } } };
});
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/brand", async (orig) => ({ ...(await orig<typeof import("@/lib/brand")>()), getFeatureGateState: mocks.gate }));
// The fixture host is invented: no DNS answer to check.
vi.mock("@/lib/import/safe-fetch", async (orig) => ({ ...(await orig<typeof import("@/lib/import/safe-fetch")>()), assertResolvedAddressesPublic: vi.fn(async () => {}) }));

const P = mocks.prisma;
const S = mocks.state;
const CTX: ToolCtx = { actor: "apikey:test", requestId: "test-woo-plan" };
const NAME = "migration.woo_plan";
const SHOP = "https://shop.example.test";
const DISABLED = "Migration dashboard is disabled. Enable 'migrationDashboard' (/admin/features) first.";
const READ = new Date("2026-10-24T08:00:00Z");

const invoke = (args: unknown, scopes: readonly string[] = ["settings:read"]) => invokeTool(NAME, args, CTX, scopes as never);
const catalogueWrites = () =>
  [P.category, P.product, P.productVariant].flatMap((d) =>
    Object.entries(d).filter(([op]) => op !== "findMany").flatMap(([, f]) => (f as ReturnType<typeof vi.fn>).mock.calls));
let calls: RecordedCall[];

beforeEach(() => {
  vi.clearAllMocks();
  S.project = { id: "proj-1", sourceUrl: SHOP, targetUrl: null, settings: { keep: "me" }, attestations: null, createdAt: READ, updatedAt: READ };
  S.categories = [];
  S.products = [];
  S.features = { migrationDashboard: true };
  S.available = true;
  calls = [];
  vi.stubGlobal("fetch", fixtureTransport(calls));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("migration.woo_plan — registry contract + the moat", () => {
  it("is registered on settings:read, the admin / build agent's, and runs without a plan card", () => {
    expect(getTool(NAME)?.scope).toBe("settings:read");
    expect(ADMIN_TOOL_ALLOWLIST as readonly string[]).toContain(NAME);
    expect(CONFIRM_REQUIRED.has(NAME as never)).toBe(false);
    expect(needsConfirmation(NAME, {})).toBe(false);
  });

  it("never reaches the shopper chat or voice", () => {
    expect(CUSTOMER_TOOL_ALLOWLIST as readonly string[]).not.toContain(NAME);
    expect(buildVoiceShopTools([NAME]).effectiveTools).toEqual([]);
  });

  it("403 without the scope, and 422 on a budget out of range before the gate is asked", async () => {
    expect(await invoke({}, [])).toMatchObject({ ok: false, status: 403 });
    for (const budgetSeconds of [5, 241, 30.5]) expect(await invoke({ budgetSeconds })).toMatchObject({ ok: false, status: 422 });
    expect(mocks.gate).not.toHaveBeenCalled();
  });
});

describe("migration.woo_plan — the runtime flag and the project", () => {
  it("off ⇒ refused before any read or request; unreadable flags fail closed", async () => {
    S.features = { migrationDashboard: false };
    expect(await invoke({})).toMatchObject({ ok: false, status: 500, error: DISABLED });
    S.available = false;
    expect(await invoke({})).toMatchObject({ ok: false, status: 500, error: expect.stringContaining("unavailable") });
    expect(P.migrationProject.findFirst).not.toHaveBeenCalled();
    expect(P.product.findMany).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("no project ⇒ refused before a request", async () => {
    S.project = null;
    expect(await invoke({})).toMatchObject({ ok: false, status: 500, error: expect.stringContaining("No migration project yet") });
    expect(calls).toEqual([]);
  });
});

describe("migration.woo_plan — plans, and writes no catalogue row", () => {
  it("plans the source shop against the catalogue, keeps the summary in settings.wooPlan, and returns it", async () => {
    const hand = { id: "p-hand", source: null, externalId: null, slug: "bordlampe-ida", permalink: null, sku: null };
    S.products = [hand];
    const r = await invoke({ sourcePricesIncludeVat: true });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    if (!r.ok) return;
    expect(getTool(NAME)!.output.safeParse(JSON.parse(JSON.stringify(r.result))).success).toBe(true);
    const direct = await planWooCatalog(wooSnapshot(), { categories: [], products: [hand] }, { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true });
    const result = r.result as { counts: unknown; storeUrl: string; issues: { first: { externalId: string; action: string }[] } };
    expect(result.counts).toEqual(direct.counts);
    expect(result.storeUrl).toBe(`${SHOP}/`);
    expect(result.issues.first).toContainEqual(expect.objectContaining({ externalId: "101", action: "conflict" }));
    // Only GETs, only to the project's source, and its address is checked to be public.
    expect(new Set(calls.map((c) => `${c.init.method} ${c.url.origin}`))).toEqual(new Set([`GET ${SHOP}`]));
    expect(assertResolvedAddressesPublic).toHaveBeenCalledWith("shop.example.test");
    // The catalogue is read whole — soft-deleted rows keep their keys — and never written.
    expect(P.product.findMany).toHaveBeenCalledWith({ select: expect.objectContaining({ sku: true, slug: true, permalink: true, source: true, externalId: true }) });
    expect(catalogueWrites()).toEqual([]);
    // One compare-and-set on the project; the other settings stay.
    expect(P.migrationProject.updateMany).toHaveBeenCalledTimes(1);
    const cas = P.migrationProject.updateMany.mock.calls[0][0] as { where: { updatedAt: Date }; data: { settings: { keep: string; wooPlan: { version: number } }; updatedAt: Date } };
    expect(cas.where.updatedAt).toEqual(READ);
    expect(cas.data.settings).toMatchObject({ keep: "me", wooPlan: { version: 1 } });
    expect(cas.data.updatedAt.getTime()).toBeGreaterThan(READ.getTime());
    // One audit entry, with the counts and not the rows.
    expect(mocks.withAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.withAudit.mock.calls[0][0] as { tool: string; args: Record<string, unknown> };
    expect(audit.tool).toBe(NAME);
    expect(Object.keys(audit.args).sort()).toEqual(["counts", "projectId", "sourcePricesIncludeVat"]);
  });

  it("until the importer exists, a row already here from an earlier import plans as a conflict — and the tool says so", async () => {
    S.products = [{ id: "p-woo", source: "woocommerce", externalId: "101", slug: "bordlampe-ida", permalink: null, sku: null }];
    const r = await invoke({ sourcePricesIncludeVat: true });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    if (!r.ok) return;
    const result = r.result as WooPlanSummary;
    expect(result.issues.first).toContainEqual(expect.objectContaining({ kind: "product", externalId: "101", action: "conflict", dbId: "p-woo" }));
    for (const kind of ["categories", "products"] as const) {
      expect([result.counts[kind].update, result.counts[kind].unchanged, result.counts[kind].skip]).toEqual([0, 0, 0]);
    }
    const { description } = getTool(NAME)!;
    expect(description).toContain("Until the importer exists (W21-live-2), every row plans as create, conflict, orphan or blocked");
    // migration.project_set keeps only sourceUrl's origin, so a subdirectory install is read at the wrong path.
    expect(description).toContain("a WordPress installed in a subdirectory, such as https://example.com/shop/, is not supported yet");
    expect(description).not.toMatch(/\(create, update, unchanged, skip/);
    // It returns counts and the first rows to look at, not every row; and a stated tax basis that differs blocks too.
    expect(description).toMatch(/first 50 rows that need a look .*a row to create is only counted.*every product is blocked, and so it is when that differs/);
  });

  it("the board reads the plan back — while the project still names the shop it was read from", async () => {
    expect((await loadMigrationBoard()).wooPlan).toBeNull();
    expect(await invoke({ sourcePricesIncludeVat: true })).toMatchObject({ ok: true });
    const plan = (await loadMigrationBoard()).wooPlan;
    expect(plan).toMatchObject({ version: 1, storeUrl: `${SHOP}/` });
    S.project = { ...S.project, sourceUrl: SHOP };
    expect((await loadMigrationBoard()).wooPlan).not.toBeNull();
    // Origin and path: a second shop on the same host is another shop.
    for (const sourceUrl of ["https://other-shop.example", `${SHOP}/en`]) {
      S.project = { ...S.project, sourceUrl };
      expect((await loadMigrationBoard()).wooPlan, sourceUrl).toBeNull();
    }
    // A stored plan whose storeUrl is no address is not one this code wrote: ignored, not a board read error.
    S.project = { ...S.project, sourceUrl: SHOP, settings: { wooPlan: { ...plan, storeUrl: "shop.example.test" } } };
    expect((await loadMigrationBoard()).wooPlan).toBeNull();
    // A source with an IDN TLD — accepted by migration.project_set — shows its plan.
    const idn = "https://xn--e1afmkfd.xn--p1ai";
    S.project = { ...S.project, sourceUrl: idn, settings: { wooPlan: { ...plan, storeUrl: `${idn}/` } } };
    expect((await loadMigrationBoard()).wooPlan).not.toBeNull();
  });

  it("a project write saved while the shop was read is re-read and kept, not overwritten", async () => {
    const signed = {
      ...S.project, settings: { keep: "me", added: "meanwhile" }, attestations: { "pay.test-order": { status: "pass" } }, updatedAt: new Date(READ.getTime() + 5),
    };
    P.migrationProject.findUnique.mockImplementationOnce(async () => {
      const stale = S.project;
      S.project = signed;
      return stale;
    });
    expect(await invoke({ sourcePricesIncludeVat: true })).toMatchObject({ ok: true });
    expect(P.migrationProject.updateMany).toHaveBeenCalledTimes(2);
    expect(S.project).toMatchObject({ attestations: { "pay.test-order": { status: "pass" } }, settings: { keep: "me", added: "meanwhile", wooPlan: { version: 1 } } });
  });

  it("a plan of another source than the project now names is not saved — another host, or another path on this one", async () => {
    for (const sourceUrl of ["https://other-shop.example", `${SHOP}/en/`]) {
      P.migrationProject.findUnique.mockResolvedValueOnce({ ...S.project, sourceUrl });
      const r = await invoke({ sourcePricesIncludeVat: true });
      expect(r, sourceUrl).toMatchObject({ ok: false, status: 500, error: expect.stringContaining("source changed") });
    }
    expect(P.migrationProject.updateMany).not.toHaveBeenCalled();
  });

  it("a shop that redirects is not followed: the error names the fix, and nothing is saved", async () => {
    // A fetch that does what the redirect mode says: "manual" hands back the 301, any other mode lands on the shop.
    const shop = fixtureTransport(calls);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) =>
      init.redirect === "manual" ? new Response(null, { status: 301, headers: { location: "https://www.shop.example.test/" } }) : shop(url, init as never)));
    const r = await invoke({ sourcePricesIncludeVat: true });
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/HTTP 301.*migration\.project_set.*Nothing was saved/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`${SHOP}/wp-json/`), expect.objectContaining({ redirect: "manual" }));
    expect(P.migrationProject.updateMany).not.toHaveBeenCalled();
    expect(mocks.withAudit).not.toHaveBeenCalled();
  });

  it("stops at budgetSeconds: no request starts after it, and nothing is saved", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const transport = fixtureTransport(calls);
    // Each answer takes 5 s: the third request would start exactly at the 10 s deadline.
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: never) => {
      vi.setSystemTime(Date.now() + 5_000);
      return transport(url, init);
    }));
    const started = Date.now();
    const r = await invoke({ sourcePricesIncludeVat: true, budgetSeconds: 10 });
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/cannot finish within 10 s.*nothing was saved/);
    expect(calls).toHaveLength(2);
    expect(Date.now() - started).toBe(10_000);
    expect(P.migrationProject.updateMany).not.toHaveBeenCalled();
  });

  /** The budget's timer, in the test's hand: `fire()` aborts it the way AbortSignal.timeout does. */
  function budgetTimer() {
    vi.useFakeTimers({ toFake: ["Date"] });
    const budget = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(budget.signal);
    onTestFinished(() => timeout.mockRestore());
    return { deadline: Date.now() + 10_000, timeout, fire: () => budget.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")) };
  }

  it("an HTTP error in hand as the budget runs out is that error, not the budget", async () => {
    const { deadline, fire } = budgetTimer();
    vi.stubGlobal("fetch", vi.fn(async () => {
      vi.setSystemTime(deadline);
      fire();
      return new Response("gone", { status: 404 });
    }));
    const r = await invoke({ sourcePricesIncludeVat: true, budgetSeconds: 10 });
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/^Reading the shop failed: WooCommerce answered HTTP 404 for .*Nothing was saved\.$/);
  });

  it("the budget's own abort is the budget, even when its timer fires a millisecond before the deadline", async () => {
    const { deadline, fire, timeout } = budgetTimer();
    let n = 0;
    // Three 503s retried at once, then the last attempt is cut off by the budget, 1 ms early.
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { signal: AbortSignal }) => {
      if (++n < 4) return new Response("busy", { status: 503, headers: { "retry-after": "0" } });
      vi.setSystemTime(deadline - 1);
      fire();
      throw init.signal.reason;
    }));
    const r = await invoke({ sourcePricesIncludeVat: true, budgetSeconds: 10 });
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/cannot finish within 10 s/);
    expect(n).toBe(4);
    // The timer is the budget itself: 10 s, not a multiple of it.
    expect(timeout).toHaveBeenCalledWith(10_000);
  });

  it("a DNS lookup that never answers is cut at the budget too, with the budget's message", async () => {
    const { fire, timeout } = budgetTimer();
    vi.mocked(assertResolvedAddressesPublic).mockImplementationOnce(() => {
      setTimeout(fire, 0);
      return new Promise<void>(() => {});
    });
    const r = await invoke({ sourcePricesIncludeVat: true, budgetSeconds: 10 });
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/cannot finish within 10 s.*nothing was saved/);
    expect(assertResolvedAddressesPublic).toHaveBeenCalledWith("shop.example.test");
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(calls).toEqual([]);
  }, 2_000);

  it("never waits past the deadline: a Retry-After beyond it ends the read at once", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503, headers: { "retry-after": "30" } })));
    const r = await invoke({ sourcePricesIncludeVat: true, budgetSeconds: 10 });
    expect(r).toMatchObject({ ok: false, status: 500 });
    if (!r.ok) expect(r.error).toMatch(/cannot finish within 10 s/);
    expect(fetch).toHaveBeenCalledTimes(1);
  }, 2_000);
});
