import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Page tools — pages.upsert status (draft|published) behaviour. Mocked prisma +
 * withAudit passthrough; no real DB.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    page: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
  withAudit: vi.fn(),
  scheduleIndexNowPing: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/indexnow", () => ({ scheduleIndexNowPing: mocks.scheduleIndexNowPing }));

const ctx = { actor: "test", ip: null, userAgent: null } as never;

beforeEach(() => {
  vi.resetModules();
  mocks.prisma.page.findUnique.mockReset();
  mocks.prisma.page.upsert.mockReset();
  mocks.prisma.page.findMany.mockReset();
  mocks.prisma.page.delete.mockReset();
  mocks.withAudit.mockReset().mockImplementation(async (_meta: unknown, fn: () => Promise<unknown>) => fn());
  mocks.scheduleIndexNowPing.mockReset();
});

describe("pages.upsert status", () => {
  it("create defaults status to published (no status passed)", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue(null);
    mocks.prisma.page.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: "p1", ...create }));
    const { upsertPage } = await import("@/lib/tools/pages");
    const r = (await upsertPage.handler({ slug: "about", title: "About Us", body: "## Story\n\nWe build things." }, ctx)) as { status: string };
    expect(mocks.prisma.page.upsert.mock.calls[0][0].create.status).toBe("published");
    expect(r.status).toBe("published");
  });

  it('create with status:"draft" lands the page off the public storefront (site-import)', async () => {
    mocks.prisma.page.findUnique.mockResolvedValue(null);
    mocks.prisma.page.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: "p1", ...create }));
    const { upsertPage } = await import("@/lib/tools/pages");
    await upsertPage.handler({ slug: "imported", title: "Imported page", body: "Scraped body text.", status: "draft" }, ctx);
    expect(mocks.prisma.page.upsert.mock.calls[0][0].create.status).toBe("draft");
  });

  it("update WITHOUT status leaves the existing status untouched (a copy edit never re-publishes)", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue({ id: "p1", slug: "about" });
    mocks.prisma.page.upsert.mockImplementation(async ({ update }: { update: Record<string, unknown> }) => ({ id: "p1", slug: "about", ...update }));
    const { upsertPage } = await import("@/lib/tools/pages");
    await upsertPage.handler({ slug: "about", title: "About (edited)", body: "Edited body text here." }, ctx);
    const update = mocks.prisma.page.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty("status");
    expect(update).toEqual({ title: "About (edited)", body: "Edited body text here." });
  });

  it('update WITH status:"published" publishes a drafted page', async () => {
    mocks.prisma.page.findUnique.mockResolvedValue({ id: "p1", slug: "about" });
    mocks.prisma.page.upsert.mockImplementation(async ({ update }: { update: Record<string, unknown> }) => ({ id: "p1", slug: "about", ...update }));
    const { upsertPage } = await import("@/lib/tools/pages");
    await upsertPage.handler({ slug: "about", title: "About Us", body: "## Story\n\nLive now.", status: "published" }, ctx);
    expect(mocks.prisma.page.upsert.mock.calls[0][0].update.status).toBe("published");
  });
});

/**
 * IndexNow (FEAT3-a): the tool reports what the write changed — public before
 * AND after, slug before and after — and lib/indexnow.ts decides what to ping.
 * The site import (status "draft" on a page that did not exist) must land as
 * `wasPublic: false, isPublic: false`, which pings nothing.
 */
describe("pages.upsert / pages.delete → IndexNow", () => {
  it("a page created as a draft (the site import) is reported as never public", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue(null);
    mocks.prisma.page.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: "p1", ...create }));
    const { upsertPage } = await import("@/lib/tools/pages");
    await upsertPage.handler({ slug: "imported", title: "Imported page", body: "Scraped body text.", status: "draft" }, ctx);
    expect(mocks.scheduleIndexNowPing).toHaveBeenCalledWith({
      kind: "page",
      oldSlug: "imported",
      newSlug: "imported",
      wasPublic: false,
      isPublic: false,
    });
  });

  it("a published page is reported public after the write", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue(null);
    mocks.prisma.page.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: "p1", ...create }));
    const { upsertPage } = await import("@/lib/tools/pages");
    await upsertPage.handler({ slug: "about", title: "About Us", body: "## Story\n\nWe build things." }, ctx);
    expect(mocks.scheduleIndexNowPing).toHaveBeenCalledWith(expect.objectContaining({ kind: "page", newSlug: "about", wasPublic: false, isPublic: true }));
  });

  it('unpublishing (status:"draft" on a live page) is reported as public BEFORE the write — the URL went away', async () => {
    mocks.prisma.page.findUnique.mockResolvedValue({ id: "p1", slug: "about", status: "published" });
    mocks.prisma.page.upsert.mockImplementation(async ({ update }: { update: Record<string, unknown> }) => ({ id: "p1", slug: "about", ...update }));
    const { upsertPage } = await import("@/lib/tools/pages");
    await upsertPage.handler({ slug: "about", title: "About Us", body: "## Story\n\nHidden again.", status: "draft" }, ctx);
    expect(mocks.scheduleIndexNowPing).toHaveBeenCalledWith({
      kind: "page",
      oldSlug: "about",
      newSlug: "about",
      wasPublic: true,
      isPublic: false,
    });
  });

  it("deleting reports the page's status before the delete", async () => {
    mocks.prisma.page.findUnique.mockResolvedValue({ id: "p1", slug: "old-terms", status: "published" });
    mocks.prisma.page.delete.mockResolvedValue({});
    const { deletePage } = await import("@/lib/tools/pages");
    await deletePage.handler({ slug: "old-terms", confirm: true }, ctx);
    expect(mocks.scheduleIndexNowPing).toHaveBeenCalledWith({ kind: "page", oldSlug: "old-terms", wasPublic: true, isPublic: false });
  });
});
