import {
  BUYER,
  INTENT,
  MONEY,
  ORDER,
  failing,
  network,
  openTheShop,
  orderIn,
  outcome,
  price,
  record,
  sqlite,
  stripeNotConfigured,
  world,
} from "./shop";

import { beforeEach, describe, expect, it } from "vitest";

import { bulkUpdateStatus, issueRefund, refundReturn, updateOrderStatusAdmin } from "@/app/admin/ordrer/actions";
import { updateOrderStatus } from "@/lib/tools/orders";

/**
 * PAY-F1-0 (./shop.ts): every way money, or the record of money, goes back. The
 * operator's two refund actions call Stripe and leave the status to the
 * charge.refunded webhook (./webhook-charges-db.test.ts). A status moved by hand moves
 * no money and says so.
 */

openTheShop();

const ORDER_PAGE = [`/admin/ordrer/${ORDER}`];
const refundKey = (amount: number | "full") => ({ idempotencyKey: `refund_${ORDER}_${amount}` });

beforeEach(() => {
  network("refunds.create").mockImplementation(async (args: { amount?: number }) => ({
    id: "re_1",
    amount: args.amount ?? MONEY.totalDkk,
    status: "succeeded",
  }));
});

const issueRefundNote = (body: string, amount: number) => ({
  orderId: ORDER,
  type: "system",
  author: "user:admin",
  body,
  metaJson: { refundId: "re_1", amount },
});

describe.skipIf(!sqlite)("issueRefund, the order page's refund", () => {
  it("in full: no amount to Stripe, one note, one audit row, and the order itself untouched", async () => {
    await orderIn("paid");

    const seen = await record(() => issueRefund(ORDER, {}));

    const note = issueRefundNote(
      `Refund udstedt: ${price(MONEY.totalDkk)}. Status is finalised by the Stripe webhook.`,
      MONEY.totalDkk,
    );
    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          OrderNote: { inserted: [note] },
          AuditLog: {
            inserted: [
              {
                actor: "user:admin",
                tool: "orders.refund",
                argsJson: { orderId: ORDER, amountOere: null, reason: null },
                afterJson: note,
                ok: true,
                requestId: "<uuid>",
                modality: "text",
              },
            ],
          },
        },
        sdk: [["refunds.create", { payment_intent: INTENT, metadata: { orderId: ORDER } }, refundKey("full")]],
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it("in part, with a reason: the amount, the reason on Stripe's metadata and in the note", async () => {
    await orderIn("paid");

    const seen = await record(() => issueRefund(ORDER, { amountOere: 5000, reason: "damaged" }));

    const note = issueRefundNote(
      `Refund udstedt: ${price(5000)} (damaged). Status is finalised by the Stripe webhook.`,
      5000,
    );
    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          OrderNote: { inserted: [note] },
          AuditLog: {
            inserted: [
              {
                actor: "user:admin",
                tool: "orders.refund",
                argsJson: { orderId: ORDER, amountOere: 5000, reason: "damaged" },
                afterJson: note,
                ok: true,
                requestId: "<uuid>",
                modality: "text",
              },
            ],
          },
        },
        sdk: [
          [
            "refunds.create",
            { payment_intent: INTENT, amount: 5000, metadata: { orderId: ORDER, reason: "damaged" } },
            refundKey(5000),
          ],
        ],
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it("what Stripe answers is what the note says, not what was typed", async () => {
    await orderIn("paid");
    network("refunds.create").mockResolvedValue({ id: "re_9", amount: 4000, status: "pending" });

    const seen = await record(() => issueRefund(ORDER, { amountOere: 5000 }));

    expect(seen.rows.OrderNote?.inserted?.[0]).toMatchObject({
      body: `Refund udstedt: ${price(4000)}. Status is finalised by the Stripe webhook.`,
      metaJson: { refundId: "re_9", amount: 4000 },
    });
    expect(seen.rows.AuditLog?.inserted?.[0]).toMatchObject({
      argsJson: { orderId: ORDER, amountOere: 5000, reason: null },
    });
  });

  it("the smallest amount there is: allowed", async () => {
    await orderIn("paid");

    const seen = await record(() => issueRefund(ORDER, { amountOere: 1 }));

    expect(seen.result).toEqual({ ok: true });
    expect(seen.sdk[0]).toEqual([
      "refunds.create",
      { payment_intent: INTENT, amount: 1, metadata: { orderId: ORDER } },
      refundKey(1),
    ]);
  });

  it("exactly the order's total is still allowed, as an amount", async () => {
    await orderIn("paid");

    const seen = await record(() => issueRefund(ORDER, { amountOere: MONEY.totalDkk }));

    expect(seen.result).toEqual({ ok: true });
    expect(seen.sdk[0]).toEqual([
      "refunds.create",
      { payment_intent: INTENT, amount: MONEY.totalDkk, metadata: { orderId: ORDER } },
      refundKey(MONEY.totalDkk),
    ]);
  });

  it("an order charged in another currency: the amount at its own rate, rounded, for Stripe", async () => {
    await orderIn("paid", { currency: "XTS", fxRate: 0.5 });

    const seen = await record(() => issueRefund(ORDER, { amountOere: 5001 }));

    expect(seen.sdk).toEqual([
      [
        "refunds.create",
        { payment_intent: INTENT, amount: 2501, metadata: { orderId: ORDER } },
        refundKey(2501),
      ],
    ]);
    // Known: the note prints what Stripe answered, in the charge's currency, as a
    // base-currency price; the audit row keeps what the operator typed.
    expect(seen.rows.OrderNote?.inserted?.[0]).toMatchObject({
      body: `Refund udstedt: ${price(2501)}. Status is finalised by the Stripe webhook.`,
      metaJson: { refundId: "re_1", amount: 2501 },
    });
    expect(seen.rows.AuditLog?.inserted?.[0]).toMatchObject({
      argsJson: { orderId: ORDER, amountOere: 5001, reason: null },
    });
  });

  it("the same refund twice: the same key to Stripe, and a second note", async () => {
    await orderIn("paid");
    await issueRefund(ORDER, { amountOere: 5000 });

    const seen = await record(() => issueRefund(ORDER, { amountOere: 5000 }));

    expect(seen.sdk[0]).toEqual([
      "refunds.create",
      { payment_intent: INTENT, amount: 5000, metadata: { orderId: ORDER } },
      refundKey(5000),
    ]);
    expect(seen.rows.OrderNote?.inserted).toHaveLength(1);
  });

  it.each([
    ["an order the shop does not have", "ord_gone", {}, "Order not found"],
    ["a zero amount", ORDER, { amountOere: 0 }, "Invalid refund amount"],
    ["a negative amount", ORDER, { amountOere: -1 }, "Invalid refund amount"],
    ["a fraction of a minor unit", ORDER, { amountOere: 1.5 }, "Invalid refund amount"],
    ["more than the total", ORDER, { amountOere: MONEY.totalDkk + 1 }, "Refund amount exceeds order total"],
  ])("refused, %s: Stripe not asked, nothing written", async (_case, id, args, error) => {
    await orderIn("paid");

    const seen = await record(() => issueRefund(id, args));

    expect(seen).toEqual(outcome({ result: { ok: false, error } }));
  });

  // app/admin/ordrer/actions.ts:421: a quote is not an order yet, so it has nothing to refund.
  it("refused, a quote: Stripe not asked, nothing written", async () => {
    await orderIn("quote");

    const seen = await record(() => issueRefund(ORDER, {}));

    expect(seen).toEqual(
      outcome({ result: { ok: false, error: "This is a quote, not an order yet. Move it to awaiting payment first." } }),
    );
  });

  it("refused, an order with no Stripe payment", async () => {
    await orderIn("paid", { stripePaymentIntentId: null });

    const seen = await record(() => issueRefund(ORDER, {}));

    expect(seen).toEqual(
      outcome({
        result: {
          ok: false,
          error: "Order without a Stripe payment — refund it manually in the Stripe Dashboard.",
        },
      }),
    );
  });

  it("Stripe refuses: its reason back to the operator, nothing written", async () => {
    await orderIn("paid");
    network("refunds.create").mockRejectedValue(new Error("charge already refunded"));

    const seen = await record(() => issueRefund(ORDER, {}));

    expect(seen).toEqual(
      outcome({
        result: { ok: false, error: "Stripe-refund fejlede: charge already refunded" },
        sdk: [["refunds.create", { payment_intent: INTENT, metadata: { orderId: ORDER } }, refundKey("full")]],
      }),
    );
  });

  it("Stripe throws something that is not an error: the sentence without a reason", async () => {
    await orderIn("paid");
    network("refunds.create").mockRejectedValue("no");

    const seen = await record(() => issueRefund(ORDER, {}));

    expect(seen.result).toEqual({ ok: false, error: "Stripe-refund fejlede" });
    expect(seen.rows).toEqual({});
  });

  it("Stripe not configured", async () => {
    await orderIn("paid");
    stripeNotConfigured();

    const seen = await record(() => issueRefund(ORDER, {}));

    expect(seen).toEqual(outcome({ result: { ok: false, error: "Stripe is not configured" } }));
  });

  it("known: the note cannot be written: it throws, after Stripe has refunded, with a failed audit row", async () => {
    await orderIn("paid");
    failing("orderNote.create");

    const seen = await record(() =>
      issueRefund(ORDER, {}).catch((err: Error) => ({ threw: err.message })),
    );

    expect(seen).toEqual(
      outcome({
        result: { threw: "db down" },
        rows: {
          AuditLog: {
            inserted: [
              {
                actor: "user:admin",
                tool: "orders.refund",
                argsJson: { orderId: ORDER, amountOere: null, reason: null },
                ok: false,
                errorMsg: "db down",
                requestId: "<uuid>",
                modality: "text",
              },
            ],
          },
        },
        sdk: [["refunds.create", { payment_intent: INTENT, metadata: { orderId: ORDER } }, refundKey("full")]],
      }),
    );
  });
});

describe.skipIf(!sqlite)("refundReturn, a return's refund", () => {
  const RETURN = "ret-1";

  async function aReturn(over: Parameters<typeof orderIn>[1] = {}, status = "received") {
    await orderIn("shipped", over);
    await world.prisma.return.create({
      data: { id: RETURN, orderId: ORDER, status, reason: "damaged", restocked: true, createdBy: "user:admin" },
    });
  }

  it("in part: Stripe's refund on the return, a note, an audit row, the customer told", async () => {
    await aReturn();

    const seen = await record(() => refundReturn(RETURN, 5000));

    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          Return: { updated: { [RETURN]: { status: "refunded", refundDkk: 5000, stripeRefundId: "re_1" } } },
          OrderNote: {
            inserted: [
              {
                orderId: ORDER,
                type: "system",
                author: "user:admin",
                body: `Retur refunderet: ${price(5000)}`,
                metaJson: { refundId: "re_1", returnId: RETURN },
              },
            ],
          },
          AuditLog: {
            inserted: [
              {
                actor: "user:admin",
                tool: "orders.return_refund",
                argsJson: { returnId: RETURN, amountOere: 5000 },
                ok: true,
                requestId: "<uuid>",
                modality: "text",
              },
            ],
          },
        },
        sdk: [
          [
            "refunds.create",
            { payment_intent: INTENT, amount: 5000, metadata: { orderId: ORDER, reason: `return:${RETURN}` } },
            refundKey(5000),
          ],
        ],
        mails: [
          [
            "sendRefundConfirmationEmail",
            { orderId: ORDER, email: BUYER.email, shippingName: BUYER.shippingName, refundDkk: 5000, partial: true },
          ],
        ],
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  // Since #761 (bc9b2f52) the return, its note and the mail carry the base amount as
  // typed; only Stripe's refund id is taken from Stripe's answer.
  it("what was typed is what is written, what the note says and what the customer is told, whatever amount Stripe answers", async () => {
    await aReturn();
    network("refunds.create").mockResolvedValue({ id: "re_9", amount: 4000, status: "pending" });

    const seen = await record(() => refundReturn(RETURN, 5000));

    expect(seen.rows.Return).toEqual({
      updated: { [RETURN]: { status: "refunded", refundDkk: 5000, stripeRefundId: "re_9" } },
    });
    expect(seen.rows.OrderNote?.inserted?.[0]).toMatchObject({
      body: `Retur refunderet: ${price(5000)}`,
      metaJson: { refundId: "re_9", returnId: RETURN },
    });
    expect(seen.rows.AuditLog?.inserted?.[0]).toMatchObject({ argsJson: { returnId: RETURN, amountOere: 5000 } });
    expect(seen.mails).toEqual([
      [
        "sendRefundConfirmationEmail",
        { orderId: ORDER, email: BUYER.email, shippingName: BUYER.shippingName, refundDkk: 5000, partial: true },
      ],
    ]);
  });

  it("partial or not is what was typed against the total, not Stripe's answer", async () => {
    await aReturn();
    network("refunds.create").mockResolvedValue({ id: "re_9", amount: MONEY.totalDkk, status: "succeeded" });

    const seen = await record(() => refundReturn(RETURN, 5000));

    expect(seen.mails).toEqual([
      [
        "sendRefundConfirmationEmail",
        { orderId: ORDER, email: BUYER.email, shippingName: BUYER.shippingName, refundDkk: 5000, partial: true },
      ],
    ]);
  });

  it("the smallest amount there is: allowed", async () => {
    await aReturn();

    const seen = await record(() => refundReturn(RETURN, 1));

    expect(seen.result).toEqual({ ok: true });
    expect(seen.mails).toHaveLength(1);
    expect(seen.sdk).toEqual([
      [
        "refunds.create",
        { payment_intent: INTENT, amount: 1, metadata: { orderId: ORDER, reason: `return:${RETURN}` } },
        refundKey(1),
      ],
    ]);
    expect(seen.rows.Return).toEqual({
      updated: { [RETURN]: { status: "refunded", refundDkk: 1, stripeRefundId: "re_1" } },
    });
  });

  it("in full: the mail is not partial", async () => {
    await aReturn();

    const seen = await record(() => refundReturn(RETURN, MONEY.totalDkk));

    expect(seen.mails).toEqual([
      [
        "sendRefundConfirmationEmail",
        { orderId: ORDER, email: BUYER.email, shippingName: BUYER.shippingName, refundDkk: MONEY.totalDkk, partial: false },
      ],
    ]);
  });

  // #761 (bc9b2f52): Stripe gets the amount at the order's rate, the shop keeps the base amount.
  it("an order charged in another currency: Stripe gets the amount at its rate, the shop writes the base amount", async () => {
    await aReturn({ currency: "XTS", fxRate: 0.5 });

    const seen = await record(() => refundReturn(RETURN, 5000));

    expect(seen.sdk).toEqual([
      [
        "refunds.create",
        { payment_intent: INTENT, amount: 2500, metadata: { orderId: ORDER, reason: `return:${RETURN}` } },
        refundKey(2500),
      ],
    ]);
    expect(seen.rows.Return).toEqual({
      updated: { [RETURN]: { status: "refunded", refundDkk: 5000, stripeRefundId: "re_1" } },
    });
    expect(seen.rows.OrderNote?.inserted?.[0]).toMatchObject({ body: `Retur refunderet: ${price(5000)}` });
    expect(seen.mails).toEqual([
      [
        "sendRefundConfirmationEmail",
        { orderId: ORDER, email: BUYER.email, shippingName: BUYER.shippingName, refundDkk: 5000, partial: true },
      ],
    ]);
  });

  it("the mail fails: the refund stands, the operator hears nothing of it", async () => {
    await aReturn();
    world.mailFaults.set("sendRefundConfirmationEmail", new Error("mail down"));

    const seen = await record(() => refundReturn(RETURN, 5000));

    expect(seen.result).toEqual({ ok: true });
    expect(seen.rows.Return).toEqual({
      updated: { [RETURN]: { status: "refunded", refundDkk: 5000, stripeRefundId: "re_1" } },
    });
    expect(seen.logs).toEqual([]);
  });

  it("known: the return cannot be written: it throws, after Stripe has refunded, and the customer is not told", async () => {
    await aReturn();
    failing("$transaction");

    const seen = await record(() => refundReturn(RETURN, 5000).catch((err: Error) => ({ threw: err.message })));

    expect(seen.result).toEqual({ threw: "db down" });
    expect(seen.sdk).toHaveLength(1);
    expect(seen.mails).toEqual([]);
    expect(seen.rows.Return).toBeUndefined();
    expect(seen.rows.AuditLog?.inserted?.[0]).toMatchObject({ tool: "orders.return_refund", ok: false, errorMsg: "db down" });
  });

  it.each([
    ["a return the shop does not have", "ret-gone", 5000, "Return not found"],
    ["a zero amount", RETURN, 0, "Invalid refund amount"],
    ["a negative amount", RETURN, -5, "Invalid refund amount"],
    ["a fraction of a minor unit", RETURN, 1.5, "Invalid refund amount"],
    ["more than the total", RETURN, MONEY.totalDkk + 1, "Refund amount exceeds order total"],
  ])("refused, %s: Stripe not asked, nothing written", async (_case, id, amount, error) => {
    await aReturn();

    const seen = await record(() => refundReturn(id, amount));

    expect(seen).toEqual(outcome({ result: { ok: false, error } }));
  });

  // app/admin/ordrer/actions.ts:764: an old tab still shows the Refund box, so money
  // moves only on a return that is approved or received.
  it.each([["requested"], ["rejected"], ["refunded"]])(
    "refused, a %s return: Stripe not asked, nothing written",
    async (status) => {
      await aReturn({}, status);

      const seen = await record(() => refundReturn(RETURN, 5000));

      expect(seen).toEqual(outcome({ result: { ok: false, error: "Only an approved or received return can be refunded" } }));
    },
  );

  it("an approved return, not yet received: refunded", async () => {
    await aReturn({}, "approved");

    const seen = await record(() => refundReturn(RETURN, 5000));

    expect(seen.result).toEqual({ ok: true });
    expect(seen.rows.Return).toEqual({
      updated: { [RETURN]: { status: "refunded", refundDkk: 5000, stripeRefundId: "re_1" } },
    });
  });

  it("refused, an order with no Stripe payment", async () => {
    await aReturn({ stripePaymentIntentId: null });

    const seen = await record(() => refundReturn(RETURN, 5000));

    expect(seen).toEqual(outcome({ result: { ok: false, error: "Order without a Stripe payment — refund it manually." } }));
  });

  it("Stripe refuses: its reason back to the operator, the return as it was", async () => {
    await aReturn();
    network("refunds.create").mockRejectedValue(new Error("charge already refunded"));

    const seen = await record(() => refundReturn(RETURN, 5000));

    expect(seen.result).toEqual({ ok: false, error: "Stripe-refund fejlede: charge already refunded" });
    expect(seen.rows).toEqual({});
    expect(seen.mails).toEqual([]);
  });

  it("Stripe throws something that is not an error: the sentence without a reason", async () => {
    await aReturn();
    network("refunds.create").mockRejectedValue("no");

    const seen = await record(() => refundReturn(RETURN, 5000));

    expect(seen.result).toEqual({ ok: false, error: "Stripe-refund fejlede" });
  });

  it("Stripe not configured", async () => {
    await aReturn();
    stripeNotConfigured();

    const seen = await record(() => refundReturn(RETURN, 5000));

    expect(seen).toEqual(outcome({ result: { ok: false, error: "Stripe is not configured" } }));
  });
});

describe.skipIf(!sqlite)("a refund status moved by hand: no money moves, and the record says so", () => {
  it("the status form, refunded: the status and a note that no money moved, Stripe not asked", async () => {
    await orderIn("paid");

    const seen = await record(() => updateOrderStatusAdmin(ORDER, "refunded"));

    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          Order: { updated: { [ORDER]: { status: "refunded" } } },
          OrderNote: {
            inserted: [
              {
                orderId: ORDER,
                type: "system",
                author: "user:admin",
                body: "Manual registration — no money moved: Status: Paid → Refunded",
                metaJson: { from: "paid", to: "refunded", manual: true, moneyMoved: false },
              },
            ],
          },
          AuditLog: {
            inserted: [
              {
                actor: "user:admin",
                tool: "orders.update_status",
                argsJson: { orderId: ORDER, from: "paid", to: "refunded", manual: true, moneyMoved: false },
                beforeJson: { status: "paid" },
                afterJson: { restocked: false },
                ok: true,
                requestId: "<uuid>",
                modality: "text",
              },
            ],
          },
        },
        revalidated: [ORDER_PAGE, ["/admin/ordrer"]],
      }),
    );
  });

  it("the bulk action, partial_refund: the same wording", async () => {
    await orderIn("paid");

    const seen = await record(() => bulkUpdateStatus([ORDER], "partial_refund"));

    expect(seen.result).toEqual({ updated: 1, skipped: [] });
    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "partial_refund" } } });
    expect(seen.rows.OrderNote?.inserted).toEqual([
      {
        orderId: ORDER,
        type: "system",
        author: "user:admin",
        body: "Manual registration — no money moved: Status: Paid → Partially refunded",
        metaJson: { from: "paid", to: "partial_refund", manual: true, moneyMoved: false },
      },
    ]);
    expect(seen.sdk).toEqual([]);
    expect(seen.revalidated).toEqual([["/admin/ordrer"]]);
  });

  it("orders.update_status, refunded: the status, the note, moneyMoved false", async () => {
    await orderIn("paid");

    const seen = await record(() =>
      updateOrderStatus.handler({ orderId: ORDER, status: "refunded", manual: true, confirm: true }, { actor: "apikey:k1" }),
    );

    expect(seen).toEqual(
      outcome({
        result: { id: ORDER, status: "refunded", moneyMoved: false },
        rows: {
          Order: { updated: { [ORDER]: { status: "refunded" } } },
          OrderNote: {
            inserted: [
              {
                orderId: ORDER,
                type: "system",
                author: "apikey:k1",
                body: "Manual registration — no money moved: status set to refunded.",
                metaJson: { manual: true, moneyMoved: false },
              },
            ],
          },
          AuditLog: {
            inserted: [
              {
                actor: "apikey:k1",
                tool: "orders.update_status",
                argsJson: { orderId: ORDER, status: "refunded", manual: true, confirm: true },
                beforeJson: { status: "paid" },
                afterJson: { id: ORDER, status: "refunded", moneyMoved: false },
                ok: true,
                requestId: "<uuid>",
                modality: "text",
              },
            ],
          },
        },
      }),
    );
  });

  it("orders.update_status, partial_refund: the amount in the note", async () => {
    await orderIn("paid");

    const seen = await record(() =>
      updateOrderStatus.handler(
        { orderId: ORDER, status: "partial_refund", manual: true, confirm: true, refundDkk: 5000 },
        { actor: "apikey:k1" },
      ),
    );

    expect(seen.result).toEqual({ id: ORDER, status: "partial_refund", moneyMoved: false });
    expect(seen.rows.OrderNote?.inserted).toEqual([
      {
        orderId: ORDER,
        type: "system",
        author: "apikey:k1",
        body: "Manual registration — no money moved: status set to partial_refund (5000 øre refunded outside the shop).",
        metaJson: { manual: true, moneyMoved: false, refundDkk: 5000 },
      },
    ]);
  });

  it.each([
    [
      "without manual and confirm",
      { status: "refunded" },
      "refund_requires_payment_path: setting 'refunded' here moves no money. Refund the payment from the admin order page, or — to record a refund made outside the shop — send manual: true and confirm: true.",
    ],
    [
      "a partial refund with no amount",
      { status: "partial_refund", manual: true, confirm: true },
      "A manual partial_refund needs refundDkk (the amount refunded, in øre).",
    ],
    [
      "manual without confirm",
      { status: "refunded", manual: true },
      "refund_requires_payment_path: setting 'refunded' here moves no money. Refund the payment from the admin order page, or — to record a refund made outside the shop — send manual: true and confirm: true.",
    ],
    [
      "confirm without manual",
      { status: "partial_refund", confirm: true, refundDkk: 5000 },
      "refund_requires_payment_path: setting 'partial_refund' here moves no money. Refund the payment from the admin order page, or — to record a refund made outside the shop — send manual: true and confirm: true.",
    ],
    [
      "an amount on a full refund",
      { status: "refunded", manual: true, confirm: true, refundDkk: 5000 },
      "refundDkk is only accepted with status partial_refund.",
    ],
    [
      "an amount on any other move",
      { status: "shipped", refundDkk: 5000 },
      "refundDkk is only accepted with status partial_refund.",
    ],
    [
      "an amount that is not whole",
      { status: "partial_refund", manual: true, confirm: true, refundDkk: 1.5 },
      "refundDkk must be a positive whole number of øre.",
    ],
    [
      "an amount of nothing",
      { status: "partial_refund", manual: true, confirm: true, refundDkk: 0 },
      "refundDkk must be a positive whole number of øre.",
    ],
  ])("orders.update_status refuses %s, before anything is read", async (_case, args, message) => {
    await orderIn("paid");

    const seen = await record(() =>
      updateOrderStatus
        .handler({ orderId: ORDER, ...args } as never, { actor: "apikey:k1" })
        .catch((err: Error) => ({ threw: err.message })),
    );

    expect(seen).toEqual(outcome({ result: { threw: message } }));
  });

  it("orders.update_status takes one just under the total", async () => {
    await orderIn("paid");

    const seen = await record(() =>
      updateOrderStatus.handler(
        { orderId: ORDER, status: "partial_refund", manual: true, confirm: true, refundDkk: MONEY.totalDkk - 1 },
        { actor: "apikey:k1" },
      ),
    );

    expect(seen.result).toEqual({ id: ORDER, status: "partial_refund", moneyMoved: false });
  });

  it("orders.update_status takes one minor unit", async () => {
    await orderIn("paid");

    const seen = await record(() =>
      updateOrderStatus.handler(
        { orderId: ORDER, status: "partial_refund", manual: true, confirm: true, refundDkk: 1 },
        { actor: "apikey:k1" },
      ),
    );

    expect(seen.result).toEqual({ id: ORDER, status: "partial_refund", moneyMoved: false });
  });

  it("orders.update_status refuses an amount as large as the total: a full refund has its own status", async () => {
    await orderIn("paid");

    const seen = await record(() =>
      updateOrderStatus
        .handler(
          { orderId: ORDER, status: "partial_refund", manual: true, confirm: true, refundDkk: MONEY.totalDkk },
          { actor: "apikey:k1" },
        )
        .catch((err: Error) => ({ threw: err.message })),
    );

    expect(seen.result).toEqual({
      threw: `refundDkk (${MONEY.totalDkk}) must be below the order total (${MONEY.totalDkk}); a full refund is status refunded.`,
    });
    expect(seen.rows.Order).toBeUndefined();
    expect(seen.rows.AuditLog?.inserted?.[0]).toMatchObject({ ok: false, tool: "orders.update_status" });
  });
});
