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
