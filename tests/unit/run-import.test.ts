import { describe, expect, it, vi, beforeEach } from "vitest";

import { buildArchive, type ArchivePage } from "@/lib/import/archive";

/**
 * Site-import orchestrator (Fase 1.2) — runImport dispatches each planned page
 * to the right create-tool as a DRAFT, isolates per-page failures, imports the
 * hero image. Real planImport/classify/archive; mocked tool handlers.
 */

const mocks = vi.hoisted(() => ({
  upsertPage: vi.fn(),
  createService: vi.fn(),
  createPost: vi.fn(),
  importImageFromUrl: vi.fn(),
  pageFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { page: { findUnique: mocks.pageFindUnique } } }));
vi.mock("@/lib/tools/pages", () => ({ upsertPage: { handler: mocks.upsertPage } }));
vi.mock("@/lib/tools/services", () => ({ createService: { handler: mocks.createService } }));
vi.mock("@/lib/tools/posts", () => ({ createPost: { handler: mocks.createPost } }));
vi.mock("@/lib/tools/images", () => ({ importImageFromUrl: { handler: mocks.importImageFromUrl } }));

const ctx = { actor: "test", ip: null, userAgent: null } as never;

function page(p: Partial<ArchivePage> & { url: string; slug: string }): ArchivePage {
  return {
    title: null,
    description: null,
    language: null,
    markdown: "",
    media: { images: [], documents: [], videos: [] },
    ...p,
  };
}

beforeEach(() => {
  vi.resetModules();
  mocks.upsertPage.mockReset().mockImplementation(async ({ slug }: { slug: string }) => ({ slug, status: "draft" }));
  mocks.createService.mockReset().mockResolvedValue({ slug: "ydelser-webdesign", status: "draft" });
  mocks.createPost.mockReset().mockResolvedValue({ slug: "blog-hello", status: "draft" });
  mocks.importImageFromUrl.mockReset().mockResolvedValue({ url: "https://blob.store/imported/hero.jpg" });
  mocks.pageFindUnique.mockReset().mockResolvedValue(null); // every page slug free by default
});

describe("runImport", () => {
  it("creates each page kind as a DRAFT via the right tool, imports the hero, skips products", async () => {
    const archive = buildArchive("https://x.dk", [
      page({ url: "https://x.dk/ydelser/webdesign/", slug: "ydelser-webdesign", title: "Webdesign", markdown: "We craft websites.", description: "Short desc.", media: { images: ["https://cdn/x.jpg"], documents: [], videos: [] } }),
      page({ url: "https://x.dk/blog/hello/", slug: "blog-hello", title: "Hello world", markdown: "Our first post here." }),
      page({ url: "https://x.dk/handelsbetingelser/", slug: "handelsbetingelser", title: "Terms", markdown: "The legal terms text." }),
      page({ url: "https://x.dk/kontakt/", slug: "kontakt", title: "Contact", markdown: "Reach us by email." }),
      page({ url: "https://x.dk/p/sko", slug: "p-sko", title: "Sko", markdown: "Nice shoe — 199 kr" }),
    ]);

    const { runImport } = await import("@/lib/import/run-import");
    const r = await runImport(archive, ctx);

    const byUrl = Object.fromEntries(r.outcomes.map((o) => [o.url, o]));
    expect(byUrl["https://x.dk/ydelser/webdesign/"].action).toBe("service");
    expect(byUrl["https://x.dk/blog/hello/"].action).toBe("post");
    expect(byUrl["https://x.dk/handelsbetingelser/"].action).toBe("page");
    expect(byUrl["https://x.dk/kontakt/"].action).toBe("page");
    expect(byUrl["https://x.dk/p/sko"].action).toBe("skipped");
    expect(byUrl["https://x.dk/p/sko"].reason).toMatch(/product/i);

    // Service created as a draft with the imported hero.
    expect(mocks.createService).toHaveBeenCalledTimes(1);
    const svcArgs = mocks.createService.mock.calls[0][0];
    expect(svcArgs.status).toBe("draft");
    expect(svcArgs.heroImage).toBe("https://blob.store/imported/hero.jpg");
    expect(svcArgs.shortDescription).toBe("Short desc.");

    // Page kinds upserted as drafts.
    const pageCalls = mocks.upsertPage.mock.calls.map((c) => c[0]);
    expect(pageCalls.every((a) => a.status === "draft")).toBe(true);

    // Product never reached a create-tool.
    expect(mocks.createPost).toHaveBeenCalledTimes(1);
    expect(r.summary).toEqual({ created: 4, skipped: 1, failed: 0, imagesImported: 1 });
  });

  it("only imports an image for pages that have one (no image → no import call, imageImported false)", async () => {
    const archive = buildArchive("https://x.dk", [
      page({ url: "https://x.dk/kontakt/", slug: "kontakt", title: "Contact", markdown: "Reach us here today." }),
    ]);
    const { runImport } = await import("@/lib/import/run-import");
    const r = await runImport(archive, ctx);
    expect(mocks.importImageFromUrl).not.toHaveBeenCalled();
    expect(r.outcomes[0].imageImported).toBe(false);
    expect(r.summary.imagesImported).toBe(0);
  });

  it("a failing page is isolated (recorded ok:false) and never aborts the run", async () => {
    mocks.createService.mockRejectedValueOnce(new Error("slug collision"));
    const archive = buildArchive("https://x.dk", [
      page({ url: "https://x.dk/ydelser/a/", slug: "ydelser-a", title: "A", markdown: "Service A copy here." }),
      page({ url: "https://x.dk/kontakt/", slug: "kontakt", title: "Contact", markdown: "Reach us here today." }),
    ]);
    const { runImport } = await import("@/lib/import/run-import");
    const r = await runImport(archive, ctx);
    const svc = r.outcomes.find((o) => o.url.includes("ydelser"))!;
    expect(svc.ok).toBe(false);
    expect(svc.reason).toMatch(/collision/);
    // The contact page still got created despite the service failing.
    expect(r.outcomes.find((o) => o.url.includes("kontakt"))!.ok).toBe(true);
    expect(r.summary.failed).toBe(1);
    expect(r.summary.created).toBe(1);
  });

  it("a hero-image import failure is non-fatal — the draft is still created, imageImported false", async () => {
    mocks.importImageFromUrl.mockRejectedValueOnce(new Error("blob down"));
    const archive = buildArchive("https://x.dk", [
      page({ url: "https://x.dk/ydelser/a/", slug: "ydelser-a", title: "A", markdown: "Service A copy here.", media: { images: ["https://cdn/x.jpg"], documents: [], videos: [] } }),
    ]);
    const { runImport } = await import("@/lib/import/run-import");
    const r = await runImport(archive, ctx);
    expect(r.outcomes[0].ok).toBe(true);
    expect(r.outcomes[0].imageImported).toBe(false);
    expect(mocks.createService.mock.calls[0][0].heroImage).toBeUndefined();
  });

  it("is NON-DESTRUCTIVE — a page slug taken in the DB de-collides instead of overwriting", async () => {
    // "about" already exists in the DB; the import must NOT upsert-overwrite it.
    mocks.pageFindUnique.mockImplementation(async ({ where }: { where: { slug: string } }) => (where.slug === "about" ? { id: "existing" } : null));
    const archive = buildArchive("https://x.dk", [
      page({ url: "https://x.dk/about/", slug: "about", title: "About", markdown: "About us copy here." }),
    ]);
    const { runImport } = await import("@/lib/import/run-import");
    await runImport(archive, ctx);
    expect(mocks.upsertPage.mock.calls[0][0].slug).toBe("about-2");
  });

  it("de-collides two scraped pages that slugify the same (within one run)", async () => {
    const archive = buildArchive("https://x.dk", [
      page({ url: "https://x.dk/info/a/", slug: "info", title: "Info", markdown: "First info page copy." }),
      page({ url: "https://x.dk/info-2/", slug: "info", title: "Info", markdown: "Second info page copy." }),
    ]);
    const { runImport } = await import("@/lib/import/run-import");
    await runImport(archive, ctx);
    const slugs = mocks.upsertPage.mock.calls.map((c) => c[0].slug);
    expect(slugs).toEqual(["info", "info-2"]);
  });

  it("pads a too-short body so the create-tools' min-length never rejects", async () => {
    const archive = buildArchive("https://x.dk", [
      page({ url: "https://x.dk/kontakt/", slug: "kontakt", title: "Contact", markdown: "Hi", description: "Find us." }),
    ]);
    const { runImport } = await import("@/lib/import/run-import");
    await runImport(archive, ctx);
    const body = mocks.upsertPage.mock.calls[0][0].body as string;
    expect(body.length).toBeGreaterThanOrEqual(10);
    expect(body).toContain("Contact");
  });

  it("floors a too-short title so the create-tools' min(2) never rejects", async () => {
    const archive = buildArchive("https://x.dk", [
      // 1-char title AND a 1-char slug → must fall back to "Imported".
      page({ url: "https://x.dk/x", slug: "x", title: "A", markdown: "Some page body here." }),
    ]);
    const { runImport } = await import("@/lib/import/run-import");
    await runImport(archive, ctx);
    expect((mocks.upsertPage.mock.calls[0][0].title as string).length).toBeGreaterThanOrEqual(2);
    expect(mocks.upsertPage.mock.calls[0][0].title).toBe("Imported");
  });

  it("surfaces the REBUILD-not-clone notice on every run", async () => {
    const archive = buildArchive("https://x.dk", [page({ url: "https://x.dk/kontakt/", slug: "kontakt", title: "Contact", markdown: "Reach us here." })]);
    const { runImport } = await import("@/lib/import/run-import");
    const r = await runImport(archive, ctx);
    expect(r.notice).toMatch(/rebuild, not a clone/i);
  });
});
