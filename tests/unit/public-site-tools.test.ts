import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), queryRaw: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: { page: { findMany: mocks.findMany, findFirst: mocks.findFirst }, $queryRaw: mocks.queryRaw } }));

describe("public site tools", () => {
  beforeEach(() => vi.resetAllMocks());

  it("list_pages enforces published status in the database query", async () => {
    mocks.findMany.mockResolvedValue([{ slug: "about", title: "About", metaDescription: null, updatedAt: new Date(0) }]);
    const { listPublicPages } = await import("@/lib/tools/site");
    const result = await listPublicPages.handler({ locale: "en" }, { actor: "system:test" });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "published" } }));
    expect(result).toEqual([expect.objectContaining({ slug: "about", url: "/en/about" })]);
  });

  it("get_page cannot return a draft because status is part of findFirst", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const { getPublicPage } = await import("@/lib/tools/site");
    await expect(getPublicPage.handler({ slug: "secret-draft", locale: "en" }, { actor: "system:test" })).resolves.toEqual({ found: false, slug: "secret-draft" });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: "secret-draft", status: "published" } }));
  });

  it("supports pre-draft databases only when Page.status is the missing column", async () => {
    mocks.findMany.mockRejectedValue(new Error("no such column: main.Page.status"));
    mocks.queryRaw.mockResolvedValue([{ slug: "about", title: "About", metaDescription: null, updatedAt: new Date(0) }]);
    const { listPublicPages } = await import("@/lib/tools/site");
    await expect(listPublicPages.handler({ locale: "en" }, { actor: "system:test" })).resolves.toEqual([
      expect.objectContaining({ slug: "about", url: "/en/about" }),
    ]);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });

  it("parameterizes the slug when reading from a pre-draft database", async () => {
    mocks.findFirst.mockRejectedValue(new Error("no such column: main.Page.status"));
    mocks.queryRaw.mockResolvedValue([{ slug: "about", title: "About", body: "Our story", metaDescription: null, updatedAt: new Date(0) }]);
    const { getPublicPage } = await import("@/lib/tools/site");
    await expect(getPublicPage.handler({ slug: "about", locale: "en" }, { actor: "system:test" })).resolves.toEqual(
      expect.objectContaining({ slug: "about", body: "Our story" }),
    );
    expect(mocks.queryRaw.mock.calls[0]?.[1]).toBe("about");
  });

  it("never hides unrelated database failures behind the legacy fallback", async () => {
    mocks.findMany.mockRejectedValue(new Error("connection refused"));
    const { listPublicPages } = await import("@/lib/tools/site");
    await expect(listPublicPages.handler({ locale: "en" }, { actor: "system:test" })).rejects.toThrow("connection refused");
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});
