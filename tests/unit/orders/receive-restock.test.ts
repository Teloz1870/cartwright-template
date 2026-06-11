import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ordrestyring — integration-niveau test for receiveAndRestock idempotens.
 * Mocker @/lib/db (interaktiv $transaction-callback-form) + side-modulerne, men
 * kører den ÆGTE restockLines mod en fake tx → verificerer at Return.restocked-
 * guarden gør at lager øges PRÆCIS én gang, selv ved gentagne kald.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    return: { findUnique: vi.fn(), update: vi.fn() },
    orderNote: { create: vi.fn() },
    productVariant: { update: vi.fn().mockResolvedValue({}) },
    product: { update: vi.fn().mockResolvedValue({}) },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
    sendReturnReceivedEmail: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin", () => ({
  requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));
vi.mock("@/lib/audit", () => ({
  // passthrough — kør handleren, ignorér audit-skrivning
  withAudit: (_meta: unknown, handler: () => unknown) => handler(),
}));
vi.mock("@/lib/stripe", () => ({ createRefund: vi.fn() }));
vi.mock("@/lib/fulfillment", () => ({ createFulfillmentOrders: vi.fn() }));
vi.mock("@/lib/mailer", () => ({
  mailer: { sendOrderConfirmation: vi.fn() },
  sendShippingNotificationEmail: vi.fn(),
  sendRefundConfirmationEmail: vi.fn(),
  sendReturnReceivedEmail: mocks.sendReturnReceivedEmail,
}));

import { receiveAndRestock } from "@/app/admin/ordrer/actions";

const returnRow = (restocked: boolean) => ({
  id: "ret-1",
  orderId: "order-1",
  restocked,
  items: [
    {
      productName: "Solir Classic",
      quantity: 2,
      variantId: null,
      orderItem: { productId: "prod-1" },
    },
    {
      productName: "Solir Variant",
      quantity: 1,
      variantId: "var-9",
      orderItem: { productId: "prod-2" },
    },
  ],
  order: { id: "order-1", email: "k@example.dk", shippingName: "Kunde" },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tx.productVariant.update.mockResolvedValue({});
  mocks.tx.product.update.mockResolvedValue({});
});

describe("receiveAndRestock", () => {
  it("restocks variant-aware and marks the return received when not yet restocked", async () => {
    mocks.tx.return.findUnique.mockResolvedValue(returnRow(false));

    const res = await receiveAndRestock("ret-1");

    expect(res.ok).toBe(true);
    // non-variant line → product.stock, variant line → variant.stock
    expect(mocks.tx.product.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { stock: { increment: 2 } },
    });
    expect(mocks.tx.productVariant.update).toHaveBeenCalledWith({
      where: { id: "var-9" },
      data: { stock: { increment: 1 } },
    });
    expect(mocks.tx.return.update).toHaveBeenCalledWith({
      where: { id: "ret-1" },
      data: { restocked: true, status: "received" },
    });
    expect(mocks.sendReturnReceivedEmail).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when the return is already restocked (idempotent)", async () => {
    mocks.tx.return.findUnique.mockResolvedValue(returnRow(true));

    const res = await receiveAndRestock("ret-1");

    expect(res.ok).toBe(true);
    expect(mocks.tx.product.update).not.toHaveBeenCalled();
    expect(mocks.tx.productVariant.update).not.toHaveBeenCalled();
    expect(mocks.tx.return.update).not.toHaveBeenCalled();
    expect(mocks.sendReturnReceivedEmail).not.toHaveBeenCalled();
  });

  it("increments stock exactly once across two calls (first restocks, second is guarded)", async () => {
    mocks.tx.return.findUnique
      .mockResolvedValueOnce(returnRow(false)) // first call: not yet restocked
      .mockResolvedValueOnce(returnRow(true)); // second call: already restocked

    await receiveAndRestock("ret-1");
    await receiveAndRestock("ret-1");

    // prod-1 (non-variant) incremented once total; var-9 once total
    expect(mocks.tx.product.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.productVariant.update).toHaveBeenCalledTimes(1);
  });

  it("returns an error when the return does not exist", async () => {
    mocks.tx.return.findUnique.mockResolvedValue(null);

    const res = await receiveAndRestock("missing");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/ikke fundet/);
  });
});
