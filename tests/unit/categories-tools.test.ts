import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Category-management tools (`lib/tools/categories.ts`) — the admin/agent surface
 * that shapes the product taxonomy. `categories.upsert` create-or-updates by slug
 * (the identity key), `categories.delete` hard-deletes but REFUSES while products
 * are still attached, and `categories.list` is a read-only projection. All three
 * are AI-invokable over REST/MCP, so their guards + audit wiring are load-bearing.
 * This suite pins:
 *   - upsert threads the exact create/update payloads (with `description ?? null`)
 *     and returns only the {id, slug, name} projection,
 *   - delete keys off the loaded row's `id` (not the slug), and short-circuits
 *     BEFORE any DB delete on not-found and on a category that still has products,
 *   - the audit contract: even a REJECTED delete captures the prior row via the
 *     `before` closure and threads actor/tool/args through withAudit,
 *   - the read tool lists with the count include + never audits,
 *   - the input schema enforces the slug shape + delete's confirm gate.
 *
 * Mocks: `@/lib/db` (prisma) + `@/lib/audit` (withAudit). No real DB. The withAudit
 * stand-in resolves `before()` on BOTH success and failure — exactly like the real
 * wrapper (lib/audit.ts captures the before-snapshot before the try/catch).
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    category: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
  withAudit: vi.fn(),
  // capture the meta + resolved `before()` snapshot the tool hands to withAudit.
  captured: { meta: null as null | Record<string, unknown>, before: undefined as unknown },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

const ctx = {
  actor: "apikey:k1",
  ip: "10.0.0.9",
  userAgent: "agent/1.0",
} as never;

beforeEach(() => {
  vi.resetModules();
  mocks.prisma.category.findMany.mockReset();
  mocks.prisma.category.findUnique.mockReset();
  mocks.prisma.category.upsert.mockReset();
  mocks.prisma.category.delete.mockReset();
  mocks.captured.meta = null;
  mocks.captured.before = undefined;
  // Faithful withAudit stand-in: capture meta, resolve the before-snapshot
  // (the real withAudit does this on BOTH success and failure), then run fn —
  // rethrowing exactly as the real wrapper does.
  mocks.withAudit
    .mockReset()
    .mockImplementation(
      async (
        meta: Record<string, unknown> & { before?: () => Promise<unknown> | unknown },
        fn: () => Promise<unknown>,
      ) => {
        mocks.captured.meta = meta;
        if (meta.before) mocks.captured.before = await meta.before();
        return fn();
      },
    );
});

describe("categories.upsert — create-or-update by slug", () => {
  it("threads slug + name + description into both the create and update branches", async () => {
    mocks.prisma.category.findUnique.mockResolvedValue(null);
    mocks.prisma.category.upsert.mockResolvedValue({
      id: "c1",
      slug: "coffee-beans",
      name: "Coffee Beans",
      description: "Freshly roasted",
    });
    const { upsertCategory } = await import("@/lib/tools/categories");

    const r = await upsertCategory.handler(
      { slug: "coffee-beans", name: "Coffee Beans", description: "Freshly roasted" },
      ctx,
    );

    // returns ONLY the {id, slug, name} projection — never leaks description/other columns
    expect(r).toEqual({ id: "c1", slug: "coffee-beans", name: "Coffee Beans" });
    expect(mocks.prisma.category.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.category.upsert).toHaveBeenCalledWith({
      where: { slug: "coffee-beans" },
      create: { slug: "coffee-beans", name: "Coffee Beans", description: "Freshly roasted" },
      update: { name: "Coffee Beans", description: "Freshly roasted" },
    });
  });

  it("coalesces an omitted description to null in BOTH create and update", async () => {
    mocks.prisma.category.findUnique.mockResolvedValue(null);
    mocks.prisma.category.upsert.mockResolvedValue({ id: "c2", slug: "hats", name: "Hats" });
    const { upsertCategory } = await import("@/lib/tools/categories");

    await upsertCategory.handler({ slug: "hats", name: "Hats" }, ctx);

    const call = mocks.prisma.category.upsert.mock.calls[0][0];
    // `description ?? null` — an absent description must become an explicit null,
    // not `undefined` (which Prisma would treat as "leave unchanged" on update).
    expect(call.create.description).toBeNull();
    expect(call.update.description).toBeNull();
  });

  it("snapshots the prior row via the audit before-closure + threads actor/tool/args/ip/ua", async () => {
    const prior = { id: "c1", slug: "hats", name: "Old Name", description: null };
    mocks.prisma.category.findUnique.mockResolvedValue(prior);
    mocks.prisma.category.upsert.mockResolvedValue({ id: "c1", slug: "hats", name: "Hats" });
    const { upsertCategory } = await import("@/lib/tools/categories");

    await upsertCategory.handler({ slug: "hats", name: "Hats" }, ctx);

    // the before-closure looks the category up by slug (lightweight, by identity key)
    expect(mocks.prisma.category.findUnique).toHaveBeenCalledWith({ where: { slug: "hats" } });
    expect(mocks.captured.before).toEqual(prior);
    const meta = mocks.captured.meta!;
    expect(meta.tool).toBe("categories.upsert");
    expect(meta.actor).toBe("apikey:k1");
    expect(meta.args).toEqual({ slug: "hats", name: "Hats" });
    expect(meta.ip).toBe("10.0.0.9");
    expect(meta.userAgent).toBe("agent/1.0");
  });

  it("is a scoped, audited write tool", async () => {
    const { upsertCategory } = await import("@/lib/tools/categories");
    expect(upsertCategory.name).toBe("categories.upsert");
    expect(upsertCategory.scope).toBe("categories:write");
    expect(upsertCategory.skipAudit).toBeUndefined();
  });
});

describe("categories.delete — guarded hard delete", () => {
  it("deletes by the loaded row's id (not the slug) and returns {ok, slug} when empty", async () => {
    // Two distinct findUnique calls, modeled faithfully: the audit before-closure
    // (`{where:{slug}}`, no include) returns a plain row WITHOUT `_count`; the
    // handler's own guard lookup (`include:{_count}`) returns the counted row.
    mocks.prisma.category.findUnique
      .mockResolvedValueOnce({ id: "cat-123", slug: "empty-cat", name: "Empty", description: null })
      .mockResolvedValueOnce({
        id: "cat-123",
        slug: "empty-cat",
        name: "Empty",
        _count: { products: 0 },
      });
    mocks.prisma.category.delete.mockResolvedValue({});
    const { deleteCategory } = await import("@/lib/tools/categories");

    const r = await deleteCategory.handler({ slug: "empty-cat", confirm: true }, ctx);

    expect(r).toEqual({ ok: true, slug: "empty-cat" });
    // delete keys off the row's PRIMARY KEY, not the slug — a regression to
    // `where: { slug }` would still "work" against a slug-unique schema but is a
    // different (and wrong) contract; pin the id.
    expect(mocks.prisma.category.delete).toHaveBeenCalledWith({ where: { id: "cat-123" } });
    // the count guard must actually fetch the relation count
    const handlerLookup = mocks.prisma.category.findUnique.mock.calls.at(-1)![0];
    expect(handlerLookup).toEqual({
      where: { slug: "empty-cat" },
      include: { _count: { select: { products: true } } },
    });
  });

  it("throws and never deletes when the category does not exist", async () => {
    mocks.prisma.category.findUnique.mockResolvedValue(null);
    const { deleteCategory } = await import("@/lib/tools/categories");

    await expect(
      deleteCategory.handler({ slug: "ghost", confirm: true }, ctx),
    ).rejects.toThrow("Category not found: ghost");
    expect(mocks.prisma.category.delete).not.toHaveBeenCalled();
    // the 404 attempt is still audited — the before-closure snapshots null
    expect(mocks.captured.before).toBeNull();
    expect(mocks.captured.meta!.tool).toBe("categories.delete");
  });

  it("refuses (and never deletes) while products are still attached", async () => {
    // before-closure (slug-only) then the handler's counted lookup
    mocks.prisma.category.findUnique
      .mockResolvedValueOnce({ id: "cat-9", slug: "busy", name: "Busy", description: null })
      .mockResolvedValueOnce({
        id: "cat-9",
        slug: "busy",
        name: "Busy",
        _count: { products: 3 },
      });
    const { deleteCategory } = await import("@/lib/tools/categories");

    await expect(
      deleteCategory.handler({ slug: "busy", confirm: true }, ctx),
    ).rejects.toThrow("Category has 3 products - move or delete them first");
    expect(mocks.prisma.category.delete).not.toHaveBeenCalled();
  });

  it("still captures the prior row for audit even when the delete is REFUSED", async () => {
    // The audit before-closure query is slug-only (no `_count`), so the snapshot
    // it captures has no product count — model + assert exactly that shape rather
    // than a counted row the real slug-only lookup would never return.
    const beforeSnapshot = { id: "cat-9", slug: "busy", name: "Busy", description: null };
    mocks.prisma.category.findUnique
      .mockResolvedValueOnce(beforeSnapshot) // audit before()
      .mockResolvedValueOnce({ ...beforeSnapshot, _count: { products: 3 } }); // handler guard
    const { deleteCategory } = await import("@/lib/tools/categories");

    await expect(
      deleteCategory.handler({ slug: "busy", confirm: true }, ctx),
    ).rejects.toThrow(/products/);
    // withAudit resolves before() regardless of the handler outcome ⇒ a rejected
    // delete is still audited with the state it was rejected from, with context.
    expect(mocks.captured.before).toEqual(beforeSnapshot);
    const meta = mocks.captured.meta!;
    expect(meta.tool).toBe("categories.delete");
    expect(meta.actor).toBe("apikey:k1");
    expect(meta.args).toEqual({ slug: "busy", confirm: true });
    // the before-closure fires the slug-only lookup; the handler's OWN guard
    // query (the LAST call) fetches the relation count before refusing.
    expect(mocks.prisma.category.findUnique).toHaveBeenCalledWith({ where: { slug: "busy" } });
    expect(mocks.prisma.category.findUnique.mock.calls.at(-1)![0]).toEqual({
      where: { slug: "busy" },
      include: { _count: { select: { products: true } } },
    });
  });

  it("is a scoped, audited, non-revertible write tool", async () => {
    const { deleteCategory } = await import("@/lib/tools/categories");
    expect(deleteCategory.name).toBe("categories.delete");
    expect(deleteCategory.scope).toBe("categories:write");
    expect(deleteCategory.revertible).toBe(false); // hard delete — audit.revert can't restore it
    expect(deleteCategory.skipAudit).toBeUndefined();
  });
});

describe("categories.list — read-only projection", () => {
  it("lists name-sorted with a product count and never audits", async () => {
    mocks.prisma.category.findMany.mockResolvedValue([
      {
        id: "c1",
        slug: "beans",
        name: "Beans",
        description: "d",
        _count: { products: 4 },
      },
    ]);
    const { listCategories } = await import("@/lib/tools/categories");

    const rows = (await listCategories.handler({}, ctx)) as Array<{
      id: string;
      productCount: number;
    }>;

    expect(rows).toEqual([
      { id: "c1", slug: "beans", name: "Beans", description: "d", productCount: 4 },
    ]);
    const arg = mocks.prisma.category.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ name: "asc" });
    // the productCount depends on the relation count actually being fetched — pin
    // the include so a regression that drops it (→ productCount undefined) is caught.
    expect(arg.include).toEqual({
      _count: {
        select: { products: { where: { deletedAt: null } } },
      },
    });
    // read tools never wrap in withAudit
    expect(mocks.withAudit).not.toHaveBeenCalled();
  });

  it("is a read tool that does not audit", async () => {
    const { listCategories } = await import("@/lib/tools/categories");
    expect(listCategories.scope).toBe("categories:read");
    expect(listCategories.skipAudit).toBe(true);
  });
});

describe("input schemas", () => {
  it("upsert requires a lowercase slug (a-z0-9-, min 2) and a name (min 2)", async () => {
    const { upsertCategory } = await import("@/lib/tools/categories");
    expect(upsertCategory.input.safeParse({ slug: "coffee-beans", name: "Coffee" }).success).toBe(
      true,
    );
    // uppercase / spaces / short slug are rejected by the regex + min(2)
    expect(upsertCategory.input.safeParse({ slug: "Coffee Beans", name: "Coffee" }).success).toBe(
      false,
    );
    expect(upsertCategory.input.safeParse({ slug: "a", name: "Coffee" }).success).toBe(false);
    // name below min(2) is rejected
    expect(upsertCategory.input.safeParse({ slug: "beans", name: "x" }).success).toBe(false);
    // `description` IS part of the schema (optional string) — so it is preserved,
    // not silently stripped at the parse boundary; a non-string is rejected.
    const parsed = upsertCategory.input.safeParse({ slug: "beans", name: "Beans", description: "d" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.description).toBe("d");
    expect(
      upsertCategory.input.safeParse({ slug: "beans", name: "Beans", description: 5 }).success,
    ).toBe(false);
  });

  it("delete requires confirm: true", async () => {
    const { deleteCategory } = await import("@/lib/tools/categories");
    expect(deleteCategory.input.safeParse({ slug: "beans", confirm: true }).success).toBe(true);
    expect(deleteCategory.input.safeParse({ slug: "beans" }).success).toBe(false);
    expect(deleteCategory.input.safeParse({ slug: "beans", confirm: false }).success).toBe(false);
  });
});
