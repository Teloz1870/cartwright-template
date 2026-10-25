import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Legal pages (B4) — ensureLegalPages opretter KUN manglende sider, rører
 * aldrig eksisterende. Mocket prisma + brand.config.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    page: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/brand.config", () => ({
  brand: { storeName: "Test Shop", emails: { support: "support@test.dk" } },
}));

function resetAll() {
  vi.resetModules();
  mocks.prisma.page.findUnique.mockReset();
  mocks.prisma.page.create.mockReset().mockResolvedValue({});
  mocks.prisma.page.findMany.mockReset();
}

describe("ensureLegalPages", () => {
  beforeEach(resetAll);

  it("opretter kun manglende sider", async () => {
    // privacy findes, terms + cookies mangler
    mocks.prisma.page.findUnique.mockImplementation(
      async ({ where }: { where: { slug: string } }) =>
        where.slug === "privacy" ? { slug: "privacy" } : null,
    );
    const { ensureLegalPages } = await import("@/lib/gdpr/legal-pages");
    const r = await ensureLegalPages();

    expect(r.existing).toEqual(["privacy"]);
    expect(r.created.sort()).toEqual(["cookies", "terms"]);
    expect(mocks.prisma.page.create).toHaveBeenCalledTimes(2);
    // oprettede sider er ikke i nav (showInNav: false)
    const firstCreate = mocks.prisma.page.create.mock.calls[0][0].data;
    expect(firstCreate.showInNav).toBe(false);
  });

  it("opretter intet når alle findes", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue({ slug: "x" });
    const { ensureLegalPages } = await import("@/lib/gdpr/legal-pages");
    const r = await ensureLegalPages();
    expect(r.created).toEqual([]);
    expect(mocks.prisma.page.create).not.toHaveBeenCalled();
  });
});
