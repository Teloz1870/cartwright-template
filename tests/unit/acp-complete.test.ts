import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Hul C (WIRED) — completeAcpSession. Tester orchestreringen med Stripe +
 * ordre-oprettelse MOCKET (kode-klar men inert: ingen ægte Stripe-adgang i
 * test): env-gate, validering, idempotency-replay, SPT-charge-args, refund-on-
 * failure, og det glade succes-flow.
 */

const mocks = vi.hoisted(() => ({
  retrieveSession: vi.fn(),
  getStripeClient: vi.fn(),
  createOrderFromAcpSession: vi.fn(),
  idemFindUnique: vi.fn(),
  idemCreate: vi.fn(),
  paymentIntentsCreate: vi.fn(),
  refundsCreate: vi.fn(),
}));

vi.mock("@/lib/acp", () => {
  class AcpError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status = 400,
    ) {
      super(message);
      this.name = "AcpError";
    }
  }
  return { AcpError, retrieveSession: mocks.retrieveSession };
});

vi.mock("@/lib/stripe", () => ({ getStripeClient: mocks.getStripeClient }));

vi.mock("@/lib/db", () => ({
  prisma: {
    acpIdempotencyKey: {
      findUnique: mocks.idemFindUnique,
      create: mocks.idemCreate,
    },
  },
}));

vi.mock("@/lib/orders/create-acp", () => ({
  createOrderFromAcpSession: mocks.createOrderFromAcpSession,
}));

import { completeAcpSession } from "@/lib/acp/complete";

const VALID_INPUT = { shared_payment_token: "spt_test_123" };

const READY_SESSION = {
  id: "sess_1",
  status: "ready_for_payment",
  currency: "dkk",
  totals: { amount_total: 24900 },
  buyer: { email: "buyer@example.com" },
};

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

function stripeOk() {
  mocks.paymentIntentsCreate.mockResolvedValue({ id: "pi_1", status: "succeeded" });
  mocks.getStripeClient.mockResolvedValue({
    paymentIntents: { create: mocks.paymentIntentsCreate },
    refunds: { create: mocks.refundsCreate },
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.idemFindUnique.mockResolvedValue(null);
  mocks.idemCreate.mockResolvedValue({});
  delete process.env.ACP_PAYMENT_COMPLETION;
});
afterEach(() => {
  delete process.env.ACP_PAYMENT_COMPLETION;
});

describe("completeAcpSession — env-gate", () => {
  it("kaster not_enabled når ACP_PAYMENT_COMPLETION ikke er sat (inert default)", async () => {
    expect(await codeOf(completeAcpSession("sess_1", VALID_INPUT))).toBe(
      "acp_checkout_completion_not_enabled",
    );
    expect(mocks.retrieveSession).not.toHaveBeenCalled();
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });
});

describe("completeAcpSession — validering (flag on)", () => {
  beforeEach(() => {
    process.env.ACP_PAYMENT_COMPLETION = "1";
  });

  it("kaster not_found når sessionen ikke findes", async () => {
    mocks.retrieveSession.mockResolvedValue(null);
    expect(await codeOf(completeAcpSession("ghost", VALID_INPUT))).toBe(
      "acp_session_not_found",
    );
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });

  it("kaster not_ready når status ikke er ready_for_payment", async () => {
    mocks.retrieveSession.mockResolvedValue({
      ...READY_SESSION,
      status: "not_ready_for_payment",
    });
    expect(await codeOf(completeAcpSession("sess_1", VALID_INPUT))).toBe(
      "acp_session_not_ready",
    );
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });

  it("kaster buyer_email_required når email mangler (selv hvis ready)", async () => {
    mocks.retrieveSession.mockResolvedValue({
      ...READY_SESSION,
      buyer: { email: null },
    });
    expect(await codeOf(completeAcpSession("sess_1", VALID_INPUT))).toBe(
      "acp_buyer_email_required",
    );
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
  });

  it("kaster payment_provider_unavailable når Stripe ikke er konfigureret", async () => {
    mocks.retrieveSession.mockResolvedValue(READY_SESSION);
    mocks.getStripeClient.mockResolvedValue(null);
    expect(await codeOf(completeAcpSession("sess_1", VALID_INPUT))).toBe(
      "acp_payment_provider_unavailable",
    );
  });

  it("kaster payment_failed når PaymentIntent ikke succeeder", async () => {
    mocks.retrieveSession.mockResolvedValue(READY_SESSION);
    mocks.paymentIntentsCreate.mockResolvedValue({ id: "pi_x", status: "requires_action" });
    mocks.getStripeClient.mockResolvedValue({
      paymentIntents: { create: mocks.paymentIntentsCreate },
      refunds: { create: mocks.refundsCreate },
    });
    expect(await codeOf(completeAcpSession("sess_1", VALID_INPUT))).toBe(
      "acp_payment_failed",
    );
    expect(mocks.createOrderFromAcpSession).not.toHaveBeenCalled();
  });
});

describe("completeAcpSession — SPT-charge + ordre (flag on)", () => {
  beforeEach(() => {
    process.env.ACP_PAYMENT_COMPLETION = "1";
    stripeOk();
  });

  it("opkræver SPT off-session med beløb fra totals.amount_total + idempotencyKey", async () => {
    mocks.retrieveSession.mockResolvedValue(READY_SESSION);
    mocks.createOrderFromAcpSession.mockResolvedValue("order_1");

    const result = (await completeAcpSession("sess_1", VALID_INPUT)) as {
      order?: { id?: string };
    };

    expect(mocks.paymentIntentsCreate).toHaveBeenCalledTimes(1);
    const [body, opts] = mocks.paymentIntentsCreate.mock.calls[0];
    expect(body).toMatchObject({
      amount: 24900,
      currency: "dkk",
      payment_method: "spt_test_123",
      confirm: true,
      off_session: true,
    });
    expect(opts).toMatchObject({ idempotencyKey: "acp_sess_1" });
    expect(mocks.createOrderFromAcpSession).toHaveBeenCalledWith({
      sessionId: "sess_1",
      paymentIntentId: "pi_1",
      paymentMethod: "acp_spt",
    });
    expect(result.order?.id).toBe("order_1");
  });

  it("refunderer og kaster out_of_stock når ordre-oprettelse fejler efter charge", async () => {
    mocks.retrieveSession.mockResolvedValue(READY_SESSION);
    mocks.createOrderFromAcpSession.mockRejectedValue(new Error("OUT_OF_STOCK:Solbrille"));

    expect(await codeOf(completeAcpSession("sess_1", VALID_INPUT))).toBe(
      "acp_out_of_stock",
    );
    expect(mocks.refundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_1" });
  });

  it("replayer tidligere svar ved gentaget idempotency_key uden at opkræve igen", async () => {
    mocks.idemFindUnique.mockResolvedValue({
      responseJson: JSON.stringify({ id: "sess_1", status: "completed", order: { id: "order_1" } }),
    });

    const result = (await completeAcpSession("sess_1", {
      ...VALID_INPUT,
      idempotency_key: "idem_1",
    })) as { order?: { id?: string } };

    expect(result.order?.id).toBe("order_1");
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled();
    expect(mocks.retrieveSession).not.toHaveBeenCalled();
  });

  it("persisterer idempotency-svaret efter en succesfuld completion", async () => {
    mocks.retrieveSession.mockResolvedValue(READY_SESSION);
    mocks.createOrderFromAcpSession.mockResolvedValue("order_1");

    await completeAcpSession("sess_1", { ...VALID_INPUT, idempotency_key: "idem_2" });

    expect(mocks.idemCreate).toHaveBeenCalledTimes(1);
    const arg = mocks.idemCreate.mock.calls[0][0];
    expect(arg.data).toMatchObject({ key: "idem_2", sessionId: "sess_1" });
  });
});
