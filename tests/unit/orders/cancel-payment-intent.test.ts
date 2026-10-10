/**
 * PAY-CANCEL — an operator cancel also cancels the order's Stripe
 * PaymentIntent. Before this nothing called `paymentIntents.cancel`: a
 * customer still on the payment page could finish 3-D Secure and pay for an
 * order the shop had cancelled, and since #602 that money stays in Stripe with
 * only an `orders.payment_not_applied` audit row to show for it.
 *
 * Pinned on all three operator paths (admin status form, bulk action,
 * `orders.update_status`) and on the helper's fail-soft contract: nothing on
 * the Stripe side may block or undo the order cancel, and a payment that
 * already succeeded is never cancelled — a refund is the answer there.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    audits: [] as { tool: string; ok: boolean; result?: unknown; error?: string }[],
    stripe: {
      paymentIntents: {
        retrieve: vi.fn(),
        cancel: vi.fn(),
      },
    },
    stripeConfigured: { value: true },
    prisma: {
      order: {
        findUnique: vi.fn(),
        update: vi.fn((a: unknown) => {
          calls.push("order.update");
          return { id: "o1", status: (a as { data: { status: string } }).data.status };
        }),
      },
      orderNote: { create: vi.fn(async (_a: unknown) => ({ id: "n1" })) },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(async () => (mocks.stripeConfigured.value ? mocks.stripe : null)),
  createRefund: vi.fn(),
}));
// The real withAudit's contract: record ok + result, or ok:false and rethrow.
vi.mock("@/lib/audit", () => ({
  withAudit: async (meta: { tool: string }, handler: () => Promise<unknown>) => {
    try {
      const result = await handler();
      mocks.audits.push({ tool: meta.tool, ok: true, result });
      return result;
    } catch (err) {
      mocks.audits.push({ tool: meta.tool, ok: false, error: (err as Error).message });
      throw err;
    }
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin", () => ({
  requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));
vi.mock("@/lib/fulfillment", () => ({ createFulfillmentOrders: vi.fn() }));
vi.mock("@/lib/mailer", () => ({
  mailer: { sendOrderConfirmation: vi.fn() },
  sendShippingNotificationEmail: vi.fn(),
  sendRefundConfirmationEmail: vi.fn(),
  sendReturnReceivedEmail: vi.fn(),
}));

import { cancelOrderPaymentIntent } from "@/lib/orders/cancel-payment";
import { bulkUpdateStatus, updateOrderStatusAdmin } from "@/app/admin/ordrer/actions";
import { updateOrderStatus } from "@/lib/tools/orders";

const ACTOR = "user:admin-1" as const;

type NoteArg = { data: { orderId: string; body: string; metaJson: string } };
const notes = () =>
  mocks.prisma.orderNote.create.mock.calls.map((c) => (c[0] as NoteArg).data);
const paymentNote = () => notes().find((n) => n.metaJson?.includes("intentId"));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.audits.length = 0;
  mocks.stripeConfigured.value = true;
  vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.stripe.paymentIntents.retrieve.mockResolvedValue({ status: "requires_action" });
  mocks.stripe.paymentIntents.cancel.mockImplementation(async (id: string) => {
    mocks.calls.push("stripe.cancel");
    return { id, status: "canceled" };
  });
  mocks.prisma.orderNote.create.mockImplementation(async () => ({ id: "n1" }));
});

describe("cancelOrderPaymentIntent — the helper", () => {
  const run = () =>
    cancelOrderPaymentIntent({ orderId: "o1", paymentIntentId: "pi_1", actor: ACTOR });

  it("cancels an intent the customer has not paid, and says so on the order", async () => {
    await expect(run()).resolves.toMatchObject({ outcome: "canceled" });
    expect(mocks.stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_1");
    expect(paymentNote()).toMatchObject({ orderId: "o1" });
    expect(paymentNote()!.body).toMatch(/can no longer pay/);
    expect(JSON.parse(paymentNote()!.metaJson)).toEqual({ intentId: "pi_1", outcome: "canceled" });
    expect(mocks.audits).toEqual([
      expect.objectContaining({ tool: "orders.cancel_payment_intent", ok: true }),
    ]);
  });

  it("never cancels an intent that already succeeded — the note points at the refund", async () => {
    mocks.stripe.paymentIntents.retrieve.mockResolvedValue({ status: "succeeded" });

    await expect(run()).resolves.toMatchObject({ outcome: "succeeded" });
    expect(mocks.stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(paymentNote()!.body).toMatch(/already paid/);
    expect(paymentNote()!.body).toMatch(/refund/);
    expect(mocks.audits[0]).toMatchObject({ ok: true, result: { outcome: "succeeded" } });
  });

  it("leaves an already-cancelled intent alone", async () => {
    mocks.stripe.paymentIntents.retrieve.mockResolvedValue({ status: "canceled" });

    await expect(run()).resolves.toMatchObject({ outcome: "already_canceled" });
    expect(mocks.stripe.paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it("a Stripe error resolves as failed, audits ok:false and tells the merchant what to do", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.stripe.paymentIntents.cancel.mockRejectedValue(
      new Error("This PaymentIntent's status is succeeded"),
    );

    await expect(run()).resolves.toMatchObject({ outcome: "failed" });
    expect(mocks.audits[0]).toMatchObject({
      tool: "orders.cancel_payment_intent",
      ok: false,
      error: "This PaymentIntent's status is succeeded",
    });
    expect(paymentNote()!.body).toMatch(/Stripe Dashboard/);
    expect(paymentNote()!.body).toMatch(/refund/);
    err.mockRestore();
  });

  it("resolves as failed — not a throw — when Stripe is not configured or unreachable", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.stripeConfigured.value = false;
    await expect(run()).resolves.toMatchObject({ outcome: "failed" });

    mocks.stripeConfigured.value = true;
    mocks.stripe.paymentIntents.retrieve.mockRejectedValue(new Error("ECONNRESET"));
    await expect(run()).resolves.toMatchObject({ outcome: "failed" });
    expect(mocks.stripe.paymentIntents.cancel).not.toHaveBeenCalled();

    mocks.prisma.orderNote.create.mockRejectedValue(new Error("db down"));
    await expect(run()).resolves.toMatchObject({ outcome: "failed" });
    err.mockRestore();
  });

  it("does nothing for an order without a Stripe payment", async () => {
    await expect(
      cancelOrderPaymentIntent({ orderId: "o1", paymentIntentId: null, actor: ACTOR }),
    ).resolves.toBeNull();
    expect(mocks.stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(mocks.prisma.orderNote.create).not.toHaveBeenCalled();
  });
});

describe("admin status form and bulk action", () => {
  it("cancelling a pending_payment order cancels its intent after the status is written", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      status: "pending_payment",
      stripePaymentIntentId: "pi_1",
    });

    await expect(updateOrderStatusAdmin("o1", "cancelled")).resolves.toEqual({ ok: true });

    expect(mocks.stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_1");
    expect(mocks.calls).toEqual(["order.update", "stripe.cancel"]);
  });

  it("a Stripe failure never blocks the cancel", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.prisma.order.findUnique.mockResolvedValue({
      status: "pending_payment",
      stripePaymentIntentId: "pi_1",
    });
    mocks.stripe.paymentIntents.cancel.mockRejectedValue(new Error("stripe down"));

    await expect(updateOrderStatusAdmin("o1", "cancelled")).resolves.toEqual({ ok: true });
    expect(mocks.prisma.order.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "cancelled" },
    });
    err.mockRestore();
  });

  it("touches no payment on a move that is not a cancel, or on a refused one", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      status: "pending_payment",
      stripePaymentIntentId: "pi_1",
    });
    await updateOrderStatusAdmin("o1", "paid");

    mocks.prisma.order.findUnique.mockResolvedValue({
      status: "shipped",
      stripePaymentIntentId: "pi_1",
    });
    await expect(updateOrderStatusAdmin("o1", "cancelled")).resolves.toMatchObject({ ok: false });

    expect(mocks.stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  it("the bulk action cancels each order's intent", async () => {
    mocks.prisma.order.findUnique
      .mockResolvedValueOnce({ status: "pending_payment", stripePaymentIntentId: "pi_a" })
      .mockResolvedValueOnce({ status: "pending_payment", stripePaymentIntentId: "pi_b" });

    await expect(bulkUpdateStatus(["a", "b"], "cancelled")).resolves.toEqual({
      updated: 2,
      skipped: [],
    });
    expect(mocks.stripe.paymentIntents.cancel.mock.calls.map((c) => c[0])).toEqual([
      "pi_a",
      "pi_b",
    ]);
  });
});

describe("orders.update_status", () => {
  const ctx = { actor: "apikey:k1" } as never;

  it("cancels the intent and reports it in a result the output schema accepts", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      status: "pending_payment",
      totalDkk: 14900,
      stripePaymentIntentId: "pi_1",
    });

    const result = await updateOrderStatus.handler({ orderId: "o1", status: "cancelled" }, ctx);

    expect(mocks.stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_1");
    expect(result).toMatchObject({
      id: "o1",
      status: "cancelled",
      paymentIntent: { outcome: "canceled" },
    });
    expect(() => updateOrderStatus.output.parse(result)).not.toThrow();
  });

  it("an already-paid order: no cancel, and the result says to refund", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      status: "paid",
      totalDkk: 14900,
      stripePaymentIntentId: "pi_1",
    });
    mocks.stripe.paymentIntents.retrieve.mockResolvedValue({ status: "succeeded" });

    const result = (await updateOrderStatus.handler(
      { orderId: "o1", status: "cancelled" },
      ctx,
    )) as { paymentIntent: { outcome: string; note: string } };

    expect(mocks.stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(result.paymentIntent.outcome).toBe("succeeded");
    expect(result.paymentIntent.note).toMatch(/refund/);
  });
});
