import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    product: {
      findFirst: vi.fn(),
    },
    productVariant: {
      findFirst: vi.fn(),
    },
    acpCheckoutSession: {
      create: vi.fn(),
    },
    discountCode: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

import { prisma } from "@/lib/db";
import { createSession, serializeAcpSession } from "@/lib/acp";

const productFindFirstMock = prisma.product.findFirst as unknown as Mock;
const variantFindFirstMock = prisma.productVariant.findFirst as unknown as Mock;
const sessionCreateMock = prisma.acpCheckoutSession.create as unknown as Mock;
const discountFindUniqueMock = prisma.discountCode.findUnique as unknown as Mock;

describe("ACP checkout sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productFindFirstMock.mockResolvedValue(null);
    variantFindFirstMock.mockResolvedValue(null);
    discountFindUniqueMock.mockResolvedValue(null);
  });

  it("creates a session from a product slug with stock check and minor-unit totals", async () => {
    productFindFirstMock.mockResolvedValue({
      id: "prod_1",
      slug: "classic-frame",
      name: "Classic Frame",
      priceDkk: 19900,
      stock: 5,
    });
    sessionCreateMock.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: new Date("2026-05-20T10:00:00Z"),
      updatedAt: new Date("2026-05-20T10:00:00Z"),
      orderId: null,
    }));

    const session = await createSession({
      line_items: [{ id: "classic-frame", quantity: 2 }],
      buyer: { email: " buyer@example.com " },
    });

    expect(productFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "classic-frame", deletedAt: null },
      }),
    );
    expect(session.line_items).toEqual([
      expect.objectContaining({
        id: "classic-frame",
        product_id: "prod_1",
        quantity: 2,
        unit_amount: 19900,
        amount_total: 39800,
      }),
    ]);
    expect(session.totals).toEqual({
      subtotal: 39800,
      total_shipping: 4900,
      total_discount: 0,
      amount_total: 44700,
    });
  });

  it("serializes stored ACP rows into canonical JSON", () => {
    const row = {
      id: "acs_test",
      status: "ready_for_payment",
      currency: "DKK",
      lineItemsJson: JSON.stringify([
        {
          id: "sku-1",
          productId: "prod_1",
          variantId: "var_1",
          slug: "classic-frame",
          sku: "sku-1",
          name: "Classic Frame",
          quantity: 1,
          unitPriceDkk: 29900,
        },
      ]),
      buyerEmail: "buyer@example.com",
      buyerName: "Buyer",
      buyerPhone: null,
      shippingName: "Buyer",
      shippingAddress: "Main Street 1",
      shippingZip: "1000",
      shippingCity: "Copenhagen",
      shippingCountry: "DK",
      fulfillmentOption: "standard",
      discountCode: null,
      subtotalDkk: 29900,
      shippingDkk: 0,
      discountDkk: 0,
      totalDkk: 29900,
      orderId: null,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-05-20T10:00:00Z"),
      updatedAt: new Date("2026-05-20T10:00:00Z"),
    };

    expect(serializeAcpSession(row)).toEqual({
      id: "acs_test",
      status: "ready_for_payment",
      currency: "DKK",
      line_items: [
        {
          id: "sku-1",
          product_id: "prod_1",
          variant_id: "var_1",
          slug: "classic-frame",
          sku: "sku-1",
          name: "Classic Frame",
          quantity: 1,
          unit_amount: 29900,
          amount_total: 29900,
        },
      ],
      fulfillment_address: {
        name: "Buyer",
        address_line1: "Main Street 1",
        postal_code: "1000",
        city: "Copenhagen",
        country: "DK",
      },
      fulfillment_option: "standard",
      buyer: {
        email: "buyer@example.com",
        name: "Buyer",
        phone: null,
      },
      totals: {
        subtotal: 29900,
        total_shipping: 0,
        total_discount: 0,
        amount_total: 29900,
      },
      messages: [],
    });
  });
});
