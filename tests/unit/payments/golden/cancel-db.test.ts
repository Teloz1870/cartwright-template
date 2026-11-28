import {
  GIVEN_BACK,
  INTENT,
  ORDER,
  failing,
  network,
  openTheShop,
  orderIn,
  outcome,
  record,
  sqlite,
  stripeNotConfigured,
  world,
} from "./shop";

import { describe, expect, it } from "vitest";

import { bulkUpdateStatus, updateOrderStatusAdmin } from "@/app/admin/ordrer/actions";
import { cancelOrderPaymentIntent } from "@/lib/orders/cancel-payment";
import { updateOrderStatus } from "@/lib/tools/orders";
import { invokeTool } from "@/lib/tools/registry";

/**
 * PAY-F1-0 (./shop.ts): an operator cancelling an order, and with it its Stripe
 * payment. The other cancel paths are in ./webhook-intents-db.test.ts,
 * ./reconcile-db.test.ts and ./checkout-db.test.ts.
 */

openTheShop();

const LIVE = { id: INTENT, status: "requires_payment_method" };
const CANCELED_NOTE = "Stripe payment cancelled — the customer can no longer pay for this order.";
const ALREADY_NOTE = "The Stripe payment was already cancelled.";
const PAID_NOTE =
  "The customer had already paid, so the Stripe payment was left as it is. " +
  "Cancelling the order does not return the money — issue a refund from this order page.";
const failedNote = (reason: string) =>
  `Could not cancel the Stripe payment (${reason}). Cancel it in the Stripe Dashboard; ` +
  "if the customer pays anyway, issue a refund from this order page.";

const paymentNote = (body: string, outcome: string, author = "user:admin") => ({
  orderId: ORDER,
  type: "system",
  author,
  body,
  metaJson: { intentId: INTENT, outcome },
});

const paymentAudit = (result: { outcome: string; note: string }, actor = "user:admin") => ({
  actor,
  tool: "orders.cancel_payment_intent",
  argsJson: { orderId: ORDER, intentId: INTENT },
  afterJson: result,
  ok: true,
  requestId: "<uuid>",
  modality: "text",
});

const failedAudit = (message: string) => ({
  actor: "user:admin",
  tool: "orders.cancel_payment_intent",
  argsJson: { orderId: ORDER, intentId: INTENT },
  ok: false,
  errorMsg: message,
  requestId: "<uuid>",
  modality: "text",
});

const cancelPayment = (paymentIntentId: string | null = INTENT) =>
  cancelOrderPaymentIntent({ orderId: ORDER, paymentIntentId, actor: "user:admin" });

const INFO = (outcome: string) => ["info", `[orders] payment intent ${INTENT} of cancelled order ${ORDER}: ${outcome}`];

describe.skipIf(!sqlite)("cancelOrderPaymentIntent", () => {
  it("a live payment: asked about, cancelled, a note and an audit row", async () => {
    await orderIn("cancelled");
    network("paymentIntents.retrieve").mockResolvedValue(LIVE);

    const seen = await record(() => cancelPayment());

    const result = { outcome: "canceled", note: CANCELED_NOTE };
    expect(seen).toEqual(
      outcome({
        result,
        rows: {
          OrderNote: { inserted: [paymentNote(CANCELED_NOTE, "canceled")] },
          AuditLog: { inserted: [paymentAudit(result)] },
        },
        sdk: [
          ["paymentIntents.retrieve", INTENT],
          ["paymentIntents.cancel", INTENT],
        ],
        logs: [INFO("canceled")],
      }),
    );
  });

  it("already cancelled at Stripe: asked about, left alone", async () => {
    await orderIn("cancelled");
    network("paymentIntents.retrieve").mockResolvedValue({ id: INTENT, status: "canceled" });

    const seen = await record(() => cancelPayment());

    const result = { outcome: "already_canceled", note: ALREADY_NOTE };
    expect(seen).toEqual(
      outcome({
        result,
        rows: {
          OrderNote: { inserted: [paymentNote(ALREADY_NOTE, "already_canceled")] },
          AuditLog: { inserted: [paymentAudit(result)] },
        },
        sdk: [["paymentIntents.retrieve", INTENT]],
        logs: [INFO("already_canceled")],
      }),
    );
  });

  it("the customer already paid: never cancelled, and the note says a refund is the way back", async () => {
    await orderIn("cancelled");
    network("paymentIntents.retrieve").mockResolvedValue({ id: INTENT, status: "succeeded" });

    const seen = await record(() => cancelPayment());

    const result = { outcome: "succeeded", note: PAID_NOTE };
    expect(seen).toEqual(
      outcome({
        result,
        rows: {
          OrderNote: { inserted: [paymentNote(PAID_NOTE, "succeeded")] },
          AuditLog: { inserted: [paymentAudit(result)] },
        },
        sdk: [["paymentIntents.retrieve", INTENT]],
        logs: [INFO("succeeded")],
      }),
    );
  });

  it("no Stripe payment: null, nothing written, Stripe not asked", async () => {
    await orderIn("cancelled");

    const seen = await record(() => cancelPayment(null));

    expect(seen).toEqual(outcome({ result: null }));
  });

  it("Stripe fails on the read: it does not throw, and the note tells the merchant what to do", async () => {
    await orderIn("cancelled");
    network("paymentIntents.retrieve").mockRejectedValue(new Error("stripe down"));

    const seen = await record(() => cancelPayment());

    expect(seen).toEqual(
      outcome({
        result: { outcome: "failed", note: failedNote("stripe down") },
        rows: {
          OrderNote: { inserted: [paymentNote(failedNote("stripe down"), "failed")] },
          AuditLog: { inserted: [failedAudit("stripe down")] },
        },
        sdk: [["paymentIntents.retrieve", INTENT]],
        logs: [["error", `[orders] payment intent ${INTENT} of cancelled order ${ORDER}: failed`]],
      }),
    );
  });

  it("the customer pays between the read and the cancel: Stripe's refusal lands the same way", async () => {
    await orderIn("cancelled");
    network("paymentIntents.retrieve").mockResolvedValue(LIVE);
    network("paymentIntents.cancel").mockRejectedValue(new Error("already succeeded"));

    const seen = await record(() => cancelPayment());

    expect(seen.result).toEqual({ outcome: "failed", note: failedNote("already succeeded") });
    expect(seen.sdk).toEqual([
      ["paymentIntents.retrieve", INTENT],
      ["paymentIntents.cancel", INTENT],
    ]);
    expect(seen.rows.AuditLog).toEqual({ inserted: [failedAudit("already succeeded")] });
  });

  it("Stripe throws something that is not an error: its text in the note", async () => {
    await orderIn("cancelled");
    network("paymentIntents.retrieve").mockRejectedValue("nope");

    const seen = await record(() => cancelPayment());

    expect(seen.result).toEqual({ outcome: "failed", note: failedNote("nope") });
  });

  it("Stripe not configured: failed, for that reason", async () => {
    await orderIn("cancelled");
    stripeNotConfigured();

    const seen = await record(() => cancelPayment());

    expect(seen).toEqual(
      outcome({
        result: { outcome: "failed", note: failedNote("Stripe is not configured") },
        rows: {
          OrderNote: { inserted: [paymentNote(failedNote("Stripe is not configured"), "failed")] },
          AuditLog: { inserted: [failedAudit("Stripe is not configured")] },
        },
        logs: [["error", `[orders] payment intent ${INTENT} of cancelled order ${ORDER}: failed`]],
      }),
    );
  });

  it("the note cannot be written: the result stands, and the log says so", async () => {
    await orderIn("cancelled");
    network("paymentIntents.retrieve").mockResolvedValue({ id: INTENT, status: "canceled" });
    failing("orderNote.create");

    const seen = await record(() => cancelPayment());

    expect(seen.result).toEqual({ outcome: "already_canceled", note: ALREADY_NOTE });
    expect(seen.rows.OrderNote).toBeUndefined();
    expect(seen.logs).toEqual([
      INFO("already_canceled"),
      ["error", `[orders] could not write the payment note for ${ORDER}:`, "Error: db down"],
    ]);
  });
});

const statusAudit = (args: Record<string, unknown>, restocked: boolean) => ({
  actor: "user:admin",
  tool: "orders.update_status",
  argsJson: { orderId: ORDER, ...args },
  beforeJson: { status: args.from },
  afterJson: { restocked },
  ok: true,
  requestId: "<uuid>",
  modality: "text",
});

const statusNote = (body: string, metaJson: Record<string, unknown>) => ({
  orderId: ORDER,
  type: "system",
  author: "user:admin",
  body,
  metaJson,
});

const ORDER_PAGES = [[`/admin/ordrer/${ORDER}`], ["/admin/ordrer"]];

describe.skipIf(!sqlite)("the admin status form, cancelling", () => {
  it("an order awaiting payment: cancelled, stock back, then the live payment cancelled", async () => {
    await orderIn();
    network("paymentIntents.retrieve").mockResolvedValue(LIVE);

    const seen = await record(() => updateOrderStatusAdmin(ORDER, "cancelled"));

    const result = { outcome: "canceled", note: CANCELED_NOTE };
    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          ...GIVEN_BACK,
          Order: { updated: { [ORDER]: { status: "cancelled" } } },
          OrderNote: {
            inserted: [
              statusNote("Status: Awaiting payment → Cancelled — items returned to stock", {
                from: "pending_payment",
                to: "cancelled",
                restocked: true,
              }),
              paymentNote(CANCELED_NOTE, "canceled"),
            ],
          },
          AuditLog: {
            inserted: [
              paymentAudit(result),
              statusAudit({ from: "pending_payment", to: "cancelled", restocked: true }, true),
            ],
          },
        },
        sdk: [
          ["paymentIntents.retrieve", INTENT],
          ["paymentIntents.cancel", INTENT],
        ],
        revalidated: ORDER_PAGES,
        logs: [INFO("canceled")],
      }),
    );
  });

  it("Stripe is asked after the status is written, never before", async () => {
    await orderIn();
    const statusWhenAsked: string[] = [];
    network("paymentIntents.retrieve").mockImplementation(async () => {
      const row = await world.prisma.order.findUniqueOrThrow({ where: { id: ORDER } });
      statusWhenAsked.push(row.status);
      return LIVE;
    });

    await updateOrderStatusAdmin(ORDER, "cancelled");

    expect(statusWhenAsked).toEqual(["cancelled"]);
  });

  it("a paid order: cancelled, no stock back, the payment left alone with a note about refunds", async () => {
    await orderIn("paid");
    network("paymentIntents.retrieve").mockResolvedValue({ id: INTENT, status: "succeeded" });

    const seen = await record(() => updateOrderStatusAdmin(ORDER, "cancelled"));

    const result = { outcome: "succeeded", note: PAID_NOTE };
    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          Order: { updated: { [ORDER]: { status: "cancelled" } } },
          OrderNote: {
            inserted: [
              statusNote("Status: Paid → Cancelled", { from: "paid", to: "cancelled" }),
              paymentNote(PAID_NOTE, "succeeded"),
            ],
          },
          AuditLog: {
            inserted: [paymentAudit(result), statusAudit({ from: "paid", to: "cancelled" }, false)],
          },
        },
        sdk: [["paymentIntents.retrieve", INTENT]],
        revalidated: ORDER_PAGES,
        logs: [INFO("succeeded")],
      }),
    );
  });

  it("an order with no Stripe payment: Stripe not asked, no second note", async () => {
    await orderIn("pending_payment", { stripePaymentIntentId: null });

    const seen = await record(() => updateOrderStatusAdmin(ORDER, "cancelled"));

    expect(seen.result).toEqual({ ok: true });
    expect(seen.sdk).toEqual([]);
    expect(seen.rows.OrderNote?.inserted).toHaveLength(1);
    expect(seen.rows.AuditLog?.inserted).toHaveLength(1);
  });

  it("Stripe failing does not undo the cancel", async () => {
    await orderIn();
    network("paymentIntents.retrieve").mockRejectedValue(new Error("stripe down"));

    const seen = await record(() => updateOrderStatusAdmin(ORDER, "cancelled"));

    expect(seen.result).toEqual({ ok: true });
    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "cancelled" } } });
    expect(seen.rows.OrderNote?.inserted).toContainEqual(paymentNote(failedNote("stripe down"), "failed"));
  });

  it("any other move: Stripe not asked", async () => {
    await orderIn("paid");

    const seen = await record(() => updateOrderStatusAdmin(ORDER, "shipped"));

    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          Order: { updated: { [ORDER]: { status: "shipped" } } },
          OrderNote: { inserted: [statusNote("Status: Paid → Shipped", { from: "paid", to: "shipped" })] },
          AuditLog: { inserted: [statusAudit({ from: "paid", to: "shipped" }, false)] },
        },
        revalidated: ORDER_PAGES,
      }),
    );
  });

  it.each([
    ["a status the engine does not have", ORDER, "nonsense", "Invalid status: nonsense"],
    ["an order the shop does not have", "ord_gone", "cancelled", "Order not found"],
  ])("refused, %s: nothing written, Stripe not asked", async (_case, id, to, error) => {
    await orderIn();

    const seen = await record(() => updateOrderStatusAdmin(id, to));

    expect(seen).toEqual(outcome({ result: { ok: false, error } }));
  });

  it("refused, a move the state machine forbids: nothing written, Stripe not asked", async () => {
    await orderIn("cancelled");

    const seen = await record(() => updateOrderStatusAdmin(ORDER, "cancelled"));

    expect(seen).toEqual(
      outcome({
        result: {
          ok: false,
          error: "Illegal order transition: cancelled → cancelled. Legal next states from cancelled: [(terminal)]",
        },
      }),
    );
  });

  it("a status left over from before the state machine: it cannot be checked, so it moves", async () => {
    await orderIn("legacy_status");

    const seen = await record(() => updateOrderStatusAdmin(ORDER, "shipped"));

    expect(seen.result).toEqual({ ok: true });
    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "shipped" } } });
  });

  it("the order was cancelled while the operator's move ran: told to reload, nothing written, Stripe not asked", async () => {
    await orderIn();
    world.before.set("$transaction", () =>
      world.prisma.order.update({ where: { id: ORDER }, data: { status: "cancelled" } }),
    );

    const seen = await record(() => updateOrderStatusAdmin(ORDER, "cancelled"));

    const error = `Order ${ORDER} is no longer awaiting payment — it changed while it was being cancelled. Reload the order and try again.`;
    expect(seen).toEqual(
      outcome({
        result: { ok: false, error },
        rows: {
          Order: { updated: { [ORDER]: { status: "cancelled" } } },
          AuditLog: {
            inserted: [
              {
                actor: "user:admin",
                tool: "orders.update_status",
                argsJson: { orderId: ORDER, from: "pending_payment", to: "cancelled", restocked: true },
                beforeJson: { status: "pending_payment" },
                ok: false,
                errorMsg: error,
                requestId: "<uuid>",
                modality: "text",
              },
            ],
          },
        },
      }),
    );
  });

  it("the same for any other move", async () => {
    await orderIn("paid");
    world.before.set("$transaction", () =>
      world.prisma.order.update({ where: { id: ORDER }, data: { status: "shipped" } }),
    );

    const seen = await record(() => updateOrderStatusAdmin(ORDER, "cancelled"));

    expect(seen.result).toEqual({
      ok: false,
      error: `Order ${ORDER} is no longer "Paid" — it changed while it was being updated. Reload the order and try again.`,
    });
    expect(seen.sdk).toEqual([]);
    expect(seen.revalidated).toEqual([]);
  });

  it("anything else that fails on the way: it throws, for the page's error boundary", async () => {
    await orderIn();
    failing("$transaction");

    const seen = await record(() =>
      updateOrderStatusAdmin(ORDER, "cancelled").catch((err: Error) => ({ threw: err.message })),
    );

    expect(seen.result).toEqual({ threw: "db down" });
    expect(seen.rows.Order).toBeUndefined();
    expect(seen.sdk).toEqual([]);
  });
});

describe.skipIf(!sqlite)("the bulk action, cancelling", () => {
  it("each order on its own: what could not move is named, and the page refreshed once", async () => {
    await orderIn();
    await world.prisma.order.create({
      data: {
        id: "ord_done",
        status: "cancelled",
        email: "other@shop.example.test",
        shippingName: "Other",
        shippingAddress: "Road 1",
        shippingZip: "1234",
        shippingCity: "Town",
        subtotalDkk: 100,
        shippingDkk: 0,
        totalDkk: 100,
      },
    });
    network("paymentIntents.retrieve").mockResolvedValue(LIVE);

    const seen = await record(() => bulkUpdateStatus([ORDER, "ord_done", "ord_gone"], "cancelled"));

    expect(seen.result).toEqual({
      updated: 1,
      skipped: [
        {
          id: "ord_done",
          reason: "Illegal order transition: cancelled → cancelled. Legal next states from cancelled: [(terminal)]",
        },
        { id: "ord_gone", reason: "Order not found" },
      ],
    });
    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "cancelled" } } });
    expect(seen.sdk).toEqual([
      ["paymentIntents.retrieve", INTENT],
      ["paymentIntents.cancel", INTENT],
    ]);
    expect(seen.revalidated).toEqual([["/admin/ordrer"]]);
  });
});

describe.skipIf(!sqlite)("orders.update_status, cancelling", () => {
  const AGENT = { actor: "apikey:k1" } as const;

  it("an order awaiting payment: restocked, the payment's fate in the answer", async () => {
    await orderIn();
    network("paymentIntents.retrieve").mockResolvedValue(LIVE);

    const seen = await record(() => updateOrderStatus.handler({ orderId: ORDER, status: "cancelled" }, AGENT));

    const paymentIntent = { outcome: "canceled", note: CANCELED_NOTE };
    const answer = { id: ORDER, status: "cancelled", restocked: true, paymentIntent };
    expect(seen).toEqual(
      outcome({
        result: answer,
        rows: {
          ...GIVEN_BACK,
          Order: { updated: { [ORDER]: { status: "cancelled" } } },
          OrderNote: {
            inserted: [
              {
                orderId: ORDER,
                type: "system",
                author: "apikey:k1",
                body: "Status: Awaiting payment → Cancelled — items returned to stock",
                metaJson: { from: "pending_payment", to: "cancelled", restocked: true },
              },
              paymentNote(CANCELED_NOTE, "canceled", "apikey:k1"),
            ],
          },
          AuditLog: {
            inserted: [
              {
                actor: "apikey:k1",
                tool: "orders.update_status",
                argsJson: { orderId: ORDER, status: "cancelled" },
                beforeJson: { status: "pending_payment" },
                afterJson: answer,
                ok: true,
                requestId: "<uuid>",
                modality: "text",
              },
              paymentAudit(paymentIntent, "apikey:k1"),
            ],
          },
        },
        sdk: [
          ["paymentIntents.retrieve", INTENT],
          ["paymentIntents.cancel", INTENT],
        ],
        logs: [INFO("canceled")],
      }),
    );
    expect(updateOrderStatus.output.safeParse(seen.result).success).toBe(true);
  });

  it("Stripe is asked after the status is written, never before", async () => {
    await orderIn();
    const statusWhenAsked: string[] = [];
    network("paymentIntents.retrieve").mockImplementation(async () => {
      const row = await world.prisma.order.findUniqueOrThrow({ where: { id: ORDER } });
      statusWhenAsked.push(row.status);
      return LIVE;
    });

    await updateOrderStatus.handler({ orderId: ORDER, status: "cancelled" }, AGENT);

    expect(statusWhenAsked).toEqual(["cancelled"]);
  });

  it("who called is in the audit row", async () => {
    await orderIn("paid");

    const seen = await record(() =>
      updateOrderStatus.handler(
        { orderId: ORDER, status: "shipped" },
        { ...AGENT, ip: "203.0.113.9", userAgent: "agent/1.0" },
      ),
    );

    expect(seen.rows.AuditLog?.inserted).toEqual([
      expect.objectContaining({ tool: "orders.update_status", ip: "203.0.113.9", userAgent: "agent/1.0" }),
    ]);
  });

  it("a paid order: not restocked, the payment left alone", async () => {
    await orderIn("paid");
    network("paymentIntents.retrieve").mockResolvedValue({ id: INTENT, status: "succeeded" });

    const seen = await record(() => updateOrderStatus.handler({ orderId: ORDER, status: "cancelled" }, AGENT));

    expect(seen.result).toEqual({
      id: ORDER,
      status: "cancelled",
      paymentIntent: { outcome: "succeeded", note: PAID_NOTE },
    });
    expect(seen.rows.Product).toBeUndefined();
  });

  it("an order with no Stripe payment: no paymentIntent in the answer", async () => {
    await orderIn("pending_payment", { stripePaymentIntentId: null });

    const seen = await record(() => updateOrderStatus.handler({ orderId: ORDER, status: "cancelled" }, AGENT));

    expect(seen.result).toEqual({ id: ORDER, status: "cancelled", restocked: true });
    expect(seen.sdk).toEqual([]);
  });

  it("any other move: Stripe not asked", async () => {
    await orderIn("paid");

    const seen = await record(() => updateOrderStatus.handler({ orderId: ORDER, status: "shipped" }, AGENT));

    expect(seen.result).toEqual({ id: ORDER, status: "shipped" });
    expect(seen.sdk).toEqual([]);
  });

  it("a status left over from before the state machine: it cannot be checked, so it moves", async () => {
    await orderIn("legacy_status");

    const seen = await record(() => updateOrderStatus.handler({ orderId: ORDER, status: "shipped" }, AGENT));

    expect(seen.result).toEqual({ id: ORDER, status: "shipped" });
    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "shipped" } } });
  });

  it("a move the state machine forbids: it throws, with a failed audit row, and Stripe not asked", async () => {
    await orderIn("cancelled");

    const seen = await record(() =>
      updateOrderStatus
        .handler({ orderId: ORDER, status: "cancelled" }, AGENT)
        .catch((err: Error) => ({ threw: err.message })),
    );

    const message = "Illegal order transition: cancelled → cancelled. Legal next states from cancelled: [(terminal)]";
    expect(seen).toEqual(
      outcome({
        result: { threw: message },
        rows: {
          AuditLog: {
            inserted: [
              {
                actor: "apikey:k1",
                tool: "orders.update_status",
                argsJson: { orderId: ORDER, status: "cancelled" },
                beforeJson: { status: "cancelled" },
                ok: false,
                errorMsg: message,
                requestId: "<uuid>",
                modality: "text",
              },
            ],
          },
        },
      }),
    );
  });

  it.each([
    ["a status the engine does not have", { orderId: ORDER, status: "nonsense" }, expect.any(String)],
    ["no order id", { orderId: "", status: "cancelled" }, expect.any(String)],
    ["no order id at all", { status: "cancelled" }, expect.any(String)],
    ["no status at all", { orderId: ORDER }, expect.any(String)],
    [
      "a refund status with no manual flag",
      { orderId: ORDER, status: "refunded" },
      "refund_requires_payment_path: setting 'refunded' here moves no money. Refund the payment from the admin order page, or — to record a refund made outside the shop — send manual: true and confirm: true.",
    ],
    [
      "an amount on any other move",
      { orderId: ORDER, status: "shipped", refundDkk: 100 },
      "refundDkk is only accepted with status partial_refund.",
    ],
    ["an amount that is not whole", { orderId: ORDER, status: "partial_refund", manual: true, confirm: true, refundDkk: 1.5 }, expect.any(String)],
  ])("%s: 422 from the dispatcher, nothing read", async (_case, args, error) => {
    await orderIn("paid");

    const seen = await record(() => invokeTool("orders.update_status", args, AGENT, ["orders:write"]));

    expect(seen).toEqual(outcome({ result: { ok: false, status: 422, error, issues: expect.any(Array) } }));
  });

  it("the guard's own words land on the status field", async () => {
    await orderIn("paid");

    const seen = await record(() =>
      invokeTool("orders.update_status", { orderId: ORDER, status: "refunded" }, AGENT, ["orders:write"]),
    );

    expect((seen.result as { issues: { code: string; path: string[] }[] }).issues).toEqual([
      expect.objectContaining({ code: "custom", path: ["status"] }),
    ]);
  });

  it("a caller without the scope: 403, nothing read", async () => {
    await orderIn("paid");

    const seen = await record(() =>
      invokeTool("orders.update_status", { orderId: ORDER, status: "shipped" }, AGENT, ["orders:read"]),
    );

    expect(seen).toEqual(
      outcome({ result: { ok: false, status: 403, error: "Tool 'orders.update_status' requires scope: orders:write" } }),
    );
  });

  it("an order the shop does not have: it throws", async () => {
    const seen = await record(() =>
      updateOrderStatus
        .handler({ orderId: "ord_gone", status: "cancelled" }, AGENT)
        .catch((err: Error) => ({ threw: err.message })),
    );

    expect(seen.result).toEqual({ threw: "Order not found: ord_gone" });
    expect(seen.sdk).toEqual([]);
  });
});
