/**
 * Phase 4 race-test: atomic stock-decrement må forhindre over-sell.
 *
 * Simulerer 3 samtidige createOrder-calls hvor product.stock=1 og hver
 * ordre prøver at købe 1 stk. Kun ÉN må succeed, de 2 andre skal få
 * OUT_OF_STOCK fordi conditional WHERE stock >= 1 fejler efter første
 * decrement har sat stock til 0.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

let stockCounter = 1;

const mocks = vi.hoisted(() => ({
  tx: {
    order: { create: vi.fn() },
    product: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    discountCode: { update: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
    user: { update: vi.fn() },
  },
  prisma: {
    discountCode: { findUnique: vi.fn() },
    product: { findUnique: vi.fn(), update: vi.fn() },
    order: { create: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
  getCart: vi.fn(),
  sendOrderConfirmation: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/cart", () => ({ getCart: mocks.getCart }));
vi.mock("@/lib/mailer", () => ({
  mailer: { sendOrderConfirmation: mocks.sendOrderConfirmation },
}));
vi.mock("@/lib/stripe", () => ({
  isStripeReady: vi.fn(async () => false),
  createPaymentIntent: vi.fn(),
  getStripeKeys: vi.fn(async () => null),
}));

import { createOrder } from "@/lib/orders/create";

const baseInput = {
  email: "kunde@example.dk",
  shippingName: "Test",
  shippingAddress: "Vej 1",
  shippingZip: "1234",
  shippingCity: "By",
};

const cartWithLastItem = {
  id: "cart-1",
  items: [
    {
      id: "item-1",
      quantity: 1,
      product: { id: "prod-1", name: "Solir Last", priceDkk: 19900, stock: 1 },
    },
  ],
};

describe("createOrder race protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stockCounter = 1;
    mocks.getCart.mockResolvedValue(cartWithLastItem);
    mocks.tx.order.create.mockImplementation(async () => ({
      id: `order-${Math.random()}`,
    }));
    // Conditional decrement: kun lykkes hvis stockCounter >= 1
    mocks.tx.product.updateMany.mockImplementation(async () => {
      if (stockCounter >= 1) {
        stockCounter--;
        return { count: 1 };
      }
      return { count: 0 };
    });
    mocks.tx.cartItem.deleteMany.mockResolvedValue({ count: 1 });
    mocks.tx.discountCode.update.mockResolvedValue({});
    mocks.tx.user.update.mockResolvedValue({});
    mocks.sendOrderConfirmation.mockResolvedValue(undefined);
    // $transaction kører callback med tx-mock
    mocks.prisma.$transaction.mockImplementation(async (fn) => {
      if (typeof fn === "function") return fn(mocks.tx);
      return fn;
    });
    // Order.update for confirmationEmailSentAt — no-op
    mocks.prisma.order.create.mockResolvedValue({});
    Object.assign(mocks.prisma.order, { update: vi.fn().mockResolvedValue({}) });
  });

  it("3 samtidige createOrder på sidste vare — kun 1 succeed, 2 får OUT_OF_STOCK", async () => {
    const results = await Promise.all([
      createOrder(baseInput),
      createOrder(baseInput),
      createOrder(baseInput),
    ]);

    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(2);
    failures.forEach((f) => {
      if (!f.ok) expect(f.code).toBe("OUT_OF_STOCK");
    });
  });
});
