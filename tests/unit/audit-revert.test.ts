import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * audit.revert dækker products.delete OG design.set_layout.
 *
 * Vi mocker prisma + invalidateLayoutCache + withAudit (passer fn igennem)
 * og verificerer at:
 *  - en design.set_layout audit-entry kan rolles tilbage til den forrige
 *    layoutJson (inkl. null-tilstand)
 *  - et ukendt revertibelt tool fejler eksplicit med supported-listen
 *  - cache-invalidering kaldes efter restore
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    auditLog: { findUnique: vi.fn(), create: vi.fn() },
    brandingSettings: { upsert: vi.fn() },
    product: { update: vi.fn() },
  },
  withAudit: vi.fn(),
  invalidateLayoutCache: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({
  withAudit: mocks.withAudit,
  listAuditEntries: vi.fn(),
}));
vi.mock("@/lib/audit-context", () => ({
  withAuditContext: (_c: unknown, fn: () => unknown) => Promise.resolve(fn()),
}));
vi.mock("@/lib/layout", () => ({
  invalidateLayoutCache: mocks.invalidateLayoutCache,
}));

const PREVIOUS_LAYOUT = '{"sections":[{"key":"hero","enabled":true}]}';

function reset() {
  vi.resetModules();
  mocks.prisma.auditLog.findUnique.mockReset();
  mocks.prisma.auditLog.create.mockReset().mockResolvedValue({});
  mocks.prisma.brandingSettings.upsert.mockReset().mockResolvedValue({});
  mocks.prisma.product.update.mockReset().mockResolvedValue({});
  mocks.invalidateLayoutCache.mockReset();
  mocks.withAudit
    .mockReset()
    .mockImplementation(async (_m: unknown, fn: () => Promise<unknown>) => fn());
}

describe("audit.revert — design.set_layout", () => {
  beforeEach(reset);

  it("gendanner forrige layoutJson via upsert(where:{id:1})", async () => {
    mocks.prisma.auditLog.findUnique.mockResolvedValue({
      id: "audit-1",
      tool: "design.set_layout",
      ok: true,
      // safeStringify har JSON-encoded forrige layoutJson én gang.
      beforeJson: JSON.stringify(PREVIOUS_LAYOUT),
    });

    const { auditRevert } = await import("@/lib/tools/audit");
    const result = await auditRevert.handler(
      { auditLogId: "audit-1", confirm: true },
      { actor: "user:test" },
    );

    expect(mocks.prisma.brandingSettings.upsert).toHaveBeenCalledTimes(1);
    const call = mocks.prisma.brandingSettings.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ id: 1 });
    expect(call.update).toEqual({ layoutJson: PREVIOUS_LAYOUT });
    expect(call.create.id).toBe(1);
    expect(call.create.layoutJson).toBe(PREVIOUS_LAYOUT);
    expect((result as { ok: boolean }).ok).toBe(true);
    expect((result as { revertedTool: string }).revertedTool).toBe(
      "design.set_layout",
    );
  });

  it("håndterer null forrige layoutJson (revert af første set)", async () => {
    mocks.prisma.auditLog.findUnique.mockResolvedValue({
      id: "audit-2",
      tool: "design.set_layout",
      ok: true,
      beforeJson: JSON.stringify(null),
    });

    const { auditRevert } = await import("@/lib/tools/audit");
    await auditRevert.handler(
      { auditLogId: "audit-2", confirm: true },
      { actor: "user:test" },
    );

    const call = mocks.prisma.brandingSettings.upsert.mock.calls[0][0];
    expect(call.update.layoutJson).toBeNull();
    expect(call.create.layoutJson).toBeNull();
  });

  it("kalder invalidateLayoutCache efter restore", async () => {
    mocks.prisma.auditLog.findUnique.mockResolvedValue({
      id: "audit-3",
      tool: "design.set_layout",
      ok: true,
      beforeJson: JSON.stringify(PREVIOUS_LAYOUT),
    });

    const { auditRevert } = await import("@/lib/tools/audit");
    await auditRevert.handler(
      { auditLogId: "audit-3", confirm: true },
      { actor: "user:test" },
    );

    expect(mocks.invalidateLayoutCache).toHaveBeenCalledTimes(1);
  });
});

describe("audit.revert — regression + unsupported", () => {
  beforeEach(reset);

  it("products.delete-revert virker uændret", async () => {
    mocks.prisma.auditLog.findUnique.mockResolvedValue({
      id: "audit-p1",
      tool: "products.delete",
      ok: true,
      beforeJson: JSON.stringify({ id: "prod-123", name: "Aviator" }),
    });
    mocks.prisma.product.update.mockResolvedValue({
      id: "prod-123",
      slug: "aviator",
      name: "Aviator",
    });

    const { auditRevert } = await import("@/lib/tools/audit");
    const result = await auditRevert.handler(
      { auditLogId: "audit-p1", confirm: true },
      { actor: "user:test" },
    );
    expect((result as { ok: boolean }).ok).toBe(true);
    expect(mocks.prisma.product.update).toHaveBeenCalledWith({
      where: { id: "prod-123" },
      data: { deletedAt: null },
      select: { id: true, slug: true, name: true },
    });
  });

  it("fejler eksplicit ved ikke-understøttet tool med supported-listen", async () => {
    mocks.prisma.auditLog.findUnique.mockResolvedValue({
      id: "audit-x",
      tool: "products.create",
      ok: true,
      beforeJson: JSON.stringify({ something: 1 }),
    });

    const { auditRevert } = await import("@/lib/tools/audit");
    await expect(
      auditRevert.handler(
        { auditLogId: "audit-x", confirm: true },
        { actor: "user:test" },
      ),
    ).rejects.toThrow(/products\.delete.*design\.set_layout/);
  });

  it("fejler hvis audit-entry ikke findes", async () => {
    mocks.prisma.auditLog.findUnique.mockResolvedValue(null);

    const { auditRevert } = await import("@/lib/tools/audit");
    await expect(
      auditRevert.handler(
        { auditLogId: "nope", confirm: true },
        { actor: "user:test" },
      ),
    ).rejects.toThrow(/Audit entry not found/);
  });

  it("fejler hvis entry.ok er false", async () => {
    mocks.prisma.auditLog.findUnique.mockResolvedValue({
      id: "audit-failed",
      tool: "design.set_layout",
      ok: false,
      beforeJson: JSON.stringify(PREVIOUS_LAYOUT),
    });

    const { auditRevert } = await import("@/lib/tools/audit");
    await expect(
      auditRevert.handler(
        { auditLogId: "audit-failed", confirm: true },
        { actor: "user:test" },
      ),
    ).rejects.toThrow(/Cannot roll back a failed operation/);
  });
});
