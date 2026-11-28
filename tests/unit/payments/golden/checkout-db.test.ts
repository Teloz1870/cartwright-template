import {
  BASE_CURRENCY,
  BUYER,
  CODE_ID,
  MONEY,
  NOW,
  PLAIN,
  PUBLISHABLE_KEY,
  VARIANT,
  base,
  failing,
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

import { placeOrder } from "@/app/[locale]/checkout/actions";
import { createOrder, type CreateOrderResult } from "@/lib/orders/create";

import type { SdkCall } from "./world";

/**
 * PAY-F1-0 (./shop.ts): checkout's create paths, from a real cart: createOrder and
 * the server action in front of it. What a paid order then fires is
 * ../../on-order-paid-replay-db.test.ts's, and is not repeated beyond its row.
 */

openTheShop();

const INTENT_ID = "pi_new";
const CLIENT_SECRET = "pi_new_secret";

beforeEach(() => {
  network("paymentIntents.create").mockResolvedValue({ id: INTENT_ID, client_secret: CLIENT_SECRET });
});

const orderIdOf = (result: unknown) => (result as { orderId: string }).orderId;

/** What an order row holds when checkout has written it, before each path's own columns. */
const WRITTEN = {
  ...BUYER,
  ...MONEY,
  discountCode: "TEN",
  isAiGenerated: false,
  channel: "web",
  currency: BASE_CURRENCY,
  fxRate: 1,
};

const linesOf = (orderId: string) => [
  {
    orderId,
    productId: "fence",
    productName: "Fence Panel",
    unitPriceDkk: 60000,
    quantity: 2,
    variantId: "fence-2m",
    variantSku: "F-2M",
    variantAttributes: { height: "2m" },
  },
  { orderId, productId: "plain", productName: "Plain Mug", unitPriceDkk: 12900, quantity: 2 },
];

const STOCK_TAKEN = {
  Product: { updated: { plain: { stock: 3 } } },
  ProductVariant: { updated: { "fence-2m": { stock: 1 } } },
};
const CODE_USED = { DiscountCode: { updated: { [CODE_ID]: { usageCount: 4 } } } };
const CART_EMPTIED = { CartItem: { deleted: ["item-0", "item-1"] } };

const CHECKOUT_INPUT = { ...BUYER, discountCode: "TEN" };

const intentCreated = (orderId: string, amount = MONEY.totalDkk, currency = base): SdkCall => [
  "paymentIntents.create",
  {
    amount,
    currency,
    receipt_email: BUYER.email,
    metadata: { orderId, currency },
    automatic_payment_methods: { enabled: true },
  },
  { idempotencyKey: `order_${orderId}` },
];

describe.skipIf(!sqlite)("createOrder with Stripe ready", () => {
  it("the order written awaiting payment, stock and the code's use taken, the cart emptied, the intent created", async () => {
    await fillCart();

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    const orderId = orderIdOf(seen.result);
    expect(seen).toEqual(
      outcome({
        result: {
          ok: true,
          orderId,
          totalDkk: MONEY.totalDkk,
          chargeAmountMinor: MONEY.totalDkk,
          chargeCurrency: BASE_CURRENCY,
          paymentMode: "stripe",
          paymentIntentClientSecret: CLIENT_SECRET,
          publishableKey: PUBLISHABLE_KEY,
        },
        rows: {
          ...STOCK_TAKEN,
          ...CODE_USED,
          ...CART_EMPTIED,
          Order: { inserted: [{ ...WRITTEN, status: "pending_payment", stripePaymentIntentId: INTENT_ID }] },
          OrderItem: { inserted: linesOf(orderId) },
        },
        sdk: [intentCreated(orderId)],
      }),
    );
  });

  it("a customer who picked another currency: charged in it, with the rate snapshotted and the ledger in base", async () => {
    await fillCart();
    world.checkoutCurrency = "XTS";

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    const orderId = orderIdOf(seen.result);
    expect(seen.result).toMatchObject({
      totalDkk: MONEY.totalDkk,
      chargeAmountMinor: 68060,
      chargeCurrency: "XTS",
    });
    expect(seen.sdk).toEqual([intentCreated(orderId, 68060, "xts")]);
    expect(seen.rows.Order).toEqual({
      inserted: [{ ...WRITTEN, status: "pending_payment", stripePaymentIntentId: INTENT_ID, currency: "XTS", fxRate: 0.5 }],
    });
  });

  it("today's rate, when the shop keeps one, is the rate charged and snapshotted", async () => {
    await fillCart();
    world.checkoutCurrency = "XTS";
    world.fxAutoUpdate = true;
    await world.prisma.integrationSettings.create({
      data: { id: 1, fxRatesJson: JSON.stringify({ fetchedAt: NOW, rates: { XTS: 0.25 } }) },
    });

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    expect(seen.result).toMatchObject({ chargeAmountMinor: 34030, chargeCurrency: "XTS" });
    expect(seen.sdk).toEqual([intentCreated(orderIdOf(seen.result), 34030, "xts")]);
    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ currency: "XTS", fxRate: 0.25 });
  });

  it("exactly what there is of each line is enough", async () => {
    await world.prisma.product.update({ where: { id: "plain" }, data: { stock: 2 } });
    await world.prisma.productVariant.update({ where: { id: "fence-2m" }, data: { stock: 2 } });
    await fillCart();

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    expect(seen.result).toMatchObject({ ok: true });
    expect(seen.rows.Product).toEqual({ updated: { plain: { stock: 0 } } });
    expect(seen.rows.ProductVariant).toEqual({ updated: { "fence-2m": { stock: 0 } } });
  });

  it("no code and no phone: neither on the row", async () => {
    await fillCart([PLAIN]);

    const seen = await record(() => createOrder(BUYER));

    const total = 25800 + 4900;
    expect(seen.rows.Order).toEqual({
      inserted: [
        {
          ...BUYER,
          status: "pending_payment",
          subtotalDkk: 25800,
          discountDkk: 0,
          shippingDkk: 4900,
          totalDkk: total,
          isAiGenerated: false,
          channel: "web",
          currency: BASE_CURRENCY,
          fxRate: 1,
          stripePaymentIntentId: INTENT_ID,
        },
      ],
    });
    expect(seen.rows.DiscountCode).toBeUndefined();
    expect(seen.sdk).toEqual([intentCreated(orderIdOf(seen.result), total)]);
  });

  it("a phone number is kept on the order", async () => {
    await fillCart([PLAIN]);

    const seen = await record(() => createOrder({ ...BUYER, phoneNumber: "+4512345678" }));

    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ phoneNumber: "+4512345678" });
    expect(seen.rows.User).toBeUndefined();
  });

  it("a code typed in lower case with spaces: found, and stored as the code", async () => {
    await fillCart();

    const seen = await record(() => createOrder({ ...BUYER, discountCode: "  ten " }));

    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ discountCode: "TEN", discountDkk: 14580 });
    expect(seen.rows.DiscountCode).toEqual(CODE_USED.DiscountCode);
  });

  it("known: an empty code is no discount, and is stored as an empty string", async () => {
    await fillCart([PLAIN]);

    const seen = await record(() => createOrder({ ...BUYER, discountCode: "" }));

    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ discountCode: "", discountDkk: 0 });
    expect(seen.rows.DiscountCode).toBeUndefined();
  });

  it("a signed-in customer: their cart, their order, the address kept on their profile", async () => {
    world.signedIn = "user-1";
    await world.prisma.cart.create({ data: { id: "cart-2", userId: "user-1" } });
    await fillCart([PLAIN], "cart-2");

    const seen = await record(() =>
      createOrder({ ...BUYER, phoneNumber: "+4512345678" }, { actor: "user:user-1" }),
    );

    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ userId: "user-1" });
    expect(seen.rows.User).toEqual({
      updated: {
        "user-1": {
          shippingName: BUYER.shippingName,
          shippingAddress: BUYER.shippingAddress,
          shippingZip: BUYER.shippingZip,
          shippingCity: BUYER.shippingCity,
          phoneNumber: "+4512345678",
        },
      },
    });
    expect(seen.rows.CartItem).toEqual({ deleted: ["item-0"] });
  });

  it("signed in with no phone: the profile's phone is left alone", async () => {
    world.signedIn = "user-1";
    await world.prisma.user.update({ where: { id: "user-1" }, data: { phoneNumber: "+4511111111" } });
    await world.prisma.cart.create({ data: { id: "cart-2", userId: "user-1" } });
    await fillCart([PLAIN], "cart-2");

    const seen = await record(() => createOrder(BUYER, { actor: "user:user-1" }));

    expect(seen.rows.User?.updated?.["user-1"]).not.toHaveProperty("phoneNumber");
  });

  it("an actor that is not a user: no user on the order", async () => {
    await fillCart([PLAIN]);

    const seen = await record(() => createOrder(BUYER, { actor: "storefront-chat:s1" }));

    expect(seen.rows.Order?.inserted?.[0]).not.toHaveProperty("userId");
    expect(seen.rows.User).toBeUndefined();
  });
});

/** Stripe could not be started: the order is cancelled, and all it took comes back. */
describe.skipIf(!sqlite)("createOrder when the payment cannot be started", () => {
  const FAILED = {
    ok: false,
    error: "Could not initialize payment. Try again shortly.",
    code: "PAYMENT_INIT_FAILED",
  };

  /** Everything checkout took is back. The order stays as a cancelled row, and the cart stays empty. */
  const ROLLED_BACK = (orderId: string) => ({
    ...CART_EMPTIED,
    Order: { inserted: [{ ...WRITTEN, status: "cancelled" }] },
    OrderItem: { inserted: linesOf(orderId) },
  });

  const orderIdFromIntent = () => {
    const [, args] = world.sdk[0] as [string, { metadata: { orderId: string } }];
    return args.metadata.orderId;
  };

  it("Stripe refuses: the customer told to try again, the log says why", async () => {
    await fillCart();
    network("paymentIntents.create").mockRejectedValue(new Error("stripe down"));

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    const orderId = orderIdFromIntent();
    expect(seen).toEqual(
      outcome({
        result: FAILED,
        rows: ROLLED_BACK(orderId),
        sdk: [intentCreated(orderId)],
        logs: [["error", "[createOrder] Stripe-init failed:", "Error: stripe down"]],
      }),
    );
  });

  it("Stripe answers with no client secret: the same", async () => {
    await fillCart();
    network("paymentIntents.create").mockResolvedValue({ id: INTENT_ID, client_secret: null });

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    expect(seen.result).toEqual(FAILED);
    expect(seen.rows).toEqual(ROLLED_BACK(orderIdFromIntent()));
    expect(seen.logs).toEqual([
      ["error", "[createOrder] Stripe-init failed:", "Error: Stripe returned PaymentIntent without client_secret"],
    ]);
  });

  it("the keys gone before the intent: the same, Stripe never called", async () => {
    await fillCart();
    world.before.set("$transaction", () => stripeNotConfigured());

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    expect(seen.result).toEqual(FAILED);
    expect(seen.sdk).toEqual([]);
    expect(seen.logs).toEqual([
      ["error", "[createOrder] Stripe-init failed:", "Error: Stripe keys missing efter isStripeReady()=true"],
    ]);
    expect(seen.rows.Order).toEqual({ inserted: [{ ...WRITTEN, status: "cancelled" }] });
  });

  it("the keys gone after the intent: the same, with no intent on the order", async () => {
    await fillCart();
    network("paymentIntents.create").mockImplementation(async () => {
      stripeNotConfigured();
      return { id: INTENT_ID, client_secret: CLIENT_SECRET };
    });

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    expect(seen.result).toEqual(FAILED);
    expect(seen.logs).toEqual([["error", "[createOrder] Stripe-init failed:", "Error: Stripe keys missing"]]);
    expect(seen.rows.Order).toEqual({ inserted: [{ ...WRITTEN, status: "cancelled" }] });
  });

  it("the intent's id cannot be saved: the same", async () => {
    await fillCart();
    failing("order.update");

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    expect(seen.result).toEqual(FAILED);
    expect(seen.logs).toEqual([["error", "[createOrder] Stripe-init failed:", "Error: db down"]]);
    expect(seen.rows.Order).toEqual({ inserted: [{ ...WRITTEN, status: "cancelled" }] });
  });

  it("and the rollback fails too: both in the log, the order left awaiting payment", async () => {
    await fillCart();
    network("paymentIntents.create").mockImplementation(async () => {
      failing("$transaction", "db down too");
      throw new Error("stripe down");
    });

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    expect(seen.result).toEqual(FAILED);
    expect(seen.logs).toEqual([
      ["error", "[createOrder] Stripe-init failed:", "Error: stripe down"],
      ["error", "[createOrder] rollback-restock failed:", "Error: db down too"],
    ]);
    expect(seen.rows.Order).toEqual({ inserted: [{ ...WRITTEN, status: "pending_payment" }] });
    expect(seen.rows.Product).toEqual(STOCK_TAKEN.Product);
  });
});

describe.skipIf(!sqlite)("createOrder in mock mode: no Stripe keys", () => {
  beforeEach(() => stripeNotConfigured());

  it("the order written paid, the mails out, Stripe nowhere", async () => {
    await fillCart();

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    const orderId = orderIdOf(seen.result);
    const receipt = {
      orderId,
      email: BUYER.email,
      shippingName: BUYER.shippingName,
      items: [
        { productName: "Fence Panel (2m)", quantity: 2, unitPriceDkk: 60000 },
        { productName: "Plain Mug", quantity: 2, unitPriceDkk: 12900 },
      ],
      ...MONEY,
      currency: BASE_CURRENCY,
      fxRate: 1,
    };
    expect(seen).toEqual(
      outcome({
        result: { ok: true, orderId, totalDkk: MONEY.totalDkk, paymentMode: "mock" },
        rows: {
          ...STOCK_TAKEN,
          ...CODE_USED,
          ...CART_EMPTIED,
          Order: {
            inserted: [{ ...WRITTEN, status: "paid", paymentMethod: "mock", paidAt: NOW, confirmationEmailSentAt: NOW }],
          },
          OrderItem: { inserted: linesOf(orderId) },
        },
        mails: [
          ["sendOrderConfirmation", receipt],
          [
            "sendOwnerNewOrderEmail",
            { ...receipt, to: "owner@shop.example.test", adminUrl: `https://shop.example.test/admin/ordrer/${orderId}` },
          ],
        ],
      }),
    );
  });

  it.each([
    ["each text and number, in order", { height: "2m", width: 3, sold: true }, "Fence Panel (2m · 3)"],
    ["no text or number at all", { sold: true }, "Fence Panel (variant)"],
    ["not an object", "2m", "Fence Panel (variant)"],
  ])("a variant's name on the receipt: %s", async (_case, attributes, line) => {
    await world.prisma.productVariant.update({ where: { id: "fence-2m" }, data: { attributes } });
    await fillCart([VARIANT]);

    const seen = await record(() => createOrder(BUYER));

    const [, receipt] = seen.mails[0] as [string, { items: { productName: string }[] }];
    expect(receipt.items.map((item) => item.productName)).toEqual([line]);
  });

  it("the receipt fails: the order stands, no stamp, the log line is checkout's own", async () => {
    await fillCart([PLAIN]);
    world.mailFaults.set("sendOrderConfirmation", new Error("mail down"));

    const seen = await record(() => createOrder(BUYER));

    expect(seen.result).toMatchObject({ ok: true, paymentMode: "mock" });
    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ status: "paid" });
    expect(seen.rows.Order?.inserted?.[0]).not.toHaveProperty("confirmationEmailSentAt");
    expect(seen.logs).toEqual([["error", "[createOrder] could not send order confirmation", "Error: mail down"]]);
  });

  it("a customer's currency is on the row and on the receipt", async () => {
    world.checkoutCurrency = "XTS";
    await fillCart([PLAIN]);

    const seen = await record(() => createOrder(BUYER));

    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ currency: "XTS", fxRate: 0.5 });
    const [, receipt] = seen.mails[0] as [string, { currency: string; fxRate: number }];
    expect(receipt).toMatchObject({ currency: "XTS", fxRate: 0.5 });
  });
});

describe.skipIf(!sqlite)("createOrder refusing a cart", () => {
  const refused = (error: string, code: Extract<CreateOrderResult, { ok: false }>["code"]) => ({ ok: false, error, code });

  it("an empty cart", async () => {
    const seen = await record(() => createOrder(BUYER));

    expect(seen).toEqual(outcome({ result: refused("The cart is empty", "EMPTY_CART") }));
  });

  it("no cart at all", async () => {
    world.cartSession = null;

    const seen = await record(() => createOrder(BUYER));

    expect(seen).toEqual(outcome({ result: refused("The cart is empty", "EMPTY_CART") }));
  });

  it("more than there is of a product", async () => {
    await world.prisma.product.update({ where: { id: "plain" }, data: { stock: 1 } });
    await fillCart([PLAIN]);

    const seen = await record(() => createOrder(BUYER));

    expect(seen).toEqual(outcome({ result: refused("Plain Mug is out of stock", "OUT_OF_STOCK") }));
  });

  it("more than there is of a variant, whatever the product holds", async () => {
    await world.prisma.productVariant.update({ where: { id: "fence-2m" }, data: { stock: 1 } });
    await fillCart([VARIANT]);

    const seen = await record(() => createOrder(BUYER));

    expect(seen).toEqual(outcome({ result: refused("Fence Panel is out of stock", "OUT_OF_STOCK") }));
  });

  it.each([
    ["a product", PLAIN, () => world.prisma.product.update({ where: { id: "plain" }, data: { stock: 0 } }), "Plain Mug"],
    [
      "a variant",
      VARIANT,
      () => world.prisma.productVariant.update({ where: { id: "fence-2m" }, data: { stock: 0 } }),
      "Fence Panel",
    ],
  ])("%s sold out between the cart and the order: nothing written, Stripe not asked", async (_case, line, sellOut, name) => {
    await fillCart([line]);
    world.before.set("$transaction", sellOut);

    const seen = await record(() => createOrder(BUYER));

    expect(seen.result).toEqual(
      refused(`${name} sold out while the order was being created. Try again or choose another item.`, "OUT_OF_STOCK"),
    );
    expect(seen.rows.Order).toBeUndefined();
    expect(seen.rows.OrderItem).toBeUndefined();
    expect(seen.rows.CartItem).toBeUndefined();
    expect(seen.sdk).toEqual([]);
  });

  it.each([
    ["deleted, a product", PLAIN, "plain", { deletedAt: new Date(NOW) }, "Plain Mug"],
    ["set to draft, a product", PLAIN, "plain", { status: "draft" }, "Plain Mug"],
    ["deleted, a variant's product", VARIANT, "fence", { deletedAt: new Date(NOW) }, "Fence Panel"],
    ["set to draft, a variant's product", VARIANT, "fence", { status: "draft" }, "Fence Panel"],
  ])("%s, between the cart and the order: the same answer, nothing written", async (_case, line, id, gone, name) => {
    await fillCart([line]);
    world.before.set("$transaction", () => world.prisma.product.update({ where: { id }, data: gone }));

    const seen = await record(() => createOrder(BUYER));

    expect(seen.result).toEqual(
      refused(`${name} sold out while the order was being created. Try again or choose another item.`, "OUT_OF_STOCK"),
    );
    expect(seen.rows.Order).toBeUndefined();
    expect(seen.rows.ProductVariant).toBeUndefined();
    expect(seen.sdk).toEqual([]);
  });

  it.each([
    ["deleted", { deletedAt: new Date(NOW) }],
    ["set to draft", { status: "draft" }],
  ])("a line whose product was %s: named, taken out of the cart, the rest kept", async (_case, gone) => {
    await world.prisma.product.update({ where: { id: "plain" }, data: gone });
    await fillCart();

    const seen = await record(() => createOrder(BUYER));

    expect(seen).toEqual(
      outcome({
        result: {
          ok: false,
          error: "No longer available, so removed from your cart: Plain Mug. Review your order and place it again.",
          code: "PRODUCT_UNAVAILABLE",
          unavailableItems: ["Plain Mug"],
          cartEmpty: false,
        },
        rows: { CartItem: { deleted: ["item-0"] } },
      }),
    );
  });

  it("two products withdrawn: both named", async () => {
    await world.prisma.product.updateMany({ where: { id: { in: ["plain", "fence"] } }, data: { status: "draft" } });
    await fillCart();

    const seen = await record(() => createOrder(BUYER));

    expect(seen.result).toMatchObject({
      error: "No longer available, so removed from your cart: Plain Mug, Fence Panel. Review your order and place it again.",
      unavailableItems: ["Plain Mug", "Fence Panel"],
      cartEmpty: true,
    });
  });

  it("every line withdrawn, two of one product: one name, and the cart says it is empty", async () => {
    await world.prisma.product.update({ where: { id: "fence" }, data: { status: "draft" } });
    await fillCart([VARIANT, { productId: "fence", variantId: null }]);

    const seen = await record(() => createOrder(BUYER));

    expect(seen.result).toEqual({
      ok: false,
      error: "No longer available, so removed from your cart: Fence Panel. Review your order and place it again.",
      code: "PRODUCT_UNAVAILABLE",
      unavailableItems: ["Fence Panel"],
      cartEmpty: true,
    });
    expect(seen.rows).toEqual({ CartItem: { deleted: ["item-0", "item-1"] } });
  });

  it.each([
    ["a code that does not exist", "NOPE", {}, "Unknown discount code"],
    ["a code switched off", "TEN", { active: false }, "The discount code is not active"],
    ["a code past its date", "TEN", { validUntil: new Date("2026-10-30T00:00:00.000Z") }, "The discount code has expired"],
    ["a code used up", "TEN", { usageLimit: 3 }, "The discount code has been fully used"],
  ])("%s: nothing written", async (_case, code, over, error) => {
    await world.prisma.discountCode.update({ where: { id: CODE_ID }, data: over });
    await fillCart();

    const seen = await record(() => createOrder({ ...BUYER, discountCode: code }));

    expect(seen).toEqual(outcome({ result: refused(error, "INVALID_DISCOUNT") }));
  });

  it("anything unforeseen: a line in the log, and an answer that gives nothing away", async () => {
    await fillCart();
    failing("$transaction");

    const seen = await record(() => createOrder(BUYER));

    expect(seen).toEqual(
      outcome({
        result: refused("Something went wrong while placing the order. Try again.", "INTERNAL"),
        logs: [["error", "[createOrder] Unexpected error:", "Error: db down"]],
      }),
    );
  });
});

describe.skipIf(!sqlite)("placeOrder, the checkout form's server action", () => {
  const form = (over: Record<string, string> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ ...BUYER, discountCode: "TEN", ...over })) data.append(key, value);
    return data;
  };

  it("with Stripe ready: what the payment panel needs, under the panel's names", async () => {
    await fillCart();

    const seen = await record(() => placeOrder(form()));

    const orderId = orderIdOf(seen.result);
    expect(seen.result).toEqual({
      ok: true,
      mode: "stripe",
      orderId,
      clientSecret: CLIENT_SECRET,
      publishableKey: PUBLISHABLE_KEY,
      totalDkk: MONEY.totalDkk,
      chargeAmountMinor: MONEY.totalDkk,
      chargeCurrency: BASE_CURRENCY,
    });
    expect(seen.revalidated).toEqual([["/cart"], ["/account/orders"]]);
    expect(seen.rows.Order).toEqual({
      inserted: [{ ...WRITTEN, status: "pending_payment", stripePaymentIntentId: INTENT_ID }],
    });
    expect(seen.sdk).toEqual([intentCreated(orderId)]);
  });

  it("a customer's currency passes through as it was charged", async () => {
    await fillCart();
    world.checkoutCurrency = "XTS";

    const seen = await record(() => placeOrder(form()));

    expect(seen.result).toMatchObject({ totalDkk: MONEY.totalDkk, chargeAmountMinor: 68060, chargeCurrency: "XTS" });
  });

  it("in mock mode: the order id, nothing else", async () => {
    stripeNotConfigured();
    await fillCart();

    const seen = await record(() => placeOrder(form()));

    const order = await world.prisma.order.findFirstOrThrow({ where: { email: BUYER.email } });
    expect(seen.result).toEqual({ ok: true, mode: "mock", orderId: order.id });
    expect(seen.revalidated).toEqual([["/cart"], ["/account/orders"]]);
  });

  it("a signed-in customer's order is theirs", async () => {
    world.signedIn = "user-1";
    await world.prisma.cart.create({ data: { id: "cart-2", userId: "user-1" } });
    await fillCart(undefined, "cart-2");

    const seen = await record(() => placeOrder(form()));

    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ userId: "user-1" });
  });

  it("a guest's is nobody's", async () => {
    await fillCart();

    const seen = await record(() => placeOrder(form()));

    expect(seen.rows.Order?.inserted?.[0]).not.toHaveProperty("userId");
  });

  it.each([
    ["a name too short", { shippingName: "B" }, "Name must be at least 2 characters"],
    ["an email that is not one", { email: "nope" }, "Invalid email address"],
    ["an address too short", { shippingAddress: "x" }, "Address must be at least 3 characters"],
    ["a postcode that is not four digits", { shippingZip: "12" }, "Postcode must be 4 digits"],
    ["a city too short", { shippingCity: "x" }, "City must be at least 2 characters"],
  ])("%s: refused before anything is read", async (_case, over, error) => {
    await fillCart();

    const seen = await record(() => placeOrder(form(over)));

    expect(seen).toEqual(outcome({ result: { ok: false, error, code: "VALIDATION" } }));
  });

  it("createOrder's refusal passes through: no refresh, since nothing changed", async () => {
    const seen = await record(() => placeOrder(form()));

    expect(seen).toEqual(outcome({ result: { ok: false, error: "The cart is empty", code: "EMPTY_CART" } }));
  });

  it("a withdrawn line: what the form needs to say so, and the cart refreshed", async () => {
    await world.prisma.product.update({ where: { id: "plain" }, data: { status: "draft" } });
    await fillCart([PLAIN]);

    const seen = await record(() => placeOrder(form()));

    expect(seen).toEqual(
      outcome({
        result: {
          ok: false,
          error: "No longer available, so removed from your cart: Plain Mug. Review your order and place it again.",
          code: "PRODUCT_UNAVAILABLE",
          unavailableItems: ["Plain Mug"],
          cartEmpty: true,
        },
        rows: { CartItem: { deleted: ["item-0"] } },
        revalidated: [["/cart"], ["/", "layout"]],
      }),
    );
  });
});
