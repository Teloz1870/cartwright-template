import {
  BASE_CURRENCY,
  BUYER,
  CODE_ID,
  MONEY,
  NOW,
  PUBLISHABLE_KEY,
  RATES,
  base,
  failing,
  fillCart,
  network,
  openTheShop,
  outcome,
  record,
  sqlite,
  stripeNotConfigured,
  withShippingRates,
  world,
} from "./shop";

import { beforeEach, describe, expect, it } from "vitest";

import { placeOrder } from "@/app/[locale]/checkout/actions";
import { createOrder } from "@/lib/orders/create";

import type { SdkCall } from "./world";

/**
 * PAY-F1-0 (./shop.ts): checkout on a shop that sends with its own delivery rates
 * (SHIP0-b, #781/#782). ./checkout-db.test.ts holds the shop without rates, which
 * pays the flat policy; this file holds what a rate changes: the fee charged, the
 * amount Stripe is asked for, the delivery snapshotted on the order, and the choices
 * refused. The figures are the same cart as there: two of each line, 10 % off.
 *
 * Where each rule lives today:
 * - lib/shipping/zones.ts:205-218 resolveShipping: no choice is the cheapest option
 *   (:214), a choice that is not an option is ShippingChoiceError (:215-216), and any
 *   choice on a shop that prices flat is refused the same way (:210-211).
 * - lib/shipping/zones.ts:147-196 shippingChoices: the runtime flag (:156), the zone
 *   for the shop's own country (:160-163, zoneFor at :103-106), the weight band
 *   (:170-174), cheapest first (:194). A zone table that cannot be read throws (:93-99).
 * - lib/shipping/price-cart.ts:34-51 priceCart: the fee in the total, decided before
 *   the discount, and the rate whole only when a zone priced it (:49).
 * - lib/orders/create.ts:179-181 passes the choice in, :231-238 snapshots the rate,
 *   :337-346 charges the total, :424-441 answers SHIPPING_CHOICE and INTERNAL.
 * - app/[locale]/checkout/actions.ts:62 reads the choice off the form;
 *   lib/validation.ts:102 trims it and caps it at 64 characters.
 *
 * Pickup rates and pickup points are not held here: SHIP0-b part 2b (#783) offers and
 * charges them, and adds its own refusal, on purpose.
 */

openTheShop();

const INTENT_ID = "pi_new";
const CLIENT_SECRET = "pi_new_secret";

beforeEach(() => {
  network("paymentIntents.create").mockResolvedValue({ id: INTENT_ID, client_secret: CLIENT_SECRET });
});

const orderIdOf = (result: unknown) => (result as { orderId: string }).orderId;

/** The cart's money with `fee` as its shipping: the fee is added after the discount. */
const withFee = (fee: number) => ({ ...MONEY, shippingDkk: fee, totalDkk: MONEY.subtotalDkk - MONEY.discountDkk + fee });

/** The delivery an order keeps: a snapshot of the rate, not a link to it. */
const SENT_WITH = {
  home: { shippingRateId: "rate-home", shippingMethod: "Home delivery", shippingCarrier: "gls", shipmentTemplateId: 101 },
  express: { shippingRateId: "rate-express", shippingMethod: "Express", shippingCarrier: "postnord", shipmentTemplateId: 202 },
};

const WRITTEN = {
  ...BUYER,
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

const TAKEN = {
  Product: { updated: { plain: { stock: 3 } } },
  ProductVariant: { updated: { "fence-2m": { stock: 1 } } },
  DiscountCode: { updated: { [CODE_ID]: { usageCount: 4 } } },
  CartItem: { deleted: ["item-0", "item-1"] },
};

const CHECKOUT_INPUT = { ...BUYER, discountCode: "TEN" };

const intentCreated = (orderId: string, amount: number, currency = base): SdkCall => [
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

const SHIPPING_CHOICE = {
  ok: false,
  error: "That delivery option is no longer available for this order. Choose another.",
  code: "SHIPPING_CHOICE",
};

describe.skipIf(!sqlite)("createOrder on a shop with delivery rates", () => {
  beforeEach(() => withShippingRates());

  it("the rate chosen: its fee in the total, the total to Stripe, the rate kept on the order", async () => {
    await fillCart();

    const seen = await record(() => createOrder({ ...CHECKOUT_INPUT, shippingRateId: RATES.express.id }));

    const orderId = orderIdOf(seen.result);
    const money = withFee(RATES.express.feeDkk);
    expect(money).toEqual({ subtotalDkk: 145800, discountDkk: 14580, shippingDkk: 9900, totalDkk: 141120 });
    expect(seen).toEqual(
      outcome({
        result: {
          ok: true,
          orderId,
          totalDkk: 141120,
          chargeAmountMinor: 141120,
          chargeCurrency: BASE_CURRENCY,
          paymentMode: "stripe",
          paymentIntentClientSecret: CLIENT_SECRET,
          publishableKey: PUBLISHABLE_KEY,
        },
        rows: {
          ...TAKEN,
          Order: {
            inserted: [
              { ...WRITTEN, ...money, ...SENT_WITH.express, status: "pending_payment", stripePaymentIntentId: INTENT_ID },
            ],
          },
          OrderItem: { inserted: linesOf(orderId) },
        },
        sdk: [intentCreated(orderId, 141120)],
      }),
    );
  });

  it("no rate chosen (an agent, an older client): the cheapest option, charged and kept", async () => {
    await fillCart();

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    const orderId = orderIdOf(seen.result);
    expect(seen.result).toMatchObject({ ok: true, totalDkk: 135120, chargeAmountMinor: 135120 });
    expect(seen.sdk).toEqual([intentCreated(orderId, 135120)]);
    expect(seen.rows.Order).toEqual({
      inserted: [
        {
          ...WRITTEN,
          ...withFee(RATES.home.feeDkk),
          ...SENT_WITH.home,
          status: "pending_payment",
          stripePaymentIntentId: INTENT_ID,
        },
      ],
    });
  });

  it("a customer in another currency: the rate is in the total that is converted", async () => {
    await fillCart();
    world.checkoutCurrency = "XTS";

    const seen = await record(() => createOrder({ ...CHECKOUT_INPUT, shippingRateId: RATES.express.id }));

    expect(seen.result).toMatchObject({ totalDkk: 141120, chargeAmountMinor: 70560, chargeCurrency: "XTS" });
    expect(seen.sdk).toEqual([intentCreated(orderIdOf(seen.result), 70560, "xts")]);
    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ shippingDkk: 9900, currency: "XTS", fxRate: 0.5 });
  });

  it.each([
    ["a rate the shop does not have", "rate-gone"],
    ["another country's rate", RATES.abroad.id],
    ["a rate for another weight", RATES.pallet.id],
  ])("refused, %s: nothing written, Stripe not asked", async (_case, rateId) => {
    await fillCart();

    const seen = await record(() => createOrder({ ...CHECKOUT_INPUT, shippingRateId: rateId }));

    expect(seen).toEqual(outcome({ result: SHIPPING_CHOICE }));
  });

  it("the rates cannot be read: refused, never the flat rate instead", async () => {
    await fillCart();
    failing("shippingZone.findMany");

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    expect(seen).toEqual(
      outcome({
        result: { ok: false, error: "Shipping could not be priced right now. Try again shortly.", code: "INTERNAL" },
        logs: [["error", "[createOrder] Shipping rates unreadable; refusing the order:", "Error: db down"]],
      }),
    );
  });

  it("in mock mode: the order paid with the rate's fee, and the receipt says so", async () => {
    stripeNotConfigured();
    await fillCart();

    const seen = await record(() => createOrder({ ...CHECKOUT_INPUT, shippingRateId: RATES.express.id }));

    const orderId = orderIdOf(seen.result);
    const money = withFee(RATES.express.feeDkk);
    expect(seen.result).toEqual({ ok: true, orderId, totalDkk: 141120, paymentMode: "mock" });
    expect(seen.sdk).toEqual([]);
    expect(seen.rows.Order).toEqual({
      inserted: [
        {
          ...WRITTEN,
          ...money,
          ...SENT_WITH.express,
          status: "paid",
          paymentMethod: "mock",
          paidAt: NOW,
          confirmationEmailSentAt: NOW,
        },
      ],
    });
    const [[mail, receipt]] = seen.mails as [string, Record<string, unknown>][];
    expect(mail).toBe("sendOrderConfirmation");
    expect(receipt).toMatchObject(money);
  });
});

describe.skipIf(!sqlite)("createOrder where the flat rate applies", () => {
  it("the flag on, but no zone for the shop's country: the flat rate, no delivery on the order", async () => {
    await withShippingRates({ homeZone: false });
    await fillCart();

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    expect(seen.result).toMatchObject({ ok: true, totalDkk: MONEY.totalDkk, chargeAmountMinor: MONEY.totalDkk });
    expect(seen.rows.Order).toEqual({
      inserted: [{ ...WRITTEN, ...MONEY, status: "pending_payment", stripePaymentIntentId: INTENT_ID }],
    });
  });

  it("rates set up, but the flag off: the flat rate, no delivery on the order", async () => {
    await withShippingRates();
    world.shippingZonesOn = false;
    await fillCart();

    const seen = await record(() => createOrder(CHECKOUT_INPUT));

    expect(seen.result).toMatchObject({ ok: true, totalDkk: MONEY.totalDkk });
    expect(seen.rows.Order?.inserted?.[0]).toEqual({
      ...WRITTEN,
      ...MONEY,
      status: "pending_payment",
      stripePaymentIntentId: INTENT_ID,
    });
  });

  it.each([
    ["a shop with no rates at all", async () => {}],
    ["rates set up, the flag off", async () => {
      await withShippingRates();
      world.shippingZonesOn = false;
    }],
  ])("a rate chosen where the flat rate applies (%s): refused as stale, never charged flat", async (_case, setUp) => {
    await setUp();
    await fillCart();

    const seen = await record(() => createOrder({ ...CHECKOUT_INPUT, shippingRateId: RATES.home.id }));

    expect(seen).toEqual(outcome({ result: SHIPPING_CHOICE }));
  });
});

describe.skipIf(!sqlite)("placeOrder, the checkout form, with delivery rates", () => {
  beforeEach(() => withShippingRates());

  const form = (over: Record<string, string> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ ...BUYER, discountCode: "TEN", ...over })) data.append(key, value);
    return data;
  };

  it("the delivery step's choice, trimmed, is what is charged and kept", async () => {
    await fillCart();

    const seen = await record(() => placeOrder(form({ shippingRateId: `  ${RATES.express.id} ` })));

    const orderId = orderIdOf(seen.result);
    expect(seen.result).toEqual({
      ok: true,
      mode: "stripe",
      orderId,
      clientSecret: CLIENT_SECRET,
      publishableKey: PUBLISHABLE_KEY,
      totalDkk: 141120,
      chargeAmountMinor: 141120,
      chargeCurrency: BASE_CURRENCY,
    });
    expect(seen.sdk).toEqual([intentCreated(orderId, 141120)]);
    expect(seen.rows.Order?.inserted?.[0]).toMatchObject({ shippingDkk: 9900, ...SENT_WITH.express });
    expect(seen.revalidated).toEqual([["/cart"], ["/account/orders"]]);
  });

  it("a choice that is not an option: SHIPPING_CHOICE passes through, nothing refreshed", async () => {
    await fillCart();

    const seen = await record(() => placeOrder(form({ shippingRateId: RATES.abroad.id })));

    expect(seen).toEqual(outcome({ result: SHIPPING_CHOICE }));
  });

  it("a choice longer than a rate id can be: refused before anything is read", async () => {
    await fillCart();

    const seen = await record(() => placeOrder(form({ shippingRateId: "r".repeat(65) })));

    expect(seen).toEqual(outcome({ result: { ok: false, error: "Too big: expected string to have <=64 characters", code: "VALIDATION" } }));
  });
});
