/**
 * Stripe webhook security + idempotency tests.
 *
 * Disse er FAIL-CLOSED: hvis nogen bryder, kan en angriber potentielt
 * fake "payment succeeded" eller dobbelt-decremente stock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock alt før route imports — vitest hoists vi.mock automatisk
const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  stripeClient: {
    webhooks: { constructEvent: vi.fn() },
  } as { webhooks: { constructEvent: ReturnType<typeof vi.fn> } },
  prismaProcessedCreate: vi.fn(),
  prismaOrderFindUnique: vi.fn(),
  prismaOrderUpdate: vi.fn(),
  prismaOrderUpdateMany: vi.fn(),
  prismaAuditLogCreate: vi.fn(),
  sendOrderConfirmation: vi.fn(),
  notifyOwnerOfPaidOrder: vi.fn(),
  emitMarketingEvent: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(async () => mocks.stripeClient),
  getStripeKeys: vi.fn(async () => ({
    secretKey: "sk_test_x",
    publishableKey: "pk_test_x",
    webhookSecret: "whsec_test_x",
  })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    processedWebhookEvent: { create: mocks.prismaProcessedCreate },
    order: {
      findUnique: mocks.prismaOrderFindUnique,
      update: mocks.prismaOrderUpdate,
      updateMany: mocks.prismaOrderUpdateMany,
    },
    auditLog: { create: mocks.prismaAuditLogCreate },
  },
}));

vi.mock("@/lib/mailer", () => ({
  mailer: { sendOrderConfirmation: mocks.sendOrderConfirmation },
}));

vi.mock("@/lib/orders/notify-owner", () => ({
  notifyOwnerOfPaidOrder: mocks.notifyOwnerOfPaidOrder,
}));

vi.mock("@/lib/marketing/automations", () => ({
  emitMarketingEvent: mocks.emitMarketingEvent,
  MARKETING_EVENTS: { orderPlaced: "cartwright.order.placed" },
}));

import { POST } from "@/app/api/webhook/stripe/route";

/** A `payment_intent.succeeded` event whose amount matches `matchingOrder`. */
function succeededEvent(id: string, orderId = "ord_1") {
  return {
    id,
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_x",
        amount: 34800,
        currency: "dkk",
        payment_method_types: ["card"],
        metadata: { orderId },
      },
    },
  };
}

/** An order whose total matches `succeededEvent`, in the given status. */
function matchingOrder(status: string) {
  return {
    id: "ord_1",
    status,
    email: "test@x.dk",
    shippingName: "Test",
    items: [{ productName: "Solir", quantity: 1, unitPriceDkk: 29900 }],
    subtotalDkk: 29900,
    shippingDkk: 4900,
    discountDkk: 0,
    totalDkk: 34800,
    currency: "DKK",
    fxRate: 1,
    confirmationEmailSentAt: null,
  };
}

function makeRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/webhook/stripe", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("Stripe webhook security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: stripe-client returnerer en mock med constructEvent
    mocks.stripeClient = {
      webhooks: { constructEvent: vi.fn() },
    };
  });

  it("[1] afviser request uden stripe-signature header med 400", async () => {
    const res = await POST(makeRequest("{}") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/signature/i);
  });

  it("[2] afviser request med ugyldig signature med 400", async () => {
    mocks.stripeClient.webhooks.constructEvent = vi.fn(() => {
      throw new Error("Invalid signature");
    });
    const res = await POST(
      makeRequest("{}", { "stripe-signature": "bad-sig" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("[3] idempotency: duplicate event.id returnerer 200 med flag", async () => {
    mocks.stripeClient.webhooks.constructEvent = vi.fn(() => ({
      id: "evt_duplicate",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_x", metadata: { orderId: "ord_1" } } },
    }));
    // Simulér Prisma unique-constraint-fejl
    const uniqueErr = Object.assign(new Error("Unique"), { code: "P2002" });
    mocks.prismaProcessedCreate.mockRejectedValue(uniqueErr);

    const res = await POST(
      makeRequest("{}", { "stripe-signature": "valid" }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.idempotent).toBe(true);
    // Vigtig: handler skal IKKE køre when idempotent
    expect(mocks.prismaOrderUpdate).not.toHaveBeenCalled();
  });

  it("[4] payment_intent.succeeded → opdaterer Order til paid", async () => {
    mocks.stripeClient.webhooks.constructEvent = vi.fn(() => ({
      id: "evt_first_time",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_x",
          amount: 34800, // matcher Order.totalDkk
          currency: "dkk",
          payment_method_types: ["card"],
          metadata: { orderId: "ord_1" },
        },
      },
    }));
    mocks.prismaProcessedCreate.mockResolvedValue({});
    mocks.prismaOrderFindUnique.mockResolvedValue({
      id: "ord_1",
      status: "pending_payment",
      email: "test@x.dk",
      shippingName: "Test",
      items: [
        { productName: "Solir", quantity: 1, unitPriceDkk: 29900 },
      ],
      subtotalDkk: 29900,
      shippingDkk: 4900,
      discountDkk: 0,
      totalDkk: 34800,
      currency: "DKK",
      fxRate: 1,
    });

    mocks.prismaOrderUpdateMany.mockResolvedValue({ count: 1 });

    const res = await POST(
      makeRequest("{}", { "stripe-signature": "valid" }) as never,
    );
    expect(res.status).toBe(200);
    expect(mocks.prismaOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_1", status: "pending_payment" },
        data: expect.objectContaining({
          status: "paid",
          paymentMethod: "stripe_card",
        }),
      }),
    );
    expect(mocks.sendOrderConfirmation).toHaveBeenCalled();
    // GAP1: the owner hears about the paid order exactly once, with its total.
    expect(mocks.notifyOwnerOfPaidOrder).toHaveBeenCalledTimes(1);
    expect(mocks.notifyOwnerOfPaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "ord_1", totalDkk: 34800, email: "test@x.dk" }),
    );
  });

  it("[5a] AMOUNT MISMATCH — webhook MÅ IKKE markere order som paid", async () => {
    mocks.stripeClient.webhooks.constructEvent = vi.fn(() => ({
      id: "evt_amount_tamper",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_x",
          amount: 100, // betalt 1 kr (i øre)
          currency: "dkk",
          payment_method_types: ["card"],
          metadata: { orderId: "ord_expensive" },
        },
      },
    }));
    mocks.prismaProcessedCreate.mockResolvedValue({});
    mocks.prismaOrderFindUnique.mockResolvedValue({
      id: "ord_expensive",
      status: "pending_payment",
      email: "victim@x.dk",
      shippingName: "Victim",
      items: [],
      subtotalDkk: 100000,
      shippingDkk: 4900,
      discountDkk: 0,
      totalDkk: 104900, // ordre på 1049 kr — angriber prøver at betale 1 kr
      currency: "DKK",
      fxRate: 1,
    });

    const res = await POST(
      makeRequest("{}", { "stripe-signature": "valid" }) as never,
    );
    expect(res.status).toBe(200);
    // Order skal flagges, IKKE markeres paid
    expect(mocks.prismaOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_expensive" },
        data: { status: "flagged_review" },
      }),
    );
    // Mail må IKKE sendes
    expect(mocks.sendOrderConfirmation).not.toHaveBeenCalled();
    expect(mocks.notifyOwnerOfPaidOrder).not.toHaveBeenCalled();
  });

  it("[4b] the reconcile cron flipped the order first → no second receipt or owner mail", async () => {
    mocks.stripeClient.webhooks.constructEvent = vi.fn(() => ({
      id: "evt_lost_race",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_x",
          amount: 34800,
          currency: "dkk",
          payment_method_types: ["card"],
          metadata: { orderId: "ord_1" },
        },
      },
    }));
    mocks.prismaProcessedCreate.mockResolvedValue({});
    mocks.prismaOrderFindUnique.mockResolvedValue({
      id: "ord_1",
      status: "pending_payment",
      email: "test@x.dk",
      shippingName: "Test",
      items: [{ productName: "Solir", quantity: 1, unitPriceDkk: 29900 }],
      subtotalDkk: 29900,
      shippingDkk: 4900,
      discountDkk: 0,
      totalDkk: 34800,
      currency: "DKK",
      fxRate: 1,
    });
    mocks.prismaOrderUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(makeRequest("{}", { "stripe-signature": "valid" }) as never);
    expect(res.status).toBe(200);
    expect(mocks.sendOrderConfirmation).not.toHaveBeenCalled();
    expect(mocks.notifyOwnerOfPaidOrder).not.toHaveBeenCalled();
  });

  it("[5] succeeded for allerede-paid ordre er no-op (race-safe)", async () => {
    mocks.stripeClient.webhooks.constructEvent = vi.fn(() => ({
      id: "evt_race",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_x", metadata: { orderId: "ord_1" } } },
    }));
    mocks.prismaProcessedCreate.mockResolvedValue({});
    mocks.prismaOrderFindUnique.mockResolvedValue({
      id: "ord_1",
      status: "paid", // allerede opdateret
    });

    const res = await POST(
      makeRequest("{}", { "stripe-signature": "valid" }) as never,
    );
    expect(res.status).toBe(200);
    expect(mocks.prismaOrderUpdate).not.toHaveBeenCalled();
    expect(mocks.prismaOrderUpdateMany).not.toHaveBeenCalled();
    expect(mocks.notifyOwnerOfPaidOrder).not.toHaveBeenCalled();
  });
});

/**
 * PAY-guard: `payment_intent.succeeded` may only mark an order paid from a
 * status that is still awaiting payment (the order state machine's
 * `… → paid` moves: pending_payment, pending, flagged_review). A delayed
 * event for an order an admin already cancelled or shipped must leave the
 * order alone — no status regression, no receipt, no owner mail, no
 * marketing event — and log one line for manual review.
 */
describe("Stripe webhook — paid only from a status awaiting payment", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stripeClient = { webhooks: { constructEvent: vi.fn() } };
    mocks.prismaProcessedCreate.mockResolvedValue({});
    mocks.prismaOrderUpdateMany.mockResolvedValue({ count: 1 });
    mocks.prismaAuditLogCreate.mockResolvedValue({});
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  /** The durable trace the guard leaves: one audit row, with these exact args. */
  function expectAuditRow(status: string) {
    expect(mocks.prismaAuditLogCreate).toHaveBeenCalledTimes(1);
    expect(mocks.prismaAuditLogCreate).toHaveBeenCalledWith({
      data: {
        actor: "stripe-webhook:system",
        tool: "orders.payment_not_applied",
        argsJson: JSON.stringify({
          orderId: "ord_1",
          status,
          intentId: "pi_x",
          amount: 34800,
          currency: "dkk",
        }),
        afterJson: JSON.stringify({ note: "left unchanged — review manually" }),
        ok: true,
        requestId: "pi_x",
      },
    });
  }

  for (const status of ["cancelled", "shipped", "processing", "completed"]) {
    it(`[6] a ${status} order stays ${status}: nothing written, no mail, no event, one log line, one audit row`, async () => {
      mocks.stripeClient.webhooks.constructEvent = vi.fn(() =>
        succeededEvent(`evt_late_${status}`),
      );
      mocks.prismaOrderFindUnique.mockResolvedValue(matchingOrder(status));

      const res = await POST(
        makeRequest("{}", { "stripe-signature": "valid" }) as never,
      );
      expect(res.status).toBe(200);

      expect(mocks.prismaOrderUpdateMany).not.toHaveBeenCalled();
      expect(mocks.prismaOrderUpdate).not.toHaveBeenCalled();
      expect(mocks.sendOrderConfirmation).not.toHaveBeenCalled();
      expect(mocks.notifyOwnerOfPaidOrder).not.toHaveBeenCalled();
      expect(mocks.emitMarketingEvent).not.toHaveBeenCalled();

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        `[stripe-webhook] payment_intent.succeeded for order ord_1 in status ${status} ` +
          "(intent pi_x, amount 34800 dkk) — not awaiting payment; left unchanged, review manually",
      );
      expectAuditRow(status);
    });
  }

  it("[7] a status the engine does not know is not awaiting payment either", async () => {
    mocks.stripeClient.webhooks.constructEvent = vi.fn(() =>
      succeededEvent("evt_unknown_status"),
    );
    mocks.prismaOrderFindUnique.mockResolvedValue(matchingOrder("on_hold"));

    const res = await POST(
      makeRequest("{}", { "stripe-signature": "valid" }) as never,
    );
    expect(res.status).toBe(200);
    expect(mocks.prismaOrderUpdateMany).not.toHaveBeenCalled();
    expect(mocks.prismaOrderUpdate).not.toHaveBeenCalled();
    expect(mocks.sendOrderConfirmation).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expectAuditRow("on_hold");
  });

  it("[6b] the guard runs BEFORE the amount check: a cancelled order with a mismatched intent is neither flagged nor paid", async () => {
    // Pins the ordering invariant: a tampered or mismatched intent for an order
    // that is not awaiting payment must not reach the flagged_review write
    // either — the guard is the first decision after the paid early-return.
    const event = succeededEvent("evt_late_cancelled_mismatch");
    event.data.object.amount = 100;
    mocks.stripeClient.webhooks.constructEvent = vi.fn(() => event);
    mocks.prismaOrderFindUnique.mockResolvedValue(matchingOrder("cancelled"));

    const res = await POST(
      makeRequest("{}", { "stripe-signature": "valid" }) as never,
    );
    expect(res.status).toBe(200);

    expect(mocks.prismaOrderUpdate).not.toHaveBeenCalled(); // no flagged_review write
    expect(mocks.prismaOrderUpdateMany).not.toHaveBeenCalled(); // no paid flip
    expect(mocks.sendOrderConfirmation).not.toHaveBeenCalled();
    expect(mocks.notifyOwnerOfPaidOrder).not.toHaveBeenCalled();
    expect(mocks.prismaAuditLogCreate).toHaveBeenCalledTimes(1);
    const row = mocks.prismaAuditLogCreate.mock.calls[0][0].data;
    expect(row.tool).toBe("orders.payment_not_applied");
    expect(JSON.parse(row.argsJson)).toMatchObject({ orderId: "ord_1", status: "cancelled", amount: 100 });
  });

  it("[7b] the audit row is fail-soft: a rejected write still answers 200 and changes nothing", async () => {
    mocks.stripeClient.webhooks.constructEvent = vi.fn(() =>
      succeededEvent("evt_late_audit_down"),
    );
    mocks.prismaOrderFindUnique.mockResolvedValue(matchingOrder("cancelled"));
    mocks.prismaAuditLogCreate.mockRejectedValue(new Error("no such table: AuditLog"));

    const res = await POST(
      makeRequest("{}", { "stripe-signature": "valid" }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(mocks.prismaAuditLogCreate).toHaveBeenCalledTimes(1);
    expect(mocks.prismaOrderUpdateMany).not.toHaveBeenCalled();
    expect(mocks.prismaOrderUpdate).not.toHaveBeenCalled();
    expect(mocks.sendOrderConfirmation).not.toHaveBeenCalled();
    expect(mocks.notifyOwnerOfPaidOrder).not.toHaveBeenCalled();
    // Only the guard's own line — the swallowed audit error logs nothing more.
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("[8] a flagged_review order with a matching amount is marked paid, with receipt and owner mail", async () => {
    mocks.stripeClient.webhooks.constructEvent = vi.fn(() =>
      succeededEvent("evt_flagged_ok"),
    );
    mocks.prismaOrderFindUnique.mockResolvedValue(matchingOrder("flagged_review"));

    const res = await POST(
      makeRequest("{}", { "stripe-signature": "valid" }) as never,
    );
    expect(res.status).toBe(200);
    expect(mocks.prismaOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_1", status: "flagged_review" },
        data: expect.objectContaining({ status: "paid" }),
      }),
    );
    expect(mocks.sendOrderConfirmation).toHaveBeenCalledTimes(1);
    expect(mocks.notifyOwnerOfPaidOrder).toHaveBeenCalledTimes(1);
    expect(mocks.emitMarketingEvent).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("[9] a flagged_review order with a WRONG amount is still refused, not marked paid", async () => {
    mocks.stripeClient.webhooks.constructEvent = vi.fn(() => ({
      ...succeededEvent("evt_flagged_tamper"),
      data: { object: { ...succeededEvent("x").data.object, amount: 100 } },
    }));
    mocks.prismaOrderFindUnique.mockResolvedValue(matchingOrder("flagged_review"));

    const res = await POST(
      makeRequest("{}", { "stripe-signature": "valid" }) as never,
    );
    expect(res.status).toBe(200);
    expect(mocks.prismaOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "flagged_review" } }),
    );
    expect(mocks.prismaOrderUpdateMany).not.toHaveBeenCalled();
    expect(mocks.sendOrderConfirmation).not.toHaveBeenCalled();
    expect(mocks.notifyOwnerOfPaidOrder).not.toHaveBeenCalled();
  });

  it("[10] pending_payment and pending behave as before: marked paid, mails and event sent", async () => {
    for (const status of ["pending_payment", "pending"]) {
      vi.clearAllMocks();
      mocks.prismaProcessedCreate.mockResolvedValue({});
      mocks.prismaOrderUpdateMany.mockResolvedValue({ count: 1 });
      mocks.stripeClient.webhooks.constructEvent = vi.fn(() =>
        succeededEvent(`evt_${status}`),
      );
      mocks.prismaOrderFindUnique.mockResolvedValue(matchingOrder(status));

      const res = await POST(
        makeRequest("{}", { "stripe-signature": "valid" }) as never,
      );
      expect(res.status).toBe(200);
      expect(mocks.prismaOrderUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ord_1", status },
          data: expect.objectContaining({ status: "paid", paymentMethod: "stripe_card" }),
        }),
      );
      expect(mocks.sendOrderConfirmation).toHaveBeenCalledTimes(1);
      expect(mocks.notifyOwnerOfPaidOrder).toHaveBeenCalledTimes(1);
      expect(mocks.emitMarketingEvent).toHaveBeenCalledTimes(1);
      expect(consoleError).not.toHaveBeenCalled();
    }
  });
});
