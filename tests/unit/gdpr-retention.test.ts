import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Retention (B3) — cleanup rører kun udløbne rækker; audit-prune er DEFAULT-OFF.
 * Mocket prisma + brand.config (auditRetentionDays: null = default).
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    verificationToken: { deleteMany: vi.fn(), count: vi.fn() },
    acpCheckoutSession: { deleteMany: vi.fn(), count: vi.fn() },
    acpIdempotencyKey: { deleteMany: vi.fn(), count: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
    cart: { deleteMany: vi.fn(), count: vi.fn() },
    auditLog: { deleteMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/brand.config", () => ({
  brand: { policies: { auditRetentionDays: null } },
}));

function resetAll() {
  vi.resetModules();
  for (const m of Object.values(mocks.prisma)) {
    for (const fn of Object.values(m)) fn.mockReset();
  }
  for (const m of Object.values(mocks.prisma)) {
    if ("deleteMany" in m) m.deleteMany.mockResolvedValue({ count: 1 });
    if ("count" in m) (m as { count: ReturnType<typeof vi.fn> }).count.mockResolvedValue(1);
  }
}

describe("cleanupExpiredTokens", () => {
  beforeEach(resetAll);

  it("dry-run tæller men sletter ikke", async () => {
    const { cleanupExpiredTokens } = await import("@/lib/gdpr/retention");
    await cleanupExpiredTokens({ dryRun: true });
    expect(mocks.prisma.verificationToken.count).toHaveBeenCalled();
    expect(mocks.prisma.verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.cart.deleteMany).not.toHaveBeenCalled();
  });

  it("sletter kun udløbne rækker (expires/expiresAt < now)", async () => {
    const now = new Date("2026-05-30T00:00:00Z");
    const { cleanupExpiredTokens } = await import("@/lib/gdpr/retention");
    const counts = await cleanupExpiredTokens({ now });

    const vtWhere = mocks.prisma.verificationToken.deleteMany.mock.calls[0][0].where;
    expect(vtWhere.expires.lt).toEqual(now);
    const acpWhere = mocks.prisma.acpCheckoutSession.deleteMany.mock.calls[0][0].where;
    expect(acpWhere.expiresAt.lt).toEqual(now);
    // gæste-kurve: items slettes FØR kurven (FK)
    expect(mocks.prisma.cartItem.deleteMany).toHaveBeenCalled();
    expect(mocks.prisma.cart.deleteMany).toHaveBeenCalled();
    const cartWhere = mocks.prisma.cart.deleteMany.mock.calls[0][0].where;
    expect(cartWhere.userId).toBeNull();
    expect(counts.verificationTokens).toBe(1);
  });
});

describe("pruneAuditLog", () => {
  beforeEach(resetAll);

  it("default (auditRetentionDays=null) er en no-op — sletter intet", async () => {
    const { pruneAuditLog } = await import("@/lib/gdpr/retention");
    const r = await pruneAuditLog({});
    expect(r.deleted).toBe(0);
    expect(r.retentionDays).toBeNull();
    expect(mocks.prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });
});
