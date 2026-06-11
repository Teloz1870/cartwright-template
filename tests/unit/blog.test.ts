import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Blog data-lag (D) — published-filter, tag-parse, locale-translation. Mocket prisma.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    post: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function reset() {
  vi.resetModules();
  mocks.prisma.post.findMany.mockReset();
  mocks.prisma.post.findUnique.mockReset();
}

describe("listPublishedPosts", () => {
  beforeEach(reset);

  it("mapper tags fra JSON-streng og kun published spørges", async () => {
    mocks.prisma.post.findMany.mockResolvedValue([
      { slug: "a", title: "A", excerpt: null, coverImage: null, author: "Kim", publishedAt: new Date(), tags: '["nyt","kaffe"]' },
    ]);
    const { listPublishedPosts } = await import("@/lib/blog");
    const posts = await listPublishedPosts();
    expect(posts[0].tags).toEqual(["nyt", "kaffe"]);
    expect(mocks.prisma.post.findMany.mock.calls[0][0].where).toEqual({ status: "published" });
  });

  it("håndterer korrupt tags-streng fail-soft", async () => {
    mocks.prisma.post.findMany.mockResolvedValue([
      { slug: "a", title: "A", excerpt: null, coverImage: null, author: null, publishedAt: null, tags: "{ ikke json" },
    ]);
    const { listPublishedPosts } = await import("@/lib/blog");
    const posts = await listPublishedPosts();
    expect(posts[0].tags).toEqual([]);
  });
});

describe("getPublishedPost", () => {
  beforeEach(reset);

  it("returnerer null for kladde", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue({ slug: "a", status: "draft", title: "A", body: "x", translations: null });
    const { getPublishedPost } = await import("@/lib/blog");
    expect(await getPublishedPost("a", "da")).toBeNull();
  });

  it("anvender en-oversættelse når locale=en", async () => {
    mocks.prisma.post.findUnique.mockResolvedValue({
      slug: "a",
      status: "published",
      title: "Dansk titel",
      body: "Dansk body",
      excerpt: null,
      coverImage: null,
      author: null,
      publishedAt: new Date(),
      tags: null,
      metaTitle: null,
      metaDescription: null,
      vibeHtml: null,
      translations: { en: { title: "English title", body: "English body" } },
    });
    const { getPublishedPost } = await import("@/lib/blog");
    const post = await getPublishedPost("a", "en");
    expect(post?.title).toBe("English title");
    expect(post?.body).toBe("English body");
  });
});
