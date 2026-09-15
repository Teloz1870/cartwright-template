import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { brand } from "@/brand.config";

const mocks = vi.hoisted(() => {
  const tx = {
    order: {
      create: vi.fn(),
    },
    product: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    discountCode: {
      update: vi.fn(),
    },
    cartItem: {
      deleteMany: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
  };

  return {
    tx,
    prisma: {
      discountCode: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      order: {
        create: vi.fn(),
        update: vi.fn(),
      },
      cartItem: {
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
      ),
    },
    getCart: vi.fn(),
    sendOrderConfirmation: vi.fn(),
    getCheckoutCurrency: vi.fn(),
    isStripeReady: vi.fn(),
    createPaymentIntent: vi.fn(),
    getStripeKeys: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/cart", () => ({
  getCart: mocks.getCart,
}));

vi.mock("@/lib/mailer", () => ({
  mailer: {
    sendOrderConfirmation: mocks.sendOrderConfirmation,
  },
}));

vi.mock("@/lib/currency-server", () => ({
  getCheckoutCurrency: mocks.getCheckoutCurrency,
}));

vi.mock("@/lib/stripe", () => ({
  isStripeReady: mocks.isStripeReady,
  createPaymentIntent: mocks.createPaymentIntent,
  getStripeKeys: mocks.getStripeKeys,
}));

import { createOrder } from "@/lib/orders/create";
import { getCart } from "@/lib/cart";
import { mailer } from "@/lib/mailer";
import { prisma } from "@/lib/db";

const baseInput = {
  email: "kunde@example.dk",
  shippingName: "Kunde Jensen",
  shippingAddress: "Testvej 12",
  shippingZip: "1234",
  shippingCity: "Testby",
};

const baseCurrency = brand.policies.currency.toUpperCase();
const presentmentCurrency =
  Object.keys(brand.policies.supportedCurrencies).find(
    (currency) => currency !== baseCurrency,
  ) ?? baseCurrency;
const presentmentRate =
  (brand.policies.supportedCurrencies as Record<string, { rate: number }>)[
    presentmentCurrency
  ]?.rate ?? 1;
const expectedSubtotal = 39800;
const expectedShipping = brand.policies.shippingDefaultDkk;
const expectedTotal = expectedSubtotal + expectedShipping;

const baseCart = {
  id: "cart-1",
  items: [
    {
      id: "item-1",
      quantity: 2,
      product: {
        id: "prod-1",
        name: "Solir Classic",
        priceDkk: 19900,
        stock: 5,
      },
    },
  ],
};

const getCartMock = getCart as unknown as Mock;
const sendOrderConfirmationMock =
  mailer.sendOrderConfirmation as unknown as Mock;
const transactionMock = prisma.$transaction as unknown as Mock;
const orderCreateMock = mocks.tx.order.create as unknown as Mock;
const productUpdateMock = mocks.tx.product.update as unknown as Mock;
const productUpdateManyMock = mocks.tx.product.updateMany as unknown as Mock;
const discountFindUniqueMock = prisma.discountCode.findUnique as unknown as Mock;
const discountUpdateMock = mocks.tx.discountCode.update as unknown as Mock;
const cartItemDeleteManyMock = mocks.tx.cartItem.deleteMany as unknown as Mock;

describe("createOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCartMock.mockResolvedValue(baseCart);
    orderCreateMock.mockResolvedValue({ id: "order-123" });
    productUpdateMock.mockResolvedValue({});
    productUpdateManyMock.mockResolvedValue({ count: 1 });
    discountFindUniqueMock.mockResolvedValue(null);
    discountUpdateMock.mockResolvedValue({});
    cartItemDeleteManyMock.mockResolvedValue({ count: 1 });
    sendOrderConfirmationMock.mockResolvedValue(undefined);
    // Defaults: base currency + mock-payment mode (matches default shops).
    mocks.getCheckoutCurrency.mockResolvedValue(baseCurrency);
    mocks.isStripeReady.mockResolvedValue(false);
    mocks.prisma.order.update.mockResolvedValue({});
  });

  it("opretter ordre for en kurv med varer", async () => {
    const result = await createOrder(baseInput, { actor: "user:user-1" });

    expect(result).toEqual({
      ok: true,
      orderId: "order-123",
      totalDkk: expectedTotal,
      paymentMode: "mock",
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(orderCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        status: "paid",
        email: "kunde@example.dk",
        subtotalDkk: expectedSubtotal,
        shippingDkk: expectedShipping,
        discountDkk: 0,
        totalDkk: expectedTotal,
        items: {
          create: [
            {
              productId: "prod-1",
              productName: "Solir Classic",
              unitPriceDkk: 19900,
              quantity: 2,
              // Task B: variant-snapshot-felter (null/undefined for produkter uden varianter)
              variantId: undefined,
              variantSku: null,
              variantAttributes: undefined,
            },
          ],
        },
      }),
    });
    // Phase 4: atomic decrement via updateMany med conditional WHERE
    expect(productUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "prod-1", stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(cartItemDeleteManyMock).toHaveBeenCalledWith({
      where: { cartId: "cart-1" },
    });
    expect(sendOrderConfirmationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-123",
        email: "kunde@example.dk",
        totalDkk: expectedTotal,
      }),
    );
  });

  it("snapshotter base-currency + fxRate 1 på en default (mock-mode) ordre", async () => {
    await createOrder(baseInput, { actor: "user:user-1" });

    expect(orderCreateMock).toHaveBeenCalledWith({
        data: expect.objectContaining({ currency: baseCurrency, fxRate: 1 }),
    });
  });

  it("opkræver + snapshotter den valgte presentment-currency i Stripe-mode", async () => {
    mocks.getCheckoutCurrency.mockResolvedValue(presentmentCurrency);
    mocks.isStripeReady.mockResolvedValue(true);
    mocks.createPaymentIntent.mockResolvedValue({
      clientSecret: "cs_test_123",
      paymentIntentId: "pi_123",
    });
    mocks.getStripeKeys.mockResolvedValue({
      secretKey: "sk",
      publishableKey: "pk_test",
      webhookSecret: "wh",
    });

    const result = await createOrder(baseInput, { actor: "user:user-1" });

    // Ordren snapshotter den konfigurerede presentment-currency + dens rate.
    // Base-currency-hovedbogen (totalDkk) er uændret.
    expect(orderCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        currency: presentmentCurrency,
        fxRate: presentmentRate,
        totalDkk: expectedTotal,
      }),
    });
    // Stripe opkræves det konverterede beløb i target minor-units.
    expect(mocks.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: Math.round(expectedTotal * presentmentRate),
        currency: presentmentCurrency,
        email: "kunde@example.dk",
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      paymentMode: "stripe",
      paymentIntentClientSecret: "cs_test_123",
    });
  });

  it("returnerer EMPTY_CART når der ikke findes en kurv", async () => {
    getCartMock.mockResolvedValue(null);

    const result = await createOrder(baseInput);

    expect(result).toEqual({
      ok: false,
      error: "The cart is empty",
      code: "EMPTY_CART",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returnerer EMPTY_CART når kurven er tom", async () => {
    getCartMock.mockResolvedValue({ id: "cart-empty", items: [] });

    const result = await createOrder(baseInput);

    expect(result).toEqual({
      ok: false,
      error: "The cart is empty",
      code: "EMPTY_CART",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returnerer OUT_OF_STOCK når ønsket antal overstiger lager", async () => {
    getCartMock.mockResolvedValue({
      ...baseCart,
      items: [
        {
          ...baseCart.items[0],
          quantity: 3,
          product: { ...baseCart.items[0].product, stock: 1 },
        },
      ],
    });

    const result = await createOrder(baseInput);

    expect(result).toEqual({
      ok: false,
      error: "Solir Classic is out of stock",
      code: "OUT_OF_STOCK",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("swallower mail-fejl efter ordreoprettelse", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sendOrderConfirmationMock.mockRejectedValue(new Error("SMTP nede"));

    const result = await createOrder(baseInput);

    expect(result).toEqual({
      ok: true,
      orderId: "order-123",
      totalDkk: expectedTotal,
      paymentMode: "mock",
    });
    expect(orderCreateMock).toHaveBeenCalledTimes(1);
    expect(sendOrderConfirmationMock).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });

  it("returnerer INVALID_DISCOUNT for ukendt rabatkode", async () => {
    discountFindUniqueMock.mockResolvedValue(null);

    const result = await createOrder({ ...baseInput, discountCode: "nejtak" });

    expect(result).toEqual({
      ok: false,
      error: "Unknown discount code",
      code: "INVALID_DISCOUNT",
    });
    expect(prisma.discountCode.findUnique).toHaveBeenCalledWith({
      where: { code: "NEJTAK" },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
