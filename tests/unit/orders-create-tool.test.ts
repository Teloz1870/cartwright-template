import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { ToolCtx } from "@/lib/tools/types";

vi.mock("@/lib/orders/create", () => ({
  createOrder: vi.fn(),
}));

import { createOrder } from "@/lib/orders/create";
import { createOrderTool } from "@/lib/tools/customer";

const baseCtx: ToolCtx = {
  actor: "storefront-chat:sid-test",
  requestId: "req-1",
};

const baseInput = {
  email: "kenni@example.dk",
  shippingName: "Kenni Madsen",
  shippingAddress: "Vesterbrogade 12",
  shippingZip: "1620",
  shippingCity: "Kobenhavn V",
  rememberAddress: false,
};

const createOrderMock = createOrder as unknown as Mock;

describe("orders.create customer-tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returnerer orderId og totalDkk ved success", async () => {
    createOrderMock.mockResolvedValue({
      ok: true,
      orderId: "order_abc123",
      totalDkk: 1248,
    });

    const result = await createOrderTool.handler(baseInput, baseCtx);

    // Handler stripper rememberAddress før den kalder createOrder
    // (createOrder service kender ikke det felt)
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { rememberAddress: _rm, ...orderInput } = baseInput;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    expect(createOrder).toHaveBeenCalledWith(orderInput, {
      actor: "storefront-chat:sid-test",
    });
    expect(result).toEqual({
      ok: true,
      orderId: "order_abc123",
      totalDkk: 1248,
      rememberAddress: false,
      shippingSnapshot: null,
    });
  });

  it("returnerer OUT_OF_STOCK fejl fra createOrder", async () => {
    createOrderMock.mockResolvedValue({
      ok: false,
      error: "Solir Classic er ikke på lager",
      code: "OUT_OF_STOCK",
    });

    const result = await createOrderTool.handler(baseInput, baseCtx);

    expect(result).toEqual({
      ok: false,
      error: "Solir Classic er ikke på lager",
      code: "OUT_OF_STOCK",
    });
  });

  it("returnerer EMPTY_CART fejl fra createOrder", async () => {
    createOrderMock.mockResolvedValue({
      ok: false,
      error: "Kurven er tom",
      code: "EMPTY_CART",
    });

    const result = await createOrderTool.handler(baseInput, baseCtx);

    expect(result).toEqual({
      ok: false,
      error: "Kurven er tom",
      code: "EMPTY_CART",
    });
  });
});
