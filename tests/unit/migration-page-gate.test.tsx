/**
 * MIGD-1a: /admin/migration gates on the RUNTIME `migrationDashboard` flag —
 * `getFeatures()`, the view /admin/features writes to — never on compile-time
 * `brand.features` (the sitepacks-page-gate class). Flag off ⇒ the page 404s
 * BEFORE any Migration* read and the nav entry is gone, so a canary that never
 * turns it on renders the admin exactly as before. Flag on ⇒ the board lists
 * every catalogue row as "not run" under "Ready for DNS switch: 0/m".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/brand.config";
import { FEATURE_MANIFEST } from "@/lib/feature-flags/manifest";
import { NAV_GROUPS, filterNav } from "@/lib/admin/nav";
import { CHECK_CATALOG } from "@/lib/migration/catalog";
import { WOO_PLAN_ACTIONS } from "@/lib/migration/woo-plan-summary";
import { planWooCatalog } from "@/lib/woo/plan";
import { summarizeWooPlan } from "@/lib/woo/summary";
import { wooSnapshot } from "./woo-fixture-shop";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ user: { id: "admin-1", role: "admin" } })),
  getFeatures: vi.fn(),
  loadMigrationBoard: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/brand", () => ({ getFeatures: mocks.getFeatures }));
vi.mock("@/lib/migration/store", () => ({ loadMigrationBoard: mocks.loadMigrationBoard }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: mocks.notFound,
}));

const { default: MigrationPage } = await import("@/app/admin/migration/page");

const requiredCount = CHECK_CATALOG.filter((r) => r.required).length;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadMigrationBoard.mockResolvedValue({ project: null, urlCount: 0, latest: new Map() });
});

describe("/admin/migration honours the runtime migrationDashboard flag", () => {
  it("404s when the flag is off — before reading any Migration* table", async () => {
    mocks.getFeatures.mockResolvedValue({ migrationDashboard: false });
    await expect(MigrationPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
    expect(mocks.loadMigrationBoard).not.toHaveBeenCalled();
  });

  it("checks the admin session before reading the flag", async () => {
    const order: string[] = [];
    mocks.requireAdmin.mockImplementationOnce(async () => {
      order.push("requireAdmin");
      return { user: { id: "admin-1", role: "admin" } };
    });
    mocks.getFeatures.mockImplementation(async () => {
      order.push("getFeatures");
      return { migrationDashboard: false };
    });
    await expect(MigrationPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(order).toEqual(["requireAdmin", "getFeatures"]);
  });

  it("flag on: every catalogue row reads “not run” under Ready for DNS switch: 0/m", async () => {
    mocks.getFeatures.mockResolvedValue({ migrationDashboard: true });
    const html = renderToStaticMarkup(await MigrationPage());
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(html).toContain(`Ready for DNS switch: 0/${requiredCount}`);
    expect(html.match(/>not run</g)).toHaveLength(CHECK_CATALOG.length);
    for (const row of CHECK_CATALOG) expect(html).toContain(`<code>${row.id}</code>`);
  });

  it("counts a pass only on the bindings the board reports as current — the snapshot and the new site (R1)", async () => {
    mocks.getFeatures.mockResolvedValue({ migrationDashboard: true });
    const bindings = { snapshotId: "s1", configHash: "site-a" };
    const latest = new Map([["url.parity", { checkId: "url.parity", status: "pass", finishedAt: new Date(), bindings }]]);
    const project = { id: "p", sourceUrl: "https://old.example", targetUrl: "https://b.example", frozenAt: new Date(), switchedAt: null, snapshotId: "s1" };
    mocks.loadMigrationBoard.mockResolvedValue({ project, urlCount: 1, latest, current: { snapshotId: "s1", configHash: "site-b" } });
    expect(renderToStaticMarkup(await MigrationPage())).toContain(`Ready for DNS switch: 0/${requiredCount}`);
    mocks.loadMigrationBoard.mockResolvedValue({ project, urlCount: 1, latest, current: bindings });
    expect(renderToStaticMarkup(await MigrationPage())).toContain(`Ready for DNS switch: 1/${requiredCount}`);
  });

  it("flag on with the tables missing: the board still renders, at 0/m, and says why", async () => {
    mocks.getFeatures.mockResolvedValue({ migrationDashboard: true });
    mocks.loadMigrationBoard.mockRejectedValue(new Error("no such table: MigrationProject"));
    const html = renderToStaticMarkup(await MigrationPage());
    expect(html).toContain(`Ready for DNS switch: 0/${requiredCount}`);
    expect(html).toContain("no such table: MigrationProject");
  });
});

describe("the WooCommerce import plan card (W21-live-7-a)", () => {
  const project = { id: "p", sourceUrl: "https://shop.example.test", targetUrl: null, frozenAt: null, switchedAt: null, snapshotId: null };
  async function summary() {
    const snapshot = wooSnapshot();
    const hand = { id: "p-hand", source: null, externalId: null, slug: "bordlampe-ida", permalink: null, sku: null };
    const plan = await planWooCatalog(snapshot, { categories: [], products: [hand] }, { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true });
    return summarizeWooPlan(plan, snapshot, { currency: "DKK", pricesIncludeVat: true, sourcePricesIncludeVat: true, durationMs: 900, now: new Date("2026-10-24T09:00:00Z") });
  }

  it("a board without a plan (or read before the field existed) says how to make one", async () => {
    mocks.getFeatures.mockResolvedValue({ migrationDashboard: true });
    const html = renderToStaticMarkup(await MigrationPage());
    expect(html).toContain("WooCommerce import plan (dry run)");
    expect(html).toContain("No import plan yet.");
  });

  it("shows the counts per action and the rows that need a look", async () => {
    mocks.getFeatures.mockResolvedValue({ migrationDashboard: true });
    const wooPlan = await summary();
    mocks.loadMigrationBoard.mockResolvedValue({ project, urlCount: 0, latest: new Map(), current: {}, wooPlan });
    const html = renderToStaticMarkup(await MigrationPage());
    expect(html).not.toContain("No import plan yet.");
    expect(html).toContain("Planned 2026-10-24 09:00 UTC from https://shop.example.test/");
    const cells = (row: string) => [...(html.match(new RegExp(`${row}</td>(.*?)</tr>`))?.[1] ?? "").matchAll(/>(\d+)</g)].map((m) => Number(m[1]));
    expect(cells("Products")).toEqual(WOO_PLAN_ACTIONS.map((a) => wooPlan.counts.products[a]));
    expect(wooPlan.counts.products.conflict).toBe(1);
    expect(html).toContain("is taken by a hand-made product p-hand");
    expect(html).toContain(">conflict</span>");
    expect(html).not.toContain("the first 20 of");
  });

  it("lists at most 20 rows and says how many there are — also when all of them are stored (21–50 flagged rows)", async () => {
    mocks.getFeatures.mockResolvedValue({ migrationDashboard: true });
    const wooPlan = await summary();
    const many = Array.from({ length: 30 }, (_, n) => ({ kind: "product" as const, externalId: `9${n}`, action: "blocked" as const, reason: `reason-${n}` }));
    for (const count of [75, 30]) {
      wooPlan.issues = { count, first: many };
      mocks.loadMigrationBoard.mockResolvedValue({ project, urlCount: 0, latest: new Map(), current: {}, wooPlan });
      const html = renderToStaticMarkup(await MigrationPage());
      expect(html).toContain("reason-19");
      expect(html).not.toContain("reason-20");
      expect(html).toContain(`the first 20 of ${count} rows that need a look`);
    }
  });

  it("says that update, unchanged and skip wait for the importer", async () => {
    mocks.getFeatures.mockResolvedValue({ migrationDashboard: true });
    mocks.loadMigrationBoard.mockResolvedValue({ project, urlCount: 0, latest: new Map(), current: {}, wooPlan: await summary() });
    const html = renderToStaticMarkup(await MigrationPage());
    expect(html).toContain("Until the importer exists (W21-live-2), update, unchanged and skip stay 0: a row already here from an earlier import plans as a conflict.");
  });

  it("lists the rows gone from the source and the mapping warnings, the first 20 of each, and how many there are", async () => {
    mocks.getFeatures.mockResolvedValue({ migrationDashboard: true });
    const wooPlan = await summary();
    wooPlan.missingInSource = { count: 30, first: Array.from({ length: 20 }, (_, n) => ({ kind: "product" as const, externalId: `7${n}`, dbId: `gone-${n}` })) };
    wooPlan.warnings = {
      byCode: { slugRewritten: 25, noPrice: 3 },
      first: Array.from({ length: 20 }, (_, n) => ({ code: "slugRewritten", externalId: `8${n}`, detail: `detail-${n}` })),
    };
    mocks.loadMigrationBoard.mockResolvedValue({ project, urlCount: 0, latest: new Map(), current: {}, wooPlan });
    const html = renderToStaticMarkup(await MigrationPage());
    expect(html).toContain("Gone from the source: product 70, here <code>gone-0</code>");
    expect(html).toContain("<code>gone-19</code>");
    expect(html).toContain("the first 20 of 30 rows gone from the source");
    expect(html).toContain("Woo 819: detail-19");
    expect(html).toContain("the first 20 of 28 mapping warnings");
  });

  it("a short list says no \"first n of\"", async () => {
    mocks.getFeatures.mockResolvedValue({ migrationDashboard: true });
    const wooPlan = await summary();
    wooPlan.missingInSource = { count: 1, first: [{ kind: "category", externalId: "11", dbId: "gone-cat" }] };
    wooPlan.warnings = { byCode: { noPrice: 1 }, first: [{ code: "noPrice", externalId: "102", detail: "no price given" }] };
    wooPlan.issues = { count: 2, first: ["first-reason", "second-reason"].map((reason) => ({ kind: "product" as const, externalId: "101", action: "conflict" as const, reason })) };
    mocks.loadMigrationBoard.mockResolvedValue({ project, urlCount: 0, latest: new Map(), current: {}, wooPlan });
    const html = renderToStaticMarkup(await MigrationPage());
    expect(html).toContain("<code>gone-cat</code>");
    expect(html).toContain("Woo 102: no price given");
    expect(html).toContain("first-reason");
    expect(html).toContain("second-reason");
    expect(html).not.toContain("the first ");
  });
});

describe("the flag and the nav entry", () => {
  it("ships default-off as a runtime flag", () => {
    expect(brand.features.migrationDashboard).toBe(false);
    expect(FEATURE_MANIFEST.find((f) => f.key === "migrationDashboard")).toMatchObject({ tier: "runtime", implemented: true });
  });

  it("the nav entry is hidden while the flag is off and shown once it is on", () => {
    const hrefs = (features: Record<string, boolean>) =>
      filterNav(NAV_GROUPS, { ecommerceEnabled: false, features, isProd: true }).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs({})).not.toContain("/admin/migration");
    expect(hrefs({ migrationDashboard: false })).not.toContain("/admin/migration");
    expect(hrefs({ migrationDashboard: true })).toContain("/admin/migration");
  });
});
