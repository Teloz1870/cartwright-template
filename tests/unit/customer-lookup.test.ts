import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  _resetLookupCountsForTest,
  lookupByEmailTool,
} from "@/lib/tools/customer";
import type { Mock } from "vitest";
import type { ToolCtx } from "@/lib/tools/types";

vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";

const baseCtx: ToolCtx = {
  actor: "storefront-chat:test-sid-123",
  requestId: "req-1",
};

const orderFindFirstMock = prisma.order.findFirst as unknown as Mock;
const orderCountMock = prisma.order.count as unknown as Mock;
const userFindUniqueMock = prisma.user.findUnique as unknown as Mock;

describe("customer.lookup_by_email", () => {
  beforeEach(() => {
    _resetLookupCountsForTest();
    vi.clearAllMocks();
  });

  it("returnerer hasOrders=false for ny email", async () => {
    orderFindFirstMock.mockResolvedValue(null);
    orderCountMock.mockResolvedValue(0);
    userFindUniqueMock.mockResolvedValue(null);

    const result = await lookupByEmailTool.handler(
      { email: "nyt@example.dk" },
      baseCtx,
    );
    expect(result).toEqual({
      hasOrders: false,
      orderCount: 0,
      isRegisteredUser: false,
      lastShipping: null,
    });
  });

  it("returnerer lastShipping for returnerende kunde", async () => {
    orderFindFirstMock.mockResolvedValue({
      shippingName: "Kenni Madsen",
      shippingAddress: "Vesterbrogade 12",
      shippingZip: "1620",
      shippingCity: "København V",
    });
    orderCountMock.mockResolvedValue(3);
    userFindUniqueMock.mockResolvedValue({ id: "user-1" });

    const result = await lookupByEmailTool.handler(
      { email: "kenni@example.dk" },
      baseCtx,
    );
    expect(result).toMatchObject({
      hasOrders: true,
      orderCount: 3,
      isRegisteredUser: true,
      lastShipping: {
        name: "Kenni Madsen",
        address: "Vesterbrogade 12",
        zip: "1620",
        city: "København V",
      },
    });
  });

  it("blokerer 6. lookup i samme session (rate-limit)", async () => {
    orderFindFirstMock.mockResolvedValue(null);
    orderCountMock.mockResolvedValue(0);
    userFindUniqueMock.mockResolvedValue(null);

    for (let i = 0; i < 5; i++) {
      const r = await lookupByEmailTool.handler(
        { email: `t${i}@x.dk` },
        baseCtx,
      );
      expect((r as Record<string, unknown>).rateLimited).toBeUndefined();
    }
    const blocked = await lookupByEmailTool.handler(
      { email: "t6@x.dk" },
      baseCtx,
    );
    expect((blocked as Record<string, unknown>).rateLimited).toBe(true);
    expect((blocked as Record<string, unknown>).error).toMatch(/for mange/i);
  });

  it("rate-limit er per session — andre sids tæller separat", async () => {
    orderFindFirstMock.mockResolvedValue(null);
    orderCountMock.mockResolvedValue(0);
    userFindUniqueMock.mockResolvedValue(null);

    const sid1Ctx: ToolCtx = { actor: "storefront-chat:sid1", requestId: "r1" };
    const sid2Ctx: ToolCtx = { actor: "storefront-chat:sid2", requestId: "r2" };

    for (let i = 0; i < 5; i++) {
      await lookupByEmailTool.handler(
        { email: `t${i}@x.dk` },
        sid1Ctx,
      );
    }
    const r = await lookupByEmailTool.handler(
      { email: "t@x.dk" },
      sid2Ctx,
    );
    expect((r as Record<string, unknown>).rateLimited).toBeUndefined();
  });

  it("normaliserer email (lowercase + trim)", async () => {
    orderFindFirstMock.mockResolvedValue(null);
    orderCountMock.mockResolvedValue(0);
    userFindUniqueMock.mockResolvedValue(null);

    await lookupByEmailTool.handler(
      { email: "  KENNI@Example.DK  " },
      baseCtx,
    );
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "kenni@example.dk" } }),
    );
  });
});
