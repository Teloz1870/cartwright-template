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
    orderNote: { create: vi.fn(), findMany: vi.fn() },
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
  mocks.tx.orderNote.findMany.mockResolvedValue([]);
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
    if (!res.ok) expect(res.error).toMatch(/not found/);
  });

  const onOrder = (status: string, paidAt: Date | null = null) => {
    const row = returnRow(false);
    return { ...row, order: { ...row.order, status, paidAt } };
  };
  const cancelNote = (from: string) => ({ metaJson: JSON.stringify({ from, to: "cancelled" }) });

  it.each([
    ["an order still awaiting payment", "pending_payment", []],
    ["a cancel that left no note (the webhook, the cron)", "cancelled", []],
    ["an operator's cancel of an unpaid order", "cancelled", [cancelNote("pending_payment")]],
    ["a cancelled quote, which never drew stock", "cancelled", [cancelNote("quote")]],
    ["a note that cannot be read", "cancelled", [{ metaJson: "{not json" }, { metaJson: null }]],
    ["a refund that landed after an unpaid cancel", "refunded", [cancelNote("pending_payment")]],
    ["a later cancel from a dispute", "cancelled", [cancelNote("disputed"), cancelNote("pending_payment")]],
  ])("restocks nothing on %s", async (_name, status, notes) => {
    mocks.tx.return.findUnique.mockResolvedValue(onOrder(status));
    mocks.tx.orderNote.findMany.mockResolvedValue(notes);

    const res = await receiveAndRestock("ret-1");

    expect(res).toEqual({ ok: false, error: expect.stringMatching(/not been paid|before its payment was registered/) });
    expect(mocks.tx.product.update).not.toHaveBeenCalled();
    expect(mocks.tx.productVariant.update).not.toHaveBeenCalled();
    expect(mocks.tx.return.update).not.toHaveBeenCalled();
    expect(mocks.sendReturnReceivedEmail).not.toHaveBeenCalled();
  });

  it.each(["paid", "processing", "pending", "flagged_review", "disputed"])(
    "restocks on an order an operator cancelled from %s: that cancel gave no stock back",
    async (from) => {
      mocks.tx.return.findUnique.mockResolvedValue(onOrder("cancelled"));
      mocks.tx.orderNote.findMany.mockResolvedValue([{ metaJson: null }, cancelNote(from)]);

      expect(await receiveAndRestock("ret-1")).toEqual({ ok: true });
      expect(mocks.tx.product.update).toHaveBeenCalledTimes(1);
    },
  );

  it("restocks on a cancelled order with no cancel note that was paid", async () => {
    mocks.tx.return.findUnique.mockResolvedValue(onOrder("cancelled", new Date("2026-09-01T10:00:00Z")));

    expect(await receiveAndRestock("ret-1")).toEqual({ ok: true });
    expect(mocks.tx.product.update).toHaveBeenCalledTimes(1);
  });

  it("a note about another move is no cancel", async () => {
    mocks.tx.return.findUnique.mockResolvedValue(onOrder("shipped"));
    mocks.tx.orderNote.findMany.mockResolvedValue([{ metaJson: JSON.stringify({ from: "paid", to: "shipped" }) }]);

    expect(await receiveAndRestock("ret-1")).toEqual({ ok: true });
    expect(mocks.tx.product.update).toHaveBeenCalledTimes(1);
  });

  it("a recorded payment outranks an older cancel note, and reads no notes", async () => {
    mocks.tx.return.findUnique.mockResolvedValue(onOrder("shipped", new Date("2026-09-01T10:00:00Z")));
    mocks.tx.orderNote.findMany.mockResolvedValue([cancelNote("pending_payment")]);

    expect(await receiveAndRestock("ret-1")).toEqual({ ok: true });
    expect(mocks.tx.orderNote.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.product.update).toHaveBeenCalledTimes(1);
  });

  it("a payment an operator registered counts on a cancelled order with no cancel note", async () => {
    mocks.tx.return.findUnique.mockResolvedValue(onOrder("cancelled"));
    mocks.tx.orderNote.findMany.mockResolvedValue([
      { metaJson: JSON.stringify({ from: "pending_payment", to: "paid" }) },
    ]);

    expect(await receiveAndRestock("ret-1")).toEqual({ ok: true });
    expect(mocks.tx.product.update).toHaveBeenCalledTimes(1);
  });
});
