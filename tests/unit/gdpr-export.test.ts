import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * DSAR-eksport (B1) — verificér at exportUserData samler subjektets data og
 * EKSKLUDERER passwordHash. Mocket prisma, ingen DB.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    order: { findMany: vi.fn() },
    productReview: { findMany: vi.fn() },
    subscription: { findMany: vi.fn() },
    cart: { findMany: vi.fn() },
    lead: { findMany: vi.fn() },
    acpCheckoutSession: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

function resetAll() {
  vi.resetModules();
  for (const m of Object.values(mocks.prisma)) {
    for (const fn of Object.values(m)) fn.mockReset();
  }
  mocks.prisma.order.findMany.mockResolvedValue([]);
  mocks.prisma.productReview.findMany.mockResolvedValue([]);
  mocks.prisma.subscription.findMany.mockResolvedValue([]);
  mocks.prisma.cart.findMany.mockResolvedValue([]);
  mocks.prisma.lead.findMany.mockResolvedValue([]);
  mocks.prisma.acpCheckoutSession.findMany.mockResolvedValue([]);
}

describe("exportUserData", () => {
  beforeEach(resetAll);

  it("returnerer null for ukendt bruger", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const { exportUserData } = await import("@/lib/gdpr/export");
    expect(await exportUserData("nope")).toBeNull();
  });

  it("samler en fuld eksport og ekskluderer passwordHash i select", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.dk",
      name: "A",
    });
    mocks.prisma.order.findMany.mockResolvedValue([{ id: "o1" }]);

    const { exportUserData } = await import("@/lib/gdpr/export");
    const data = await exportUserData("u1");

    expect(data).not.toBeNull();
    expect((data!.subject as { email: string }).email).toBe("a@b.dk");
    expect(data!.orders.length).toBe(1);
    expect(typeof data!.exportedAt).toBe("string");

    const select = mocks.prisma.user.findUnique.mock.calls[0][0].select as Record<
      string,
      unknown
    >;
    expect(select.passwordHash).toBeUndefined();
    expect(select.email).toBe(true);
  });
});
