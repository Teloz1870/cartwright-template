import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Abandoned-cart-job (H6) — eligibility-query + send + idempotens-log. Mocket
 * prisma + mailer.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    cart: { findMany: vi.fn() },
    abandonedCartLog: { create: vi.fn() },
  },
  sendAbandonedCartEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/mailer/abandoned-cart", () => ({
  sendAbandonedCartEmail: mocks.sendAbandonedCartEmail,
}));
vi.mock("@/brand.config", () => ({ brand: { url: "https://shop.dk" } }));

function reset() {
  vi.resetModules();
  mocks.prisma.cart.findMany.mockReset();
  mocks.prisma.abandonedCartLog.create.mockReset().mockResolvedValue({});
  mocks.sendAbandonedCartEmail.mockReset().mockResolvedValue({ messageId: "m1" });
}

describe("runAbandonedCartJob", () => {
  beforeEach(reset);

  it("spørger kun logged-in, inaktive, ikke-mailede kurve med varer", async () => {
    mocks.prisma.cart.findMany.mockResolvedValue([]);
    const now = new Date("2026-05-31T12:00:00Z");
    const { runAbandonedCartJob } = await import("@/lib/abandoned-cart");
    await runAbandonedCartJob({ now, hours: 24 });

    const where = mocks.prisma.cart.findMany.mock.calls[0][0].where;
    expect(where.userId).toEqual({ not: null });
    expect(where.items).toEqual({ some: {} });
    expect(where.abandonedCartLog).toBeNull();
    expect(where.updatedAt.lt).toEqual(new Date("2026-05-30T12:00:00Z")); // now - 24h
  });

  it("sender + logger for kurv med email, springer kurv uden email over", async () => {
    mocks.prisma.cart.findMany.mockResolvedValue([
      {
        id: "c1",
        user: { email: "a@b.dk", name: "Kim" },
        items: [{ quantity: 2, product: { name: "Kaffe", priceDkk: 12500 } }],
      },
      { id: "c2", user: { email: null, name: null }, items: [{ quantity: 1, product: { name: "X", priceDkk: 100 } }] },
    ]);
    const { runAbandonedCartJob } = await import("@/lib/abandoned-cart");
    const run = await runAbandonedCartJob({});

    expect(run.sent).toBe(1);
    expect(run.skipped).toBe(1);
    expect(mocks.sendAbandonedCartEmail).toHaveBeenCalledTimes(1);
    const arg = mocks.sendAbandonedCartEmail.mock.calls[0][0];
    expect(arg.to).toBe("a@b.dk");
    expect(arg.cartUrl).toBe("https://shop.dk/cart");
    expect(arg.items[0]).toEqual({ productName: "Kaffe", quantity: 2, unitPriceDkk: 12500 });
    expect(mocks.prisma.abandonedCartLog.create).toHaveBeenCalledWith({
      data: { cartId: "c1", emailMessageId: "m1" },
    });
  });
});
