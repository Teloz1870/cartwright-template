import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Blog post tools — posts.create/update/publish handler logic. Mocked prisma +
 * withAudit passthrough; no real DB.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    post: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
  withAudit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

const ctx = { actor: "test", ip: null, userAgent: null } as never;

beforeEach(() => {
  vi.resetModules();
  mocks.prisma.post.findUnique.mockReset();
  mocks.prisma.post.create.mockReset();
  mocks.prisma.post.update.mockReset();
  mocks.prisma.post.findMany.mockReset();
  // withAudit passthrough: just run the work fn
  mocks.withAudit.mockReset().mockImplementation(async (_meta: unknown, fn: () => Promise<unknown>) => fn());
});

describe("posts.create", () => {
  it("auto-slugs from the title, lands as a DRAFT (bodyFormat=text), JSON-encodes tags", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue(null); // slug free
    mocks.prisma.post.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "p1",
      ...data,
      publishedAt: null,
    }));
    const { createPost } = await import("@/lib/tools/posts");
    const r = (await createPost.handler({ title: "Our Spring Collection", body: "## Fresh in\n\nLanded.", tags: ["spring", "new"] }, ctx)) as {
      slug: string;
      status: string;
      publicUrl: string;
    };
    expect(r.slug).toBe("our-spring-collection");
    expect(r.status).toBe("draft");
    expect(r.publicUrl).toBe("/blog/our-spring-collection");
    const data = mocks.prisma.post.create.mock.calls[0][0].data;
    expect(data.status).toBe("draft");
    expect(data.bodyFormat).toBe("text");
    expect(data.publishedAt).toBeNull();
    expect(data.tags).toBe(JSON.stringify(["spring", "new"]));
  });

  it("de-collides an auto-slug (foo, foo-2, …)", async () => {
    mocks.prisma.post.findUnique
      .mockResolvedValueOnce({ id: "x" }) // "fence-guide" taken
      .mockResolvedValueOnce(null); // "fence-guide-2" free
    mocks.prisma.post.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p2", ...data }));
    const { createPost } = await import("@/lib/tools/posts");
    const r = (await createPost.handler({ title: "Fence guide", body: "A guide to fences." }, ctx)) as { slug: string };
    expect(r.slug).toBe("fence-guide-2");
  });

  it("rejects an explicit slug that is already taken (no silent overwrite)", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue({ id: "exists" });
    const { createPost } = await import("@/lib/tools/posts");
    await expect(createPost.handler({ slug: "taken", title: "Hi there", body: "Some body text." }, ctx)).rejects.toThrow(/already exists/);
    expect(mocks.prisma.post.create).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error if the slug is RACED (create → Prisma P2002)", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue(null); // free at check-time
    mocks.prisma.post.create.mockRejectedValue({ code: "P2002" }); // but raced
    const { createPost } = await import("@/lib/tools/posts");
    await expect(createPost.handler({ title: "Race me", body: "Some body text here." }, ctx)).rejects.toThrow(/already exists/);
  });

  it("slugifies Nordic/German chars consistently with docs.import (ø→oe, å→aa)", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue(null);
    mocks.prisma.post.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p", ...data }));
    const { createPost } = await import("@/lib/tools/posts");
    const r = (await createPost.handler({ title: "Blå brød & køl", body: "Danish body text." }, ctx)) as { slug: string };
    expect(r.slug).toBe("blaa-broed-koel");
  });
});

describe("posts.update", () => {
  it("throws when the post does not exist", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue(null);
    const { updatePost } = await import("@/lib/tools/posts");
    await expect(updatePost.handler({ slug: "ghost", title: "New title" }, ctx)).rejects.toThrow(/not found/i);
  });

  it("patches only the provided fields", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue({ id: "p1" });
    mocks.prisma.post.update.mockResolvedValue({ id: "p1", slug: "x", status: "draft" });
    const { updatePost } = await import("@/lib/tools/posts");
    await updatePost.handler({ slug: "x", title: "Updated" }, ctx);
    const data = mocks.prisma.post.update.mock.calls[0][0].data;
    expect(data).toEqual({ title: "Updated" });
  });

  it("patching body re-asserts bodyFormat=text (can't drift to an unsafe format)", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue({ id: "p1" });
    mocks.prisma.post.update.mockResolvedValue({ id: "p1", slug: "x", status: "draft" });
    const { updatePost } = await import("@/lib/tools/posts");
    await updatePost.handler({ slug: "x", body: "Rewritten body text." }, ctx);
    expect(mocks.prisma.post.update.mock.calls[0][0].data).toEqual({ body: "Rewritten body text.", bodyFormat: "text" });
  });

  it("clears a nullable field with null (and tags → real null, not the string 'null')", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue({ id: "p1" });
    mocks.prisma.post.update.mockResolvedValue({ id: "p1", slug: "x", status: "draft" });
    const { updatePost } = await import("@/lib/tools/posts");
    await updatePost.handler({ slug: "x", excerpt: null, tags: null }, ctx);
    const data = mocks.prisma.post.update.mock.calls[0][0].data;
    expect(data.excerpt).toBeNull();
    expect(data.tags).toBeNull();
  });
});

describe("posts.publish", () => {
  it("publishing stamps publishedAt on first publish + sets status=published", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue({ id: "p1", publishedAt: null });
    mocks.prisma.post.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ slug: "x", ...data }));
    const { publishPost } = await import("@/lib/tools/posts");
    const r = (await publishPost.handler({ slug: "x", published: true, confirm: true }, ctx)) as { status: string; publishedAt: unknown };
    expect(r.status).toBe("published");
    expect(r.publishedAt).toBeInstanceOf(Date);
  });

  it("unpublishing sets status=draft and does NOT re-stamp publishedAt", async () => {
    const original = new Date("2025-01-01");
    mocks.prisma.post.findUnique.mockResolvedValue({ id: "p1", publishedAt: original });
    mocks.prisma.post.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ slug: "x", publishedAt: original, ...data }));
    const { publishPost } = await import("@/lib/tools/posts");
    const r = (await publishPost.handler({ slug: "x", published: false, confirm: true }, ctx)) as { status: string };
    expect(r.status).toBe("draft");
    const data = mocks.prisma.post.update.mock.calls[0][0].data;
    expect(data.publishedAt).toBeUndefined(); // not re-stamped
  });

  it("re-publishing an already-published post keeps the original publishedAt", async () => {
    const original = new Date("2025-01-01");
    mocks.prisma.post.findUnique.mockResolvedValue({ id: "p1", publishedAt: original });
    mocks.prisma.post.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ slug: "x", publishedAt: original, ...data }));
    const { publishPost } = await import("@/lib/tools/posts");
    await publishPost.handler({ slug: "x", published: true, confirm: true }, ctx);
    const data = mocks.prisma.post.update.mock.calls[0][0].data;
    expect(data.publishedAt).toBeUndefined(); // not re-stamped — kept once set
    expect(data.status).toBe("published");
  });

  it("throws when publishing a post that does not exist", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue(null);
    const { publishPost } = await import("@/lib/tools/posts");
    await expect(publishPost.handler({ slug: "ghost", published: true, confirm: true }, ctx)).rejects.toThrow(/not found/i);
  });
});
