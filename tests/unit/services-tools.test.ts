import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Service tools — services.create/update handler logic. Mocked prisma +
 * withAudit passthrough; no real DB.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    service: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  withAudit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

const ctx = { actor: "test", ip: null, userAgent: null } as never;

beforeEach(() => {
  vi.resetModules();
  mocks.prisma.service.findUnique.mockReset();
  mocks.prisma.service.create.mockReset();
  mocks.prisma.service.update.mockReset();
  // withAudit passthrough: just run the work fn
  mocks.withAudit.mockReset().mockImplementation(async (_meta: unknown, fn: () => Promise<unknown>) => fn());
});

describe("services.create", () => {
  it("auto-slugs from the title, stores features as a real ARRAY (not a JSON string), defaults nav off", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue(null); // slug free
    mocks.prisma.service.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "s1", ...data }));
    const { createService } = await import("@/lib/tools/services");
    const r = (await createService.handler(
      { title: "Brand & identity", body: "## What you get\n\nA full identity.", features: ["Logo", "Palette"] },
      ctx,
    )) as { slug: string; publicUrl: string };
    expect(r.slug).toBe("brand-identity");
    expect(r.publicUrl).toBe("/services/brand-identity");
    const data = mocks.prisma.service.create.mock.calls[0][0].data;
    // Service.features is a Json column → array stored directly, NOT JSON.stringify'd.
    expect(data.features).toEqual(["Logo", "Palette"]);
    expect(data.showInNav).toBe(false);
    expect(data.navOrder).toBe(0);
  });

  it("defaults features to an empty array when none given", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue(null);
    mocks.prisma.service.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "s", ...data }));
    const { createService } = await import("@/lib/tools/services");
    await createService.handler({ title: "Consulting", body: "We advise on things." }, ctx);
    expect(mocks.prisma.service.create.mock.calls[0][0].data.features).toEqual([]);
  });

  it("de-collides an auto-slug (foo, foo-2, …)", async () => {
    mocks.prisma.service.findUnique
      .mockResolvedValueOnce({ id: "x" }) // "webdesign" taken
      .mockResolvedValueOnce(null); // "webdesign-2" free
    mocks.prisma.service.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "s2", ...data }));
    const { createService } = await import("@/lib/tools/services");
    const r = (await createService.handler({ title: "Webdesign", body: "We design websites." }, ctx)) as { slug: string };
    expect(r.slug).toBe("webdesign-2");
  });

  it("rejects an explicit slug that is already taken (no silent overwrite)", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue({ id: "exists" });
    const { createService } = await import("@/lib/tools/services");
    await expect(createService.handler({ slug: "taken", title: "Hi there", body: "Some body text." }, ctx)).rejects.toThrow(/already exists/);
    expect(mocks.prisma.service.create).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error if the slug is RACED (create → Prisma P2002)", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue(null); // free at check-time
    mocks.prisma.service.create.mockRejectedValue({ code: "P2002" }); // but raced
    const { createService } = await import("@/lib/tools/services");
    await expect(createService.handler({ title: "Race me", body: "Some body text here." }, ctx)).rejects.toThrow(/already exists/);
  });

  it("slugifies Nordic/German chars consistently with posts.create (ø→oe, å→aa)", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue(null);
    mocks.prisma.service.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "s", ...data }));
    const { createService } = await import("@/lib/tools/services");
    const r = (await createService.handler({ title: "Blå brød & køl", body: "Danish body text." }, ctx)) as { slug: string };
    expect(r.slug).toBe("blaa-broed-koel");
  });

  it("defaults status to published (preserves existing behaviour)", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue(null);
    mocks.prisma.service.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "s", ...data }));
    const { createService } = await import("@/lib/tools/services");
    const r = (await createService.handler({ title: "Consulting", body: "We advise on things." }, ctx)) as { status: string };
    expect(mocks.prisma.service.create.mock.calls[0][0].data.status).toBe("published");
    expect(r.status).toBe("published");
  });

  it('status:"draft" keeps the service off the public storefront (for site-import)', async () => {
    mocks.prisma.service.findUnique.mockResolvedValue(null);
    mocks.prisma.service.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "s", ...data }));
    const { createService } = await import("@/lib/tools/services");
    const r = (await createService.handler({ title: "Imported svc", body: "Scraped copy here.", status: "draft" }, ctx)) as { status: string };
    expect(mocks.prisma.service.create.mock.calls[0][0].data.status).toBe("draft");
    expect(r.status).toBe("draft");
  });
});

describe("services.update", () => {
  it("throws when the service does not exist", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue(null);
    const { updateService } = await import("@/lib/tools/services");
    await expect(updateService.handler({ slug: "ghost", patch: { title: "New" } }, ctx)).rejects.toThrow(/not found/i);
  });

  it("patches only the provided fields (a price edit never touches title/body)", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue({ id: "s1" });
    mocks.prisma.service.update.mockResolvedValue({ id: "s1", slug: "x" });
    const { updateService } = await import("@/lib/tools/services");
    await updateService.handler({ slug: "x", patch: { priceString: "from $129" } }, ctx);
    expect(mocks.prisma.service.update.mock.calls[0][0].data).toEqual({ priceString: "from $129" });
  });

  it("publishes a drafted service via patch status", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue({ id: "s1" });
    mocks.prisma.service.update.mockResolvedValue({ id: "s1", slug: "x" });
    const { updateService } = await import("@/lib/tools/services");
    await updateService.handler({ slug: "x", patch: { status: "published" } }, ctx);
    expect(mocks.prisma.service.update.mock.calls[0][0].data).toEqual({ status: "published" });
  });
});
