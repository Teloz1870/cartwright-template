import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Soft-erasure (B2) — verificér at anonymizeCustomer anonymiserer PII, BEHOLDER
 * finansielle felter (sætter dem ikke), sletter leads/ACP, tilbagekalder keys
 * og markerer request done. Mocket prisma — INGEN rigtig DB, ingen rigtig data.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    dataErasureRequest: { create: vi.fn(), update: vi.fn() },
    order: { updateMany: vi.fn() },
    productReview: { updateMany: vi.fn() },
    lead: { deleteMany: vi.fn() },
    acpCheckoutSession: { deleteMany: vi.fn() },
    apiKey: { updateMany: vi.fn() },
    auditLog: { updateMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function resetAll() {
  vi.resetModules();
  for (const m of Object.values(mocks.prisma)) {
    for (const fn of Object.values(m)) fn.mockReset();
  }
  mocks.prisma.order.updateMany.mockResolvedValue({ count: 2 });
  mocks.prisma.productReview.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.lead.deleteMany.mockResolvedValue({ count: 1 });
  mocks.prisma.acpCheckoutSession.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.apiKey.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.auditLog.updateMany.mockResolvedValue({ count: 3 });
  mocks.prisma.auditLog.create.mockResolvedValue({});
  mocks.prisma.dataErasureRequest.create.mockResolvedValue({ id: "req1" });
  mocks.prisma.dataErasureRequest.update.mockResolvedValue({});
  mocks.prisma.user.update.mockResolvedValue({});
}

describe("anonymizeCustomer", () => {
  beforeEach(resetAll);

  it("fejler for ukendt bruger", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const { anonymizeCustomer } = await import("@/lib/gdpr/erase");
    const r = await anonymizeCustomer("nope", "user:admin");
    expect(r.ok).toBe(false);
  });

  it("anonymiserer PII, beholder finansielle felter, sletter leads", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.dk" });
    const { anonymizeCustomer } = await import("@/lib/gdpr/erase");
    const r = await anonymizeCustomer("u1", "user:admin");

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.summary.ordersAnonymized).toBe(2);
      expect(r.summary.leadsDeleted).toBe(1);
      expect(r.summary.apiKeysRevoked).toBe(1);
    }

    // Ordre-update: PII redacted, men INGEN finansielle felter sat.
    const orderData = mocks.prisma.order.updateMany.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(orderData.shippingName).toBe("[redacted]");
    expect(String(orderData.email)).toContain("@anonymized.invalid");
    expect(orderData.totalDkk).toBeUndefined();
    expect(orderData.stripePaymentIntentId).toBeUndefined();

    // User-update: passwordHash nulles, email hashes.
    const userData = mocks.prisma.user.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(userData.passwordHash).toBeNull();
    expect(String(userData.email)).toContain("@anonymized.invalid");

    // Leads slettes, request markeres done.
    expect(mocks.prisma.lead.deleteMany).toHaveBeenCalled();
    const reqUpdate = mocks.prisma.dataErasureRequest.update.mock.calls[0][0] as {
      data: { status: string };
    };
    expect(reqUpdate.data.status).toBe("done");
  });
});
