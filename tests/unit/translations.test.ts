import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Oversættelses-admin (H9 + v0.15.0 i18n-bredde) — status-dækning + save-merge
 * for alle oversættelses-bare entiteter (product, category, page, service, post).
 * Mocket prisma + audit.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    category: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    page: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    service: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    post: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
  withAudit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

function reset() {
  vi.resetModules();
  for (const m of Object.values(mocks.prisma)) {
    for (const fn of Object.values(m)) fn.mockReset();
    // Default: empty lists so getTranslationStatus never hits an undefined mock.
    m.findMany.mockResolvedValue([]);
    m.update.mockResolvedValue({});
  }
  mocks.withAudit.mockReset().mockImplementation(async (_m: unknown, fn: () => Promise<unknown>) => fn());
}

describe("getTranslationStatus", () => {
  beforeEach(reset);
  it("markerer hasEn korrekt og dækker alle entitetstyper", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      { id: "p1", name: "A", translations: { en: { name: "A-en" } } },
      { id: "p2", name: "B", translations: null },
    ]);
    mocks.prisma.page.findMany.mockResolvedValue([
      { id: "pg1", title: "Om os", translations: { en: { title: "About" } } },
    ]);
    const { getTranslationStatus } = await import("@/lib/translations");
    const s = await getTranslationStatus();
    expect(s.products.find((p) => p.id === "p1")?.hasEn).toBe(true);
    expect(s.products.find((p) => p.id === "p2")?.hasEn).toBe(false);
    // Pages bruger `title` som label men eksponeres som `name` i listen.
    expect(s.pages.find((p) => p.id === "pg1")).toMatchObject({ name: "Om os", hasEn: true });
    expect(s.services).toEqual([]);
    expect(s.posts).toEqual([]);
  });
});

describe("getEntityForTranslation", () => {
  beforeEach(reset);

  it("læser page-kildefelter (title, body)", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue({
      id: "pg1",
      title: "Om os",
      body: "Brødtekst",
      translations: { en: { title: "About" } },
    });
    const { getEntityForTranslation } = await import("@/lib/translations");
    const e = await getEntityForTranslation("page", "pg1");
    expect(e).toMatchObject({
      type: "page",
      fields: ["title", "body"],
      source: { title: "Om os", body: "Brødtekst" },
      en: { title: "About", body: "" },
    });
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

  it("gemmer service med dens egne oversættelses-bare felter (og dropper ukendte)", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue({ translations: null });
    const { saveEntityTranslation } = await import("@/lib/translations");
    await saveEntityTranslation(
      "service",
      "s1",
      { title: "Build", shortDescription: "Fast", body: "Long", bogus: "drop" },
      "user:test",
    );
    const data = mocks.prisma.service.update.mock.calls[0][0].data;
    expect(data.translations).toEqual({
      en: { title: "Build", shortDescription: "Fast", body: "Long" },
    });
  });
});
