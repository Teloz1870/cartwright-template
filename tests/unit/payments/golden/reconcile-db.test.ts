import {
  BASE_CURRENCY,
  BUYER,
  CRON_SECRET,
  GIVEN_BACK,
  INTENT,
  MONEY,
  NOW,
  ORDER,
  base,
  failing,
  minutesAgo,
  network,
  openTheShop,
  orderIn,
  outcome,
  paidIntent,
  record,
  runCron,
  sqlite,
  stripeNotConfigured,
  world,
} from "./shop";

import { describe, expect, it } from "vitest";

import * as route from "@/app/api/cron/reconcile-stripe/route";

import type { SdkCall } from "./world";

/**
 * PAY-F1-0 (./shop.ts): every outcome of the reconcile cron. What repeats and races
 * do to the receipt is ../../on-order-paid-replay-db.test.ts's, and is not repeated.
 */

openTheShop();

const ran = (results: { orderId: string; action: string }[], processed = results.length) => ({
  status: 200,
  body: { ok: true, processed, results },
});

const RETRIEVED: SdkCall[] = [["paymentIntents.retrieve", INTENT]];

/** An order the cron's query takes, or not: nothing but the columns it looks at. */
const another = (id: string, over: Record<string, unknown> = {}) =>
  world.prisma.order.create({
    data: {
      id,
      status: "pending_payment",
      ...BUYER,
      subtotalDkk: 100,
      shippingDkk: 0,
      totalDkk: 100,
      currency: BASE_CURRENCY,
      stripePaymentIntentId: `pi_${id}`,
      createdAt: minutesAgo(10),
      ...over,
    },
  });

describe.skipIf(!sqlite)("the reconcile cron, before it looks at an order", () => {
  it("the route: a GET, on Node, never cached", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "runtime"]);
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
  });

  it.each([
    ["no header", null],
    ["another secret", "Bearer wrong"],
  ])("%s: 401, and it does not run", async (_case, authorization) => {
    await orderIn();

    const seen = await record(() => runCron(authorization));

    expect(seen).toEqual(outcome({ result: { status: 401, body: { error: "Unauthorized" } } }));
  });

  it("the right secret, Stripe not configured: nothing to reconcile, and it says why", async () => {
    await orderIn();
    stripeNotConfigured();

    const seen = await record(() => runCron(`Bearer ${CRON_SECRET}`));

    expect(seen).toEqual(outcome({ result: { status: 200, body: { ok: true, reason: "stripe-not-configured" } } }));
  });

  it("no order to look at: an empty run", async () => {
    const seen = await record(() => runCron());

    expect(seen).toEqual(outcome({ result: ran([]) }));
  });
});

describe.skipIf(!sqlite)("which orders it looks at", () => {
  it("awaiting payment, with an intent, five minutes old or more: no other", async () => {
    await another("exactly-five", { createdAt: minutesAgo(5) });
    await another("just-under-five", { createdAt: new Date(minutesAgo(5).getTime() + 1) });
    await another("no-intent", { stripePaymentIntentId: null });
    await another("pending", { status: "pending" });
    await another("flagged", { status: "flagged_review" });
    await another("paid", { status: "paid" });
    network("paymentIntents.retrieve").mockResolvedValue({ status: "processing" });

    const seen = await record(() => runCron());

    expect(seen.sdk).toEqual([["paymentIntents.retrieve", "pi_exactly-five"]]);
    expect(seen.result).toEqual(ran([{ orderId: "exactly-five", action: "unknown_status_processing" }]));
  });

  it("the oldest first, and at most 50 in a run", async () => {
    for (let age = 0; age < 51; age++) {
      await another(`ord-${age}`, { createdAt: minutesAgo(1000 - age) });
    }
    network("paymentIntents.retrieve").mockResolvedValue({ status: "processing" });

    const seen = await record(() => runCron());

    expect(seen.sdk).toEqual(Array.from({ length: 50 }, (_, age) => ["paymentIntents.retrieve", `pi_ord-${age}`]));
    expect((seen.result as ReturnType<typeof ran>).body.processed).toBe(50);
  });
});

describe.skipIf(!sqlite)("what it does with each answer from Stripe", () => {
  it("succeeded, for what the order says: paid, the mails out, no marketing event", async () => {
    await orderIn();
    network("paymentIntents.retrieve").mockResolvedValue(paidIntent());

    const seen = await record(() => runCron());

    const receipt = {
      orderId: ORDER,
      email: BUYER.email,
      shippingName: BUYER.shippingName,
      items: [
        { productName: "Fence Panel", quantity: 2, unitPriceDkk: 60000 },
        { productName: "Plain Mug", quantity: 2, unitPriceDkk: 12900 },
      ],
      ...MONEY,
      currency: BASE_CURRENCY,
      fxRate: 1,
    };
    expect(seen).toEqual(
      outcome({
        result: ran([{ orderId: ORDER, action: "reconciled_paid" }]),
        rows: {
          Order: {
            updated: {
              [ORDER]: { status: "paid", paymentMethod: "stripe_card", paidAt: NOW, confirmationEmailSentAt: NOW },
            },
          },
        },
        sdk: RETRIEVED,
        mails: [
          ["sendOrderConfirmation", receipt],
          [
            "sendOwnerNewOrderEmail",
            { ...receipt, to: "owner@shop.example.test", adminUrl: `https://shop.example.test/admin/ordrer/${ORDER}` },
          ],
        ],
      }),
    );
  });

  it.each([
    ["the method Stripe names first", { payment_method_types: ["mobilepay"] }, "stripe_mobilepay"],
    ["no method list", { payment_method_types: undefined }, "stripe_card"],
  ])("the payment method: %s", async (_case, over, method) => {
    await orderIn();
    network("paymentIntents.retrieve").mockResolvedValue(paidIntent(over));

    const seen = await record(() => runCron());

    expect(seen.rows.Order?.updated?.[ORDER]).toMatchObject({ paymentMethod: method });
  });

  it("the receipt fails: the order is paid, no stamp, and the run's log line is its own", async () => {
    await orderIn();
    network("paymentIntents.retrieve").mockResolvedValue(paidIntent());
    world.mailFaults.set("sendOrderConfirmation", new Error("mail down"));

    const seen = await record(() => runCron());

    expect(seen.result).toEqual(ran([{ orderId: ORDER, action: "reconciled_paid" }]));
    expect(seen.rows.Order).toEqual({
      updated: { [ORDER]: { status: "paid", paymentMethod: "stripe_card", paidAt: NOW } },
    });
    expect(seen.logs).toEqual([["error", `[reconcile-cron] mail failed for ${ORDER}:`, "Error: mail down"]]);
  });

  it("an order charged in another currency is held to its own snapshot", async () => {
    await orderIn("pending_payment", { currency: "XTS", fxRate: 0.5 });
    network("paymentIntents.retrieve").mockResolvedValue(paidIntent({ amount: 68060, currency: "xts" }));

    const seen = await record(() => runCron());

    expect(seen.result).toEqual(ran([{ orderId: ORDER, action: "reconciled_paid" }]));
  });

  it.each([
    ["the wrong amount", { amount: 100 }],
    ["the wrong currency", { currency: "xts" }],
  ])("succeeded for %s: flagged for review, no mail", async (_case, over) => {
    await orderIn();
    network("paymentIntents.retrieve").mockResolvedValue(paidIntent(over));

    const seen = await record(() => runCron());

    expect(seen).toEqual(
      outcome({
        result: ran([{ orderId: ORDER, action: "flagged_amount_mismatch" }]),
        rows: { Order: { updated: { [ORDER]: { status: "flagged_review" } } } },
        sdk: RETRIEVED,
      }),
    );
  });

  it("the wrong amount, with the order cancelled while Stripe answered: it stays cancelled", async () => {
    await orderIn();
    network("paymentIntents.retrieve").mockImplementation(async () => {
      await world.prisma.order.update({ where: { id: ORDER }, data: { status: "cancelled" } });
      return paidIntent({ amount: 100 });
    });

    const seen = await record(() => runCron());

    expect(seen).toEqual(
      outcome({
        result: ran([{ orderId: ORDER, action: "status_changed_not_flagged" }]),
        rows: { Order: { updated: { [ORDER]: { status: "cancelled" } } } },
        sdk: RETRIEVED,
      }),
    );
  });

  it("canceled: the order cancelled, its stock and its code's use back", async () => {
    await orderIn();
    network("paymentIntents.retrieve").mockResolvedValue(paidIntent({ status: "canceled" }));

    const seen = await record(() => runCron());

    expect(seen).toEqual(
      outcome({
        result: ran([{ orderId: ORDER, action: "reconciled_cancelled_restocked" }]),
        rows: { ...GIVEN_BACK, Order: { updated: { [ORDER]: { status: "cancelled" } } } },
        sdk: RETRIEVED,
      }),
    );
  });

  it("canceled, with the order cancelled while Stripe answered: nothing back twice", async () => {
    await orderIn();
    network("paymentIntents.retrieve").mockImplementation(async () => {
      await world.prisma.order.update({ where: { id: ORDER }, data: { status: "cancelled" } });
      return paidIntent({ status: "canceled" });
    });

    const seen = await record(() => runCron());

    expect(seen).toEqual(
      outcome({
        result: ran([{ orderId: ORDER, action: "already_cancelled" }]),
        rows: { Order: { updated: { [ORDER]: { status: "cancelled" } } } },
        sdk: RETRIEVED,
      }),
    );
  });

  it.each([
    ["requires_payment_method", "still_pending_requires_payment_method"],
    ["requires_action", "still_pending_requires_action"],
    ["processing", "unknown_status_processing"],
    ["requires_capture", "unknown_status_requires_capture"],
    ["requires_confirmation", "unknown_status_requires_confirmation"],
  ])("%s: left alone, and named in the run", async (status, action) => {
    await orderIn();
    network("paymentIntents.retrieve").mockResolvedValue(paidIntent({ status }));

    const seen = await record(() => runCron());

    expect(seen).toEqual(outcome({ result: ran([{ orderId: ORDER, action }]), sdk: RETRIEVED }));
  });

  it("Stripe fails on one order: named as an error, and the run goes on to the next", async () => {
    await another("first", { createdAt: minutesAgo(20) });
    await another("second", { createdAt: minutesAgo(10) });
    network("paymentIntents.retrieve").mockImplementation(async (id: string) => {
      if (id === "pi_first") throw new Error("stripe down");
      return { status: "requires_action" };
    });

    const seen = await record(() => runCron());

    expect(seen).toEqual(
      outcome({
        result: ran([
          { orderId: "first", action: "error" },
          { orderId: "second", action: "still_pending_requires_action" },
        ]),
        sdk: [
          ["paymentIntents.retrieve", "pi_first"],
          ["paymentIntents.retrieve", "pi_second"],
        ],
        logs: [["error", "[reconcile-cron] error processing first:", "Error: stripe down"]],
      }),
    );
  });

  it("a cancel that fails on the database: the same", async () => {
    await orderIn();
    network("paymentIntents.retrieve").mockResolvedValue(paidIntent({ status: "canceled" }));
    failing("$transaction");

    const seen = await record(() => runCron());

    expect(seen).toEqual(
      outcome({
        result: ran([{ orderId: ORDER, action: "error" }]),
        sdk: RETRIEVED,
        logs: [["error", `[reconcile-cron] error processing ${ORDER}:`, "Error: db down"]],
      }),
    );
  });

  it("a paid write that fails on the database: the same, and no mail", async () => {
    await orderIn();
    network("paymentIntents.retrieve").mockResolvedValue(paidIntent());
    failing("order.updateMany");

    const seen = await record(() => runCron());

    expect(seen).toEqual(
      outcome({
        result: ran([{ orderId: ORDER, action: "error" }]),
        sdk: RETRIEVED,
        logs: [["error", `[reconcile-cron] error processing ${ORDER}:`, "Error: db down"]],
      }),
    );
  });

  it("several orders, several answers: one result each, oldest first", async () => {
    await another("a", { createdAt: minutesAgo(30), totalDkk: 100 });
    await another("b", { createdAt: minutesAgo(20) });
    await another("c", { createdAt: minutesAgo(10) });
    const answers: Record<string, unknown> = {
      pi_a: { id: "pi_a", status: "succeeded", amount: 100, currency: base, payment_method_types: ["card"] },
      pi_b: { id: "pi_b", status: "requires_action" },
      pi_c: { id: "pi_c", status: "canceled" },
    };
    network("paymentIntents.retrieve").mockImplementation(async (id: string) => answers[id]);

    const seen = await record(() => runCron());

    expect(seen.result).toEqual(
      ran([
        { orderId: "a", action: "reconciled_paid" },
        { orderId: "b", action: "still_pending_requires_action" },
        { orderId: "c", action: "reconciled_cancelled_restocked" },
      ]),
    );
    expect(seen.rows.Order).toEqual({
      updated: {
        a: { status: "paid", paymentMethod: "stripe_card", paidAt: NOW, confirmationEmailSentAt: NOW },
        c: { status: "cancelled" },
      },
    });
  });
});
