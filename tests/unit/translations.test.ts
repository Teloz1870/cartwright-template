import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Oversættelses-admin (H9) — status-dækning + save-merge. Mocket prisma + audit.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    category: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
  withAudit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

function reset() {
  vi.resetModules();
  for (const m of [mocks.prisma.product, mocks.prisma.category]) {
    for (const fn of Object.values(m)) fn.mockReset();
  }
  mocks.prisma.product.update.mockResolvedValue({});
  mocks.prisma.category.update.mockResolvedValue({});
  mocks.withAudit.mockReset().mockImplementation(async (_m: unknown, fn: () => Promise<unknown>) => fn());
}

describe("getTranslationStatus", () => {
  beforeEach(reset);
  it("markerer hasEn korrekt", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      { id: "p1", name: "A", translations: { en: { name: "A-en" } } },
      { id: "p2", name: "B", translations: null },
    ]);
    mocks.prisma.category.findMany.mockResolvedValue([]);
    const { getTranslationStatus } = await import("@/lib/translations");
    const s = await getTranslationStatus();
    expect(s.products.find((p) => p.id === "p1")?.hasEn).toBe(true);
    expect(s.products.find((p) => p.id === "p2")?.hasEn).toBe(false);
  });
});

describe("saveEntityTranslation", () => {
  beforeEach(reset);

  it("merger en ind i eksisterende translations (beholder andre keys)", async () => {
    mocks.prisma.product.findUnique.mockResolvedValue({
      translations: { de: { name: "A-de" } },
    });
    const { saveEntityTranslation } = await import("@/lib/translations");
    const r = await saveEntityTranslation("product", "p1", { name: "A-en", description: "d-en" }, "user:test");
    expect(r.ok).toBe(true);
    const data = mocks.prisma.product.update.mock.calls[0][0].data;
    expect(data.translations).toEqual({ de: { name: "A-de" }, en: { name: "A-en", description: "d-en" } });
  });

  it("dropper tomme felter", async () => {
    mocks.prisma.category.findUnique.mockResolvedValue({ translations: null });
    const { saveEntityTranslation } = await import("@/lib/translations");
    await saveEntityTranslation("category", "c1", { name: "Kat-en", description: "  " }, "user:test");
    const data = mocks.prisma.category.update.mock.calls[0][0].data;
    expect(data.translations).toEqual({ en: { name: "Kat-en" } });
  });
});
