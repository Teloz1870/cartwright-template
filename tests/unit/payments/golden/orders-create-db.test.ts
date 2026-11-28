import {
  BASE_CURRENCY,
  BUYER,
  PLAIN,
  PUBLISHABLE_KEY,
  VARIANT,
  fillCart,
  network,
  openTheShop,
  outcome,
  record,
  sqlite,
  stripeNotConfigured,
  world,
} from "./shop";

import { beforeEach, describe, expect, it } from "vitest";

import { createOrderTool } from "@/lib/tools/customer";
import { invokeTool } from "@/lib/tools/registry";

/**
 * PAY-F1-0 (./shop.ts): `orders.create` as an agent calls it, through the dispatcher
 * every surface goes through. What it says it is: ./tools-list-db.test.ts.
 */

openTheShop();

const AGENT = { actor: "storefront-chat:s1" } as const;
const SCOPES = ["orders:write"] as const;

const INPUT = { ...BUYER, rememberAddress: false };

beforeEach(() => {
  network("paymentIntents.create").mockResolvedValue({ id: "pi_new", client_secret: "pi_new_secret" });
});

const answer = (result: unknown) => (result as { ok: boolean; result: { orderId?: string } }).result;

/** The order that is on the row, not the one the answer says. */
const writtenOrder = async () => (await world.prisma.order.findFirstOrThrow({ where: { email: BUYER.email } })).id;

describe.skipIf(!sqlite)("orders.create, called", () => {
  it("with Stripe ready: the secret and the key for the Payment Element, and no address kept", async () => {
    await fillCart([PLAIN]);

    const seen = await record(() => invokeTool("orders.create", INPUT, AGENT, SCOPES));

    const result = answer(seen.result);
    expect(seen.result).toEqual({
      ok: true,
      result: {
        ok: true,
        orderId: await writtenOrder(),
        totalDkk: 30700,
        paymentMode: "stripe",
        rememberAddress: false,
        shippingSnapshot: null,
        paymentIntentClientSecret: "pi_new_secret",
        publishableKey: PUBLISHABLE_KEY,
      },
    });
    expect(createOrderTool.output.safeParse(result).success).toBe(true);
    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ status: "pending_payment", stripePaymentIntentId: "pi_new" });
    // The tool writes no audit row of its own, and no address on a guest.
    expect(seen.rows.AuditLog).toBeUndefined();
    expect(seen.rows.User).toBeUndefined();
    expect(seen.sdk).toHaveLength(1);
  });

  it("in mock mode: no secret, no key", async () => {
    stripeNotConfigured();
    await fillCart([PLAIN]);

    const seen = await record(() => invokeTool("orders.create", INPUT, AGENT, SCOPES));

    const result = answer(seen.result);
    expect(result).toEqual({
      ok: true,
      orderId: await writtenOrder(),
      totalDkk: 30700,
      paymentMode: "mock",
      rememberAddress: false,
      shippingSnapshot: null,
    });
    expect(createOrderTool.output.safeParse(result).success).toBe(true);
  });

  it("rememberAddress: the address back, for the route to keep in its cookie", async () => {
    await fillCart([PLAIN]);

    const seen = await record(() => invokeTool("orders.create", { ...INPUT, rememberAddress: true }, AGENT, SCOPES));

    expect(answer(seen.result)).toMatchObject({
      rememberAddress: true,
      shippingSnapshot: {
        name: BUYER.shippingName,
        address: BUYER.shippingAddress,
        zip: BUYER.shippingZip,
        city: BUYER.shippingCity,
      },
    });
  });

  it("rememberAddress left out means no", async () => {
    await fillCart([PLAIN]);

    const seen = await record(() => invokeTool("orders.create", BUYER, AGENT, SCOPES));

    expect(answer(seen.result)).toMatchObject({ rememberAddress: false, shippingSnapshot: null });
  });

  it("the actor decides whose order it is, and rememberAddress never reaches createOrder", async () => {
    world.signedIn = "user-1";
    await world.prisma.cart.create({ data: { id: "cart-2", userId: "user-1" } });
    await fillCart([VARIANT], "cart-2");

    const seen = await record(() =>
      invokeTool("orders.create", { ...INPUT, discountCode: "" }, { actor: "user:user-1" }, SCOPES),
    );

    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ userId: "user-1", currency: BASE_CURRENCY });
    expect(seen.rows.Order?.inserted?.[0]).not.toHaveProperty("rememberAddress");
  });

  it("a refused cart: the error and its code, no more, as an ordinary answer", async () => {
    const seen = await record(() => invokeTool("orders.create", INPUT, AGENT, SCOPES));

    expect(seen).toEqual(
      outcome({ result: { ok: true, result: { ok: false, error: "The cart is empty", code: "EMPTY_CART" } } }),
    );
  });

  it("a withdrawn line: the same, without the names the form gets", async () => {
    await world.prisma.product.update({ where: { id: "plain" }, data: { status: "draft" } });
    await fillCart([PLAIN]);

    const seen = await record(() => invokeTool("orders.create", INPUT, AGENT, SCOPES));

    expect(answer(seen.result)).toEqual({
      ok: false,
      error: "No longer available, so removed from your cart: Plain Mug. Review your order and place it again.",
      code: "PRODUCT_UNAVAILABLE",
    });
  });

  it("a caller without the scope: 403, nothing read", async () => {
    await fillCart([PLAIN]);

    const seen = await record(() => invokeTool("orders.create", INPUT, AGENT, ["catalog:read"]));

    expect(seen).toEqual(
      outcome({ result: { ok: false, status: 403, error: "Tool 'orders.create' requires scope: orders:write" } }),
    );
  });

  it.each([
    ["a postcode that is not four digits", { shippingZip: "12" }, "Postcode must be 4 digits"],
    ["a phone number that is not one", { phoneNumber: "abc" }, "Invalid phone number"],
    ["an email that is not one", { email: "nope" }, "Invalid email address"],
  ])("%s: 422, nothing read", async (_case, over, error) => {
    await fillCart([PLAIN]);

    const seen = await record(() => invokeTool("orders.create", { ...INPUT, ...over }, AGENT, SCOPES));

    expect(seen).toEqual(outcome({ result: { ok: false, status: 422, error, issues: expect.any(Array) } }));
  });
});
