import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIGD-1a: freezing the old site's URL list (lib/migration/store.ts).
 *
 * The MIGD-1 contract: dryRun writes nothing;
 * confirm = ONE `$transaction` + ONE audit row — never one per URL; over the
 * 20,000 cap the whole freeze is refused with one error. The audit path is the
 * real `withAudit` (lib/audit.ts) over a fake prisma, so "one audit row" is one
 * `auditLog.create`, not one call to a mock of the wrapper.
 */

const mocks = vi.hoisted(() => {
  const op = (name: string) => vi.fn((args: unknown) => ({ op: name, args }));
  return {
    prisma: {
      migrationProject: { findUnique: vi.fn(), update: op("project.update") },
      migrationUrlMap: { count: vi.fn(), deleteMany: op("url.deleteMany"), createMany: op("url.createMany") },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
      auditLog: { create: vi.fn(async () => ({})) },
    },
  };
});
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

import { MIGRATION_URL_CAP, freezeUrlMap, type FrozenUrlInput } from "@/lib/migration/store";

const P = mocks.prisma;
const SRC = "https://hegnsfabrikken.dk";
const ENTRIES: FrozenUrlInput[] = [
  { oldUrl: `${SRC}/produkt/type-1/`, kind: "product", sitemap: `${SRC}/product-sitemap.xml`, lastmod: "2026-09-30T10:00:00+00:00", images: [`${SRC}/wp-content/uploads/a.jpg`] },
  { oldUrl: `${SRC}/produkt/type-1/?attribute_pa_hoejde=180#top`, kind: "product" },
  { oldUrl: `${SRC}/produkt/type-1/#reviews`, kind: "product" }, // same URL once the fragment is gone
  { oldUrl: "https://www.hegnsfabrikken.dk/om-os/", kind: "page" }, // www. is the same site
  { oldUrl: "https://cdn.example.com/x/", kind: "page" },
  { oldUrl: "/relative/", kind: "page" },
];
const writes = () => [
  P.$transaction, P.migrationUrlMap.deleteMany, P.migrationUrlMap.createMany, P.migrationProject.update, P.auditLog.create,
].map((f) => f.mock.calls.length);

beforeEach(() => {
  vi.clearAllMocks();
  P.migrationProject.findUnique.mockResolvedValue({ sourceUrl: `${SRC}/` });
  P.migrationUrlMap.count.mockResolvedValue(7);
});

describe("freezeUrlMap", () => {
  it("dryRun returns the plan and writes nothing", async () => {
    const r = await freezeUrlMap("proj-1", ENTRIES, "user:admin-1", { dryRun: true });
    expect(writes()).toEqual([0, 0, 0, 0, 0]);
    if (!r.dryRun) throw new Error("expected a dry run");
    expect(r.replaces).toBe(7);
    expect(r.rows.map((x) => [x.oldPath, x.kind])).toEqual([
      ["/produkt/type-1/", "product"],
      ["/produkt/type-1/?attribute_pa_hoejde=180", "product"],
      ["/om-os/", "page"],
    ]);
    expect(r.errors).toEqual([
      { oldUrl: "https://cdn.example.com/x/", reason: "foreign-host" },
      { oldUrl: "/relative/", reason: "not an absolute URL" },
    ]);
    expect(r.summary).toEqual({ entries: 6, valid: 3, invalid: 2, duplicates: 1, byKind: { product: 2, page: 1 } });
  });

  it("confirm replaces the map and stamps the snapshot in ONE transaction, under ONE audit row", async () => {
    const r = await freezeUrlMap("proj-1", ENTRIES, "user:admin-1", { dryRun: false, snapshot: { sitemaps: 3 } });
    expect(P.$transaction).toHaveBeenCalledTimes(1);
    const ops = P.$transaction.mock.calls[0][0] as { op: string; args: Record<string, unknown> }[];
    expect(ops.map((o) => o.op)).toEqual(["url.deleteMany", "url.createMany", "project.update"]);
    expect(ops[0].args).toEqual({ where: { projectId: "proj-1" } });
    const data = (ops[1].args as { data: Record<string, unknown>[] }).data;
    expect(data).toHaveLength(3);
    expect(data[0]).toEqual({
      projectId: "proj-1", oldUrl: `${SRC}/produkt/type-1/`, oldPath: "/produkt/type-1/", kind: "product",
      sitemap: `${SRC}/product-sitemap.xml`, lastmod: "2026-09-30T10:00:00+00:00", images: [`${SRC}/wp-content/uploads/a.jpg`],
    });
    const stamp = ops[2].args as { where: unknown; data: { frozenAt: Date; snapshot: Record<string, unknown> } };
    expect(stamp.where).toEqual({ id: "proj-1" });
    expect(stamp.data.frozenAt).toBeInstanceOf(Date);
    expect(stamp.data.snapshot).toMatchObject({ sitemaps: 3, id: r.dryRun ? null : r.snapshotId, counts: { urls: 3, byKind: { product: 2, page: 1 } } });

    expect(P.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = (P.auditLog.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(audit).toMatchObject({ actor: "user:admin-1", tool: "migration.freeze_sitemap", ok: true });
    expect(JSON.parse(String(audit.argsJson))).toEqual({ projectId: "proj-1", count: 3, dryRun: false });
    expect(r).toMatchObject({ dryRun: false, frozen: 3, skipped: 2 });
  });

  it(`over the ${MIGRATION_URL_CAP} cap the whole freeze is refused with one error — and confirm writes nothing`, async () => {
    const many = Array.from({ length: MIGRATION_URL_CAP + 1 }, (_, i) => ({ oldUrl: `${SRC}/p/${i}/`, kind: "product" }));
    const dry = await freezeUrlMap("proj-1", many, "user:admin-1", { dryRun: true });
    if (!dry.dryRun) throw new Error("expected a dry run");
    expect(dry.rows).toEqual([]);
    expect(dry.errors).toHaveLength(1);
    expect(dry.errors[0].reason).toMatch(/at most 20000/);
    const real = await freezeUrlMap("proj-1", many, "user:admin-1", { dryRun: false });
    expect(real).toMatchObject({ dryRun: false, frozen: 0, skipped: 1, snapshotId: null });
    expect(writes()).toEqual([0, 0, 0, 0, 0]);
  });

  it("exactly at the cap it freezes", async () => {
    const atCap = Array.from({ length: MIGRATION_URL_CAP }, (_, i) => ({ oldUrl: `${SRC}/p/${i}/`, kind: "product" }));
    expect(await freezeUrlMap("proj-1", atCap, "user:admin-1", { dryRun: false })).toMatchObject({ frozen: MIGRATION_URL_CAP });
  });

  it("a confirm with no valid URL writes nothing — it would wipe the map the checks run against", async () => {
    const r = await freezeUrlMap("proj-1", [{ oldUrl: "https://elsewhere.dk/", kind: "page" }], "user:admin-1", { dryRun: false });
    expect(r).toMatchObject({ dryRun: false, frozen: 0, skipped: 1 });
    expect(writes()).toEqual([0, 0, 0, 0, 0]);
  });

  it("an unknown project is an error, before anything is written", async () => {
    P.migrationProject.findUnique.mockResolvedValue(null);
    await expect(freezeUrlMap("nope", ENTRIES, "user:admin-1", { dryRun: false })).rejects.toThrow(/not found/);
    expect(writes()).toEqual([0, 0, 0, 0, 0]);
  });
});
