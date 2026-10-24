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

import { placeOrder } from "@/app/[locale]/checkout/actions";
import { revalidatePath } from "next/cache";

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
    // placeOrder now passes createOrder's language-neutral `code` through so
    // the client can render a localized message; `error` stays English.
    expect(res).toEqual({ ok: false, error: "Lager tomt", code: "OUT_OF_STOCK" });
    // Nothing changed in the cart, so nothing is revalidated.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes the names of withdrawn lines through, so the form can say which (CART-DELETED-PRODUCT)", async () => {
    mocks.createOrder.mockResolvedValue({
      ok: false,
      error: "No longer available, so removed from your cart: Withdrawn Mug. Review your order and place it again.",
      code: "PRODUCT_UNAVAILABLE",
      unavailableItems: ["Withdrawn Mug"],
      cartEmpty: true,
    });
    const res = await placeOrder(makeFormData());
    expect(res).toMatchObject({
      ok: false,
      code: "PRODUCT_UNAVAILABLE",
      unavailableItems: ["Withdrawn Mug"],
      // R1: the form needs it to keep the explanation when nothing is left.
      cartEmpty: true,
    });
  });

  it("revalidates what the cart actions revalidate once createOrder has emptied lines (CART-DELETED-PRODUCT R1)", async () => {
    mocks.createOrder.mockResolvedValue({
      ok: false,
      error: "No longer available, so removed from your cart: Withdrawn Mug. Review your order and place it again.",
      code: "PRODUCT_UNAVAILABLE",
      unavailableItems: ["Withdrawn Mug"],
      cartEmpty: false,
    });
    await placeOrder(makeFormData());
    // The same pair addToCartAction/removeCartItemAction call after a change.
    expect(revalidatePath).toHaveBeenCalledWith("/cart");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
