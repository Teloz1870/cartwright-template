import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getCartSessionId: vi.fn(),
  createOrder: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/cart", () => ({ getCartSessionId: mocks.getCartSessionId }));
vi.mock("@/lib/orders/create", () => ({ createOrder: mocks.createOrder }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { placeOrder } from "@/app/checkout/actions";

function makeFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const defaults = {
    shippingName: "Test Testesen",
    email: "test@example.com",
    shippingAddress: "Testvej 1",
    shippingZip: "1000",
    shippingCity: "København",
    discountCode: "",
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    fd.append(k, v);
  }
  return fd;
}

describe("placeOrder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.getCartSessionId.mockResolvedValue("sess_abc");
  });

  it("returnerer mock-mode når createOrder ikke leverer Stripe-felter", async () => {
    mocks.createOrder.mockResolvedValue({
      ok: true,
      orderId: "ord_1",
      totalDkk: 999,
      paymentMode: "mock",
    });
    const res = await placeOrder(makeFormData());
    expect(res).toEqual({ ok: true, mode: "mock", orderId: "ord_1" });
  });

  it("returnerer stripe-mode når createOrder leverer clientSecret", async () => {
    mocks.createOrder.mockResolvedValue({
      ok: true,
      orderId: "ord_2",
      totalDkk: 999,
      paymentMode: "stripe",
      paymentIntentClientSecret: "pi_123_secret_xyz",
      publishableKey: "pk_test_abc",
    });
    const res = await placeOrder(makeFormData());
    expect(res).toEqual({
      ok: true,
      mode: "stripe",
      orderId: "ord_2",
      clientSecret: "pi_123_secret_xyz",
      publishableKey: "pk_test_abc",
      totalDkk: 999,
    });
  });

  it("returnerer ok:false ved validation-fejl", async () => {
    const res = await placeOrder(makeFormData({ email: "ikke-en-email" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeTypeOf("string");
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("returnerer ok:false når createOrder fejler", async () => {
    mocks.createOrder.mockResolvedValue({
      ok: false,
      error: "Lager tomt",
      code: "OUT_OF_STOCK",
    });
    const res = await placeOrder(makeFormData());
    expect(res).toEqual({ ok: false, error: "Lager tomt" });
  });
});
