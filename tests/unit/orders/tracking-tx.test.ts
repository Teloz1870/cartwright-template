import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * writeTracking (lib/orders/tracking.ts) in a caller's transaction: the same two
 * rows, on the client it is given, and no transaction of its own.
 */
const mocks = vi.hoisted(() => ({
  prisma: { order: { update: vi.fn() }, orderNote: { create: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/mailer", () => ({ sendShippingNotificationEmail: vi.fn() }));
vi.mock("@/lib/audit", () => ({ withAudit: (_m: unknown, fn: () => unknown) => fn() }));

const FIELDS = { carrier: "GLS", trackingNumber: "Z9", trackingUrl: null, estDeliveryFrom: null, estDeliveryTo: null };

beforeEach(() => {
  mocks.prisma.order.update.mockReset();
  mocks.prisma.orderNote.create.mockReset();
  mocks.prisma.$transaction.mockReset().mockImplementation(async (ops: unknown[]) => Promise.all(ops));
});

describe("writeTracking", () => {
  it("writes on the transaction it is handed, and opens none", async () => {
    const tx = { order: { update: vi.fn() }, orderNote: { create: vi.fn() } };
    const { writeTracking } = await import("@/lib/orders/tracking");
    await writeTracking("o1", "system:test", FIELDS, tx as never);

    expect(tx.order.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "o1" }, data: FIELDS });
    expect(tx.orderNote.create.mock.calls[0][0].data).toMatchObject({ orderId: "o1", body: "Tracking updated: GLS Z9" });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.order.update).not.toHaveBeenCalled();
  });

  it("without one, commits the same two rows in a transaction of its own", async () => {
    const { writeTracking } = await import("@/lib/orders/tracking");
    await writeTracking("o1", "system:test", FIELDS);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.order.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "o1" }, data: FIELDS });
  });
});
