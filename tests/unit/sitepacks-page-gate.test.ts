/**
 * /admin/sitepacks gates on the RUNTIME `sitePack` flag — the view
 * `getFeatures()` resolves (brand.config default merged with the
 * /admin/features override) — not on compile-time `brand.features`, which
 * ignores the override and made the admin toggle a no-op until a redeploy
 * (the cron-gate class). Flag off ⇒ the page 404s like its nav entry is gone
 * (the genome / registry-stats precedent); flag on ⇒ the wizard renders.
 *
 * The page is driven for real: `getFeatures` is the only seam faked for the
 * flag, so a page that read `brand.features.sitePack` would ignore the
 * override here exactly as it did in production — and go red.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ user: { id: "admin-1", role: "admin" } })),
  getFeatures: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/brand", () => ({ getFeatures: mocks.getFeatures }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: mocks.notFound,
}));
// Client component — its body (hooks, uploads) is not this gate's concern.
vi.mock("@/app/admin/sitepacks/SitePackWizard", () => ({
  SitePackWizard: () => null,
}));

const { default: SitePacksPage } = await import("@/app/admin/sitepacks/page");

describe("/admin/sitepacks honours the runtime sitePack flag", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockClear();
    mocks.getFeatures.mockReset();
    mocks.notFound.mockClear();
  });

  it("404s when the runtime flag is off — even though brand.config could say otherwise", async () => {
    mocks.getFeatures.mockResolvedValue({ sitePack: false });
    await expect(SitePacksPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getFeatures).toHaveBeenCalledTimes(1);
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("renders the wizard when the runtime flag is on", async () => {
    mocks.getFeatures.mockResolvedValue({ sitePack: true });
    const element = await SitePacksPage();
    expect(element).toBeTruthy();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("checks the admin session before reading the flag (no flag probe for strangers)", async () => {
    const order: string[] = [];
    mocks.requireAdmin.mockImplementationOnce(async () => {
      order.push("requireAdmin");
      return { user: { id: "admin-1", role: "admin" } };
    });
    mocks.getFeatures.mockImplementation(async () => {
      order.push("getFeatures");
      return { sitePack: true };
    });
    await SitePacksPage();
    expect(order).toEqual(["requireAdmin", "getFeatures"]);
  });
});
