import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

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
  });

  it("opretter ordre for en kurv med varer", async () => {
    const result = await createOrder(baseInput, { actor: "user:user-1" });

    expect(result).toEqual({
      ok: true,
      orderId: "order-123",
      totalDkk: 44700,
      paymentMode: "mock",
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(orderCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        status: "paid",
        email: "kunde@example.dk",
        subtotalDkk: 39800,
        shippingDkk: 4900,
        discountDkk: 0,
        totalDkk: 44700,
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
        totalDkk: 44700,
      }),
    );
  });

  it("returnerer EMPTY_CART når der ikke findes en kurv", async () => {
    getCartMock.mockResolvedValue(null);

    const result = await createOrder(baseInput);

    expect(result).toEqual({
      ok: false,
      error: "Kurven er tom",
      code: "EMPTY_CART",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returnerer EMPTY_CART når kurven er tom", async () => {
    getCartMock.mockResolvedValue({ id: "cart-empty", items: [] });

    const result = await createOrder(baseInput);

    expect(result).toEqual({
      ok: false,
      error: "Kurven er tom",
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
      error: "Solir Classic er ikke på lager",
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
      totalDkk: 44700,
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
      error: "Ukendt rabatkode",
      code: "INVALID_DISCOUNT",
    });
    expect(prisma.discountCode.findUnique).toHaveBeenCalledWith({
      where: { code: "NEJTAK" },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
