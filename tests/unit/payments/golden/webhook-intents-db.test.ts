import {
  BASE_CURRENCY,
  CODE_ID,
  GIVEN_BACK,
  INTENT,
  MONEY,
  NOW,
  ORDER,
  RECEIVED,
  base,
  deliver,
  failing,
  openTheShop,
  orderIn,
  outcome,
  paidIntent,
  record,
  remembered,
  sqlite,
  world,
} from "./shop";

import { describe, expect, it } from "vitest";

/**
 * PAY-F1-0 (./shop.ts): every payment_intent event the Stripe webhook handles.
 * ../../on-order-paid-replay-db.test.ts holds what repeats, races and failing
 * mails do to the receipt, and is not repeated here.
 */

openTheShop();

const SUCCEEDED = "payment_intent.succeeded";
const FAILED = "payment_intent.payment_failed";
const CANCELED = "payment_intent.canceled";

const RECEIPT = {
  orderId: ORDER,
  email: "buyer@shop.example.test",
  shippingName: "Buyer Example",
  items: [
    { productName: "Fence Panel", quantity: 2, unitPriceDkk: 60000 },
    { productName: "Plain Mug", quantity: 2, unitPriceDkk: 12900 },
  ],
  ...MONEY,
  currency: BASE_CURRENCY,
  fxRate: 1,
};

describe.skipIf(!sqlite)("payment_intent.succeeded", () => {
  it("an order awaiting payment, charged what it says: paid, and the shop told", async () => {
    await orderIn();

    const seen = await record(() => deliver("evt_1", SUCCEEDED, paidIntent()));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: {
          ...remembered("evt_1", SUCCEEDED),
          Order: {
            updated: {
              [ORDER]: { status: "paid", paymentMethod: "stripe_card", paidAt: NOW, confirmationEmailSentAt: NOW },
            },
          },
        },
        mails: [
          ["sendOrderConfirmation", RECEIPT],
          [
            "sendOwnerNewOrderEmail",
            {
              ...RECEIPT,
              to: "owner@shop.example.test",
              adminUrl: `https://shop.example.test/admin/ordrer/${ORDER}`,
            },
          ],
        ],
        events: [
          ["cartwright.order.placed", "buyer@shop.example.test", { orderId: ORDER, totalDkk: MONEY.totalDkk, currency: BASE_CURRENCY, itemCount: 2 }],
        ],
      }),
    );
  });

  it.each(["pending", "flagged_review"])("from %s too: that is awaiting payment as well", async (status) => {
    await orderIn(status);

    const seen = await record(() => deliver("evt_1", SUCCEEDED, paidIntent()));

    expect(seen.rows.Order).toEqual({
      updated: {
        [ORDER]: { status: "paid", paymentMethod: "stripe_card", paidAt: NOW, confirmationEmailSentAt: NOW },
      },
    });
    expect(seen.mails.map(([mail]) => mail)).toEqual(["sendOrderConfirmation", "sendOwnerNewOrderEmail"]);
  });

  it.each([
    ["the method Stripe names first", { payment_method_types: ["mobilepay", "card"] }, "stripe_mobilepay"],
    ["no method list", { payment_method_types: undefined }, "stripe_card"],
    ["an empty method list", { payment_method_types: [] }, "stripe_card"],
  ])("the payment method: %s", async (_case, over, method) => {
    await orderIn();

    const seen = await record(() => deliver("evt_1", SUCCEEDED, paidIntent(over)));

    expect(seen.rows.Order?.updated?.[ORDER]).toMatchObject({ paymentMethod: method });
  });

  it("no order id in its metadata: a warning, nothing else", async () => {
    await orderIn();

    const seen = await record(() => deliver("evt_1", SUCCEEDED, paidIntent({ metadata: {} })));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: remembered("evt_1", SUCCEEDED),
        logs: [["warn", `[stripe-webhook] payment_intent.succeeded uden orderId-metadata: ${INTENT}`]],
      }),
    );
  });

  it("an order the shop does not have: a warning, nothing else", async () => {
    const seen = await record(() => deliver("evt_1", SUCCEEDED, paidIntent()));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: remembered("evt_1", SUCCEEDED),
        logs: [["warn", `[stripe-webhook] order ${ORDER} not found`]],
      }),
    );
  });

  it("an order already paid: nothing, not even a review row", async () => {
    await orderIn("paid");

    const seen = await record(() => deliver("evt_1", SUCCEEDED, paidIntent()));

    expect(seen).toEqual(outcome({ result: RECEIVED, rows: remembered("evt_1", SUCCEEDED) }));
  });

  it.each(["cancelled", "shipped", "processing", "delivered", "completed", "refunded", "partial_refund", "disputed", "legacy_status"])(
    "an order in %s: left as it is, with a row and a line for a person to review",
    async (status) => {
      await orderIn(status);

      // Not what the order says: the record is of what Stripe took.
      const seen = await record(() => deliver("evt_1", SUCCEEDED, paidIntent({ amount: 12345, currency: "xts" })));

      expect(seen).toEqual(
        outcome({
          result: RECEIVED,
          rows: {
            ...remembered("evt_1", SUCCEEDED),
            AuditLog: {
              inserted: [
                {
                  actor: "stripe-webhook:system",
                  tool: "orders.payment_not_applied",
                  argsJson: { orderId: ORDER, status, intentId: INTENT, amount: 12345, currency: "xts" },
                  afterJson: { note: "left unchanged — review manually" },
                  ok: true,
                  requestId: INTENT,
                },
              ],
            },
          },
          logs: [
            [
              "error",
              `[stripe-webhook] payment_intent.succeeded for order ${ORDER} in status ${status} ` +
                `(intent ${INTENT}, amount 12345 xts) — not awaiting payment; left unchanged, review manually`,
            ],
          ],
        }),
      );
    },
  );

  it("that review row failing to write changes nothing: Stripe must not retry", async () => {
    await orderIn("cancelled");
    failing("auditLog.create");

    const seen = await record(() => deliver("evt_1", SUCCEEDED, paidIntent()));

    expect(seen.result).toEqual(RECEIVED);
    expect(seen.rows).toEqual(remembered("evt_1", SUCCEEDED));
  });

  it.each([
    ["the wrong amount", { amount: 100 }, `100 ${base}`],
    ["the wrong currency", { currency: "xts" }, `${MONEY.totalDkk} xts`],
  ])("%s: flagged for review, no receipt, the figures in the log", async (_case, over, intentSaid) => {
    await orderIn();

    const seen = await record(() => deliver("evt_1", SUCCEEDED, paidIntent(over)));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: {
          ...remembered("evt_1", SUCCEEDED),
          Order: { updated: { [ORDER]: { status: "flagged_review" } } },
        },
        logs: [
          [
            "error",
            `[stripe-webhook] AMOUNT/CURRENCY MISMATCH for order ${ORDER}: ` +
              `intent=${intentSaid} vs expected=${MONEY.totalDkk} ${base} ` +
              `(totalDkk=${MONEY.totalDkk} fxRate=1) — flagging for manual review`,
          ],
        ],
      }),
    );
  });

  it("a currency in capitals is the same currency", async () => {
    await orderIn();

    const seen = await record(() => deliver("evt_1", SUCCEEDED, paidIntent({ currency: base.toUpperCase() })));

    expect(seen.rows.Order?.updated?.[ORDER]).toMatchObject({ status: "paid" });
  });

  it("an order charged in another currency is held to its own snapshot, not to its ledger total", async () => {
    await orderIn("pending_payment", { currency: "XTS", fxRate: 0.5 });

    const right = await record(() => deliver("evt_1", SUCCEEDED, paidIntent({ amount: 68060, currency: "xts" })));

    expect(right.rows.Order?.updated?.[ORDER]).toMatchObject({ status: "paid" });
  });

  it("the same order, charged its ledger total: flagged, with the snapshot in the log", async () => {
    await orderIn("pending_payment", { currency: "XTS", fxRate: 0.5 });

    const wrong = await record(() => deliver("evt_1", SUCCEEDED, paidIntent({ currency: "xts" })));

    expect(wrong.rows.Order).toEqual({ updated: { [ORDER]: { status: "flagged_review" } } });
    expect(wrong.logs).toEqual([
      [
        "error",
        `[stripe-webhook] AMOUNT/CURRENCY MISMATCH for order ${ORDER}: intent=${MONEY.totalDkk} xts vs expected=68060 xts ` +
          `(totalDkk=${MONEY.totalDkk} fxRate=0.5) — flagging for manual review`,
      ],
    ]);
  });

  it("flagged while an operator cancelled it: it stays cancelled, and the log says so", async () => {
    await orderIn();
    world.before.set("order.updateMany", () =>
      world.prisma.order.update({ where: { id: ORDER }, data: { status: "cancelled" } }),
    );

    const seen = await record(() => deliver("evt_1", SUCCEEDED, paidIntent({ amount: 100 })));

    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "cancelled" } } });
    expect(seen.logs).toEqual([
      ["error", expect.stringContaining("AMOUNT/CURRENCY MISMATCH")],
      [
        "error",
        `[stripe-webhook] order ${ORDER} changed while it was being flagged — left as it is now, review manually`,
      ],
    ]);
  });
});

describe.skipIf(!sqlite)("payment_intent.payment_failed", () => {
  it("names an order: the order stays open for another try, with the reason in the log", async () => {
    await orderIn();
    const declined = paidIntent({ status: "requires_payment_method", last_payment_error: { message: "Your card was declined." } });

    const seen = await record(() => deliver("evt_1", FAILED, declined));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: remembered("evt_1", FAILED),
        logs: [["warn", `[stripe-webhook] payment_failed for order ${ORDER}: Your card was declined.`]],
      }),
    );
  });

  it("gives no reason: the log says it does not know", async () => {
    await orderIn();

    const seen = await record(() => deliver("evt_1", FAILED, paidIntent()));

    expect(seen.logs).toEqual([["warn", `[stripe-webhook] payment_failed for order ${ORDER}: ukendt`]]);
    expect(seen.rows).toEqual(remembered("evt_1", FAILED));
  });

  it("names no order: nothing, not even a line", async () => {
    await orderIn();

    const seen = await record(() => deliver("evt_1", FAILED, paidIntent({ metadata: {} })));

    expect(seen).toEqual(outcome({ result: RECEIVED, rows: remembered("evt_1", FAILED) }));
  });
});

describe.skipIf(!sqlite)("payment_intent.canceled", () => {
  it("an order awaiting payment: cancelled, its stock and its code's use back", async () => {
    await orderIn();

    const seen = await record(() => deliver("evt_1", CANCELED, paidIntent({ status: "canceled" })));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: {
          ...remembered("evt_1", CANCELED),
          ...GIVEN_BACK,
          Order: { updated: { [ORDER]: { status: "cancelled" } } },
        },
      }),
    );
  });

  it("an order with no code: only its stock comes back", async () => {
    await orderIn("pending_payment", { discountCode: null });

    const seen = await record(() => deliver("evt_1", CANCELED, paidIntent({ status: "canceled" })));

    expect(seen.rows).toEqual({
      ...remembered("evt_1", CANCELED),
      Product: GIVEN_BACK.Product,
      ProductVariant: GIVEN_BACK.ProductVariant,
      Order: { updated: { [ORDER]: { status: "cancelled" } } },
    });
  });

  it("a code's last use comes back too", async () => {
    await orderIn();
    await world.prisma.discountCode.update({ where: { id: CODE_ID }, data: { usageCount: 1 } });

    const seen = await record(() => deliver("evt_1", CANCELED, paidIntent({ status: "canceled" })));

    expect(seen.rows.DiscountCode).toEqual({ updated: { [CODE_ID]: { usageCount: 0 } } });
  });

  it("a code whose uses are already at zero stays at zero", async () => {
    await orderIn();
    await world.prisma.discountCode.update({ where: { id: CODE_ID }, data: { usageCount: 0 } });

    const seen = await record(() => deliver("evt_1", CANCELED, paidIntent({ status: "canceled" })));

    expect(seen.rows.DiscountCode).toBeUndefined();
    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "cancelled" } } });
  });

  it.each(["paid", "cancelled", "shipped", "flagged_review", "refunded"])(
    "an order in %s: left as it is, no stock back, one line",
    async (status) => {
      await orderIn(status);

      const seen = await record(() => deliver("evt_1", CANCELED, paidIntent({ status: "canceled" })));

      expect(seen).toEqual(
        outcome({
          result: RECEIVED,
          rows: remembered("evt_1", CANCELED),
          logs: [
            [
              "info",
              `[stripe-webhook] payment_intent.canceled for order ${ORDER} (intent ${INTENT}): not awaiting payment — left unchanged`,
            ],
          ],
        }),
      );
    },
  );

  it("names an order the shop does not have: the same line", async () => {
    const seen = await record(() => deliver("evt_1", CANCELED, paidIntent({ status: "canceled" })));

    expect(seen.logs).toEqual([
      [
        "info",
        `[stripe-webhook] payment_intent.canceled for order ${ORDER} (intent ${INTENT}): not awaiting payment — left unchanged`,
      ],
    ]);
  });

  it("names no order: nothing", async () => {
    await orderIn();

    const seen = await record(() => deliver("evt_1", CANCELED, paidIntent({ status: "canceled", metadata: {} })));

    expect(seen).toEqual(outcome({ result: RECEIVED, rows: remembered("evt_1", CANCELED) }));
  });

  it("the cancel fails: still 200, nothing written, the cron gets it on its next run", async () => {
    await orderIn();
    failing("$transaction");

    const seen = await record(() => deliver("evt_1", CANCELED, paidIntent({ status: "canceled" })));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: remembered("evt_1", CANCELED),
        logs: [["error", `[stripe-webhook] kunne ikke cancel order ${ORDER}:`, "Error: db down"]],
      }),
    );
  });
});
