import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: { page: { findMany: mocks.findMany, findFirst: mocks.findFirst } } }));

describe("public site tools", () => {
  beforeEach(() => vi.clearAllMocks());

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
});
