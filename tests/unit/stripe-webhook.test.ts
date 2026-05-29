/**
 * Stripe webhook security + idempotency tests.
 *
 * Disse er FAIL-CLOSED: hvis nogen bryder, kan en angriber potentielt
 * fake "payment succeeded" eller dobbelt-decremente stock.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock alt før route imports — vitest hoists vi.mock automatisk
const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  stripeClient: {
    webhooks: { constructEvent: vi.fn() },
  } as { webhooks: { constructEvent: ReturnType<typeof vi.fn> } },
  prismaProcessedCreate: vi.fn(),
  prismaOrderFindUnique: vi.fn(),
  prismaOrderUpdate: vi.fn(),
  sendOrderConfirmation: vi.fn(),
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
    },
  },
}));

vi.mock("@/lib/mailer", () => ({
  mailer: { sendOrderConfirmation: mocks.sendOrderConfirmation },
}));

import { POST } from "@/app/api/webhook/stripe/route";

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
    });

    const res = await POST(
      makeRequest("{}", { "stripe-signature": "valid" }) as never,
    );
    expect(res.status).toBe(200);
    expect(mocks.prismaOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord_1" },
        data: expect.objectContaining({
          status: "paid",
          paymentMethod: "stripe_card",
        }),
      }),
    );
    expect(mocks.sendOrderConfirmation).toHaveBeenCalled();
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
  });
});
