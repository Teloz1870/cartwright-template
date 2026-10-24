/**
 * The reconcile cron (app/api/cron/reconcile-stripe) — the safety net for a
 * payment the Stripe webhook missed. Two defects measured on #598/app#376:
 *
 *  CRON-FX — it compared `intent.amount` with the base-currency `totalDkk`,
 *  while the webhook compares against the order's snapshotted presentment
 *  amount + currency. A multiCurrency order the webhook missed was therefore
 *  flagged for review although the customer paid exactly what they were shown.
 *
 *  CRON-RESTOCK — on a cancelled intent it gave stock back to `product.stock`
 *  for every line, while createOrder takes a variant line's stock from
 *  `productVariant.stock`. The inverse now goes through restockLines.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    order: { updateMany: vi.fn() },
    orderItem: { findMany: vi.fn() },
    product: { update: vi.fn() },
    productVariant: { update: vi.fn() },
  };
  return {
    tx,
    stripe: { paymentIntents: { retrieve: vi.fn() } },
    prisma: {
      order: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    sendOrderConfirmation: vi.fn(),
    notifyOwnerOfPaidOrder: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/stripe", () => ({ getStripeClient: vi.fn(async () => mocks.stripe) }));
vi.mock("@/lib/mailer", () => ({
  mailer: { sendOrderConfirmation: mocks.sendOrderConfirmation },
}));
vi.mock("@/lib/orders/notify-owner", () => ({
  notifyOwnerOfPaidOrder: mocks.notifyOwnerOfPaidOrder,
}));

import { GET } from "@/app/api/cron/reconcile-stripe/route";

const SECRET = "cron-test-secret";

function cronRequest() {
  return new Request("http://localhost/api/cron/reconcile-stripe", {
    headers: { authorization: `Bearer ${SECRET}` },
  }) as never;
}

type Line = { productId: string | null; variantId: string | null; quantity: number };

function order(over: Record<string, unknown> = {}, items: Line[] = []) {
  return {
    id: "ord_1",
    status: "pending_payment",
    stripePaymentIntentId: "pi_1",
    email: "kunde@example.dk",
    shippingName: "Kunde",
    subtotalDkk: 14900,
    discountDkk: 0,
    shippingDkk: 0,
    totalDkk: 14900,
    currency: "DKK",
    fxRate: 1,
    confirmationEmailSentAt: null,
    items: items.map((l) => ({ ...l, productName: "Plank", unitPriceDkk: 14900 })),
    ...over,
  };
}

async function run() {
  const res = await GET(cronRequest());
  return (await res.json()) as { results: { orderId: string; action: string }[] };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  mocks.prisma.order.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.order.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.orderItem.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reconcile cron — the amount check is the webhook's (CRON-FX)", () => {
  // 149.00 DKK at the snapshotted 0.134 → 19.966 EUR → charged 1997 cents.
  const eurOrder = { currency: "EUR", fxRate: 0.134 };

  it("marks a multiCurrency order paid when Stripe charged its presentment amount", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([order(eurOrder)]);
    mocks.stripe.paymentIntents.retrieve.mockResolvedValue({
      status: "succeeded",
      amount: 1997,
      currency: "eur",
      payment_method_types: ["card"],
    });

    const body = await run();

    expect(body.results).toEqual([{ orderId: "ord_1", action: "reconciled_paid" }]);
    expect(mocks.prisma.order.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "flagged_review" } }),
    );
    expect(mocks.prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_1", status: "pending_payment" },
        data: expect.objectContaining({ status: "paid" }),
      }),
    );
  });

  it("flags the right amount in the wrong currency", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([order(eurOrder)]);
    mocks.stripe.paymentIntents.retrieve.mockResolvedValue({
      status: "succeeded",
      amount: 1997,
      currency: "usd",
    });

    const body = await run();

    expect(body.results).toEqual([{ orderId: "ord_1", action: "flagged_amount_mismatch" }]);
    // Pinned to pending_payment like the cron's other writes (RACE-MARKPAID).
    expect(mocks.prisma.order.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "ord_1", status: "pending_payment" },
      data: { status: "flagged_review" },
    });
    expect(mocks.prisma.order.update).not.toHaveBeenCalled();
  });

  it("does not flag an order that left pending_payment after the query: a cancelled order stays cancelled", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([order()]);
    mocks.stripe.paymentIntents.retrieve.mockResolvedValue({
      status: "succeeded",
      amount: 100,
      currency: "dkk",
    });
    // An operator cancelled (and restocked) it between the query and the write.
    mocks.prisma.order.updateMany.mockResolvedValue({ count: 0 });

    const body = await run();

    expect(body.results).toEqual([{ orderId: "ord_1", action: "status_changed_not_flagged" }]);
    expect(mocks.prisma.order.update).not.toHaveBeenCalled();
    expect(mocks.sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it("still flags a base-currency order that was underpaid", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([order()]);
    mocks.stripe.paymentIntents.retrieve.mockResolvedValue({
      status: "succeeded",
      amount: 100,
      currency: "dkk",
    });

    const body = await run();

    expect(body.results).toEqual([{ orderId: "ord_1", action: "flagged_amount_mismatch" }]);
    expect(mocks.sendOrderConfirmation).not.toHaveBeenCalled();
  });
});

describe("reconcile cron — a cancelled intent gives stock back where it was taken (CRON-RESTOCK)", () => {
  const lines: Line[] = [
    { productId: "prod_shirt", variantId: "var_shirt_m", quantity: 2 },
    { productId: "prod_mug", variantId: null, quantity: 1 },
  ];

  it("restocks a variant line on the variant and a plain line on the product", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([order({}, lines)]);
    mocks.stripe.paymentIntents.retrieve.mockResolvedValue({ status: "canceled" });
    // The lines are read inside the cancel transaction (lib/orders/cancel-unpaid.ts).
    mocks.tx.orderItem.findMany.mockResolvedValue(lines);

    const body = await run();

    expect(body.results).toEqual([
      { orderId: "ord_1", action: "reconciled_cancelled_restocked" },
    ]);
    expect(mocks.tx.productVariant.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.productVariant.update).toHaveBeenCalledWith({
      where: { id: "var_shirt_m" },
      data: { stock: { increment: 2 } },
    });
    // The variant line's parent product keeps its stock untouched.
    expect(mocks.tx.product.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.product.update).toHaveBeenCalledWith({
      where: { id: "prod_mug" },
      data: { stock: { increment: 1 } },
    });
    expect(mocks.tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: "ord_1", status: "pending_payment" },
      data: { status: "cancelled" },
    });
  });

  it("gives nothing back when the order left pending_payment in the meantime", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([order({}, lines)]);
    mocks.stripe.paymentIntents.retrieve.mockResolvedValue({ status: "canceled" });
    mocks.tx.order.updateMany.mockResolvedValue({ count: 0 });

    const body = await run();

    expect(body.results).toEqual([{ orderId: "ord_1", action: "already_cancelled" }]);
    expect(mocks.tx.productVariant.update).not.toHaveBeenCalled();
    expect(mocks.tx.product.update).not.toHaveBeenCalled();
  });
});
