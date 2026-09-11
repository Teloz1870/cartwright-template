/**
 * Phase 4: customer.lookup_by_phone test-coverage.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderFindFirst: vi.fn(),
  orderCount: vi.fn(),
  userFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    order: { findFirst: mocks.orderFindFirst, count: mocks.orderCount },
    user: { findFirst: mocks.userFindFirst, findUnique: vi.fn() },
  },
}));

import {
  lookupByPhoneTool,
  _resetLookupCountsForTest,
} from "@/lib/tools/customer";

const baseCtx = { actor: "storefront-chat:sid-phone-test" };

describe("customer.lookup_by_phone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetLookupCountsForTest();
    mocks.orderFindFirst.mockResolvedValue(null);
    mocks.orderCount.mockResolvedValue(0);
    mocks.userFindFirst.mockResolvedValue(null);
  });

  it("normaliserer 8-cifret DK-nummer til +45XXXXXXXX", async () => {
    await lookupByPhoneTool.handler({ phone: "28833690" }, baseCtx as never);
    expect(mocks.orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phoneNumber: "+4528833690" },
      }),
    );
  });

  it("accepterer +45-prefix (med mellemrum)", async () => {
    await lookupByPhoneTool.handler(
      { phone: "+45 28 83 36 90" },
      baseCtx as never,
    );
    expect(mocks.orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phoneNumber: "+4528833690" },
      }),
    );
  });

  it("returnerer hasOrders=true + lastShipping for returnerende kunde", async () => {
    mocks.orderFindFirst.mockResolvedValue({
      email: "kenni@example.dk",
      shippingName: "Kenni Madsen",
      shippingAddress: "Vesterbrogade 12",
      shippingZip: "1620",
      shippingCity: "København V",
    });
    mocks.orderCount.mockResolvedValue(3);
    mocks.userFindFirst.mockResolvedValue({ id: "u1" });

    const result = await lookupByPhoneTool.handler(
      { phone: "28833690" },
      baseCtx as never,
    );

    expect(result).toMatchObject({
      hasOrders: true,
      orderCount: 3,
      isRegisteredUser: true,
      email: "kenni@example.dk",
      lastShipping: {
        name: "Kenni Madsen",
        address: "Vesterbrogade 12",
        zip: "1620",
        city: "København V",
      },
    });
  });

  it("returnerer invalidFormat for non-numeric input", async () => {
    const result = await lookupByPhoneTool.handler(
      { phone: "notaphone1" },
      baseCtx as never,
    );
    expect(result).toMatchObject({ invalidFormat: true });
    expect(mocks.orderFindFirst).not.toHaveBeenCalled();
  });

  it("rate-limit: 6. lookup i samme session afvises", async () => {
    for (let i = 0; i < 5; i++) {
      await lookupByPhoneTool.handler(
        { phone: `2883369${i}` },
        baseCtx as never,
      );
    }
    const result = await lookupByPhoneTool.handler(
      { phone: "29999999" },
      baseCtx as never,
    );
    expect(result).toMatchObject({ rateLimited: true });
  });
});
