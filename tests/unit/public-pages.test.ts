import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    page: {
      findFirst: db.findFirst,
      findMany: db.findMany,
    },
    $queryRaw: db.queryRaw,
  },
}));

const PAGE = {
  slug: "om-os",
  title: "Our story",
  body: "Substantial public company story.",
  heroImage: null,
  metaTitle: null,
  metaDescription: "Who we are",
  showInNav: true,
  navOrder: 1,
  translations: null,
  updatedAt: new Date("2026-08-24T00:00:00.000Z"),
  vibeHtml: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("published page compatibility", () => {
  it("retries without additive content columns while retaining draft filtering", async () => {
    db.findFirst
      .mockRejectedValueOnce(
        Object.assign(new Error("The column `main.Page.bodyFormat` does not exist"), {
          code: "P2022",
          meta: { column: "main.Page.bodyFormat" },
        }),
      )
      .mockResolvedValueOnce(PAGE);

    const { findPublishedPageBySlug } = await import("@/lib/public-pages");
    const result = await findPublishedPageBySlug("om-os");

    expect(result).toMatchObject({
      slug: "om-os",
      bodyFormat: null,
      layoutJson: null,
    });
    expect(db.findFirst).toHaveBeenCalledTimes(2);
    const retry = db.findFirst.mock.calls[1]![0];
    expect(retry.where).toEqual({ slug: "om-os", status: "published" });
    expect(retry.select).not.toHaveProperty("bodyFormat");
    expect(retry.select).not.toHaveProperty("layoutJson");
    expect(db.queryRaw).not.toHaveBeenCalled();
  });

  it("uses the all-public legacy query only when status itself is also absent", async () => {
    db.findFirst
      .mockRejectedValueOnce(new Error("no such column: main.Page.layoutJson"))
      .mockRejectedValueOnce(new Error("no such column: main.Page.status"));
    db.queryRaw.mockResolvedValueOnce([PAGE]);

    const { findPublishedPageBySlug } = await import("@/lib/public-pages");
    const result = await findPublishedPageBySlug("om-os");

    expect(result).toMatchObject({ slug: "om-os", layoutJson: null });
    expect(db.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("never weakens draft isolation for an unrelated provider failure", async () => {
    db.findFirst.mockRejectedValueOnce(
      new Error("database connection failed: private-provider-sentinel"),
    );

    const { findPublishedPageBySlug } = await import("@/lib/public-pages");

    await expect(findPublishedPageBySlug("about")).rejects.toThrow(
      "private-provider-sentinel",
    );
    expect(db.queryRaw).not.toHaveBeenCalled();
  });

  it("resolves public aliases in explicit priority order", async () => {
    db.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(PAGE);

    const { findFirstPublishedPageBySlugs } = await import("@/lib/public-pages");
    const result = await findFirstPublishedPageBySlugs(["about", "om-os"]);

    expect(result?.slug).toBe("om-os");
    expect(db.findFirst.mock.calls.map(([query]) => query.where.slug)).toEqual([
      "about",
      "om-os",
    ]);
    expect(
      db.findFirst.mock.calls.every(([query]) => query.where.status === "published"),
    ).toBe(true);
  });
});
