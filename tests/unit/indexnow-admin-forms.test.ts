import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IndexNow (FEAT3-a) — the two write paths that can RENAME: the admin page
 * form (app/admin/actions.ts) and the blog editor (plugins/blog/admin/actions).
 * The tools cannot (products.update omits `slug`; pages.upsert and posts.update
 * are keyed by it), so a rename pinging old AND new URL lives only here. Both
 * read the row before the write and report old/new slug + public before/after;
 * lib/indexnow.ts turns that into the URL set (pinned in indexnow.test.ts).
 *
 * prisma, requireAdmin, revalidatePath and the tool registry are mocked —
 * nothing here touches a database or the network.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    page: { findUnique: vi.fn(), update: vi.fn() },
    post: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
  scheduleIndexNowPing: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn().mockResolvedValue({ user: { id: "admin" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/tools/registry", () => ({ invokeTool: vi.fn() }));
vi.mock("@/lib/indexnow", () => ({ scheduleIndexNowPing: mocks.scheduleIndexNowPing }));

beforeEach(() => {
  vi.resetModules();
  for (const model of Object.values(mocks.prisma)) for (const fn of Object.values(model)) fn.mockReset();
  mocks.scheduleIndexNowPing.mockReset();
});

function pageForm(slug: string): FormData {
  const fd = new FormData();
  fd.set("slug", slug);
  fd.set("title", "Terms");
  fd.set("body", "The terms.");
  fd.set("translations", "");
  return fd;
}

describe("admin page form → IndexNow", () => {
  it("a rename reports the slug before AND after the write, so engines drop the old URL", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue({ slug: "terms", status: "published" });
    mocks.prisma.page.update.mockResolvedValue({ id: "p1", slug: "terms-of-sale", status: "published" });
    const { updatePage } = await import("@/app/admin/actions");
    expect(await updatePage("p1", pageForm("terms-of-sale"))).toEqual({ ok: true });
    expect(mocks.prisma.page.findUnique).toHaveBeenCalledWith({ where: { id: "p1" }, select: { slug: true, status: true } });
    expect(mocks.scheduleIndexNowPing).toHaveBeenCalledWith({
      kind: "page",
      oldSlug: "terms",
      newSlug: "terms-of-sale",
      wasPublic: true,
      isPublic: true,
    });
  });

  it("a draft edited in the form stays silent on both sides", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue({ slug: "wip", status: "draft" });
    mocks.prisma.page.update.mockResolvedValue({ id: "p2", slug: "wip", status: "draft" });
    const { updatePage } = await import("@/app/admin/actions");
    await updatePage("p2", pageForm("wip"));
    expect(mocks.scheduleIndexNowPing).toHaveBeenCalledWith(expect.objectContaining({ wasPublic: false, isPublic: false }));
  });
});

const POST_FORM = {
  title: "Spring",
  slug: "",
  excerpt: "",
  body: "A body.",
  coverImage: "",
  author: "",
  status: "published" as const,
  tags: "",
  metaTitle: "",
  metaDescription: "",
};

describe("blog editor → IndexNow", () => {
  it("a rename of a live post reports the slug before AND after the save", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue({ slug: "spring", status: "published", publishedAt: new Date("2025-01-01") });
    mocks.prisma.post.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "b1", ...data }));
    const { savePost } = await import("@/plugins/blog/admin/actions");
    const r = await savePost({ ...POST_FORM, id: "b1", slug: "spring-2026" });
    expect(r).toEqual({ ok: true, id: "b1", slug: "spring-2026" });
    expect(mocks.scheduleIndexNowPing).toHaveBeenCalledWith({
      kind: "post",
      oldSlug: "spring",
      newSlug: "spring-2026",
      wasPublic: true,
      isPublic: true,
    });
  });

  it("unpublishing from the editor reports the post as public BEFORE the save", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue({ slug: "spring", status: "published", publishedAt: new Date("2025-01-01") });
    mocks.prisma.post.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "b1", ...data }));
    const { savePost } = await import("@/plugins/blog/admin/actions");
    await savePost({ ...POST_FORM, id: "b1", slug: "spring", status: "draft" });
    expect(mocks.scheduleIndexNowPing).toHaveBeenCalledWith({ kind: "post", oldSlug: "spring", newSlug: "spring", wasPublic: true, isPublic: false });
  });

  it("a new post has no slug before the save", async () => {
    mocks.prisma.post.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "b2", ...data }));
    const { savePost } = await import("@/plugins/blog/admin/actions");
    await savePost(POST_FORM);
    expect(mocks.prisma.post.findUnique).not.toHaveBeenCalled();
    expect(mocks.scheduleIndexNowPing).toHaveBeenCalledWith({ kind: "post", oldSlug: undefined, newSlug: "spring", wasPublic: false, isPublic: true });
  });

  it("deleting reports the post's status before the delete", async () => {
    mocks.prisma.post.delete.mockResolvedValue({ id: "b1", slug: "spring", status: "published" });
    const { deletePost } = await import("@/plugins/blog/admin/actions");
    await deletePost("b1");
    expect(mocks.scheduleIndexNowPing).toHaveBeenCalledWith({ kind: "post", oldSlug: "spring", wasPublic: true, isPublic: false });
  });
});
