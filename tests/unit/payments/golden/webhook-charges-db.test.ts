import {
  INTENT,
  MONEY,
  NOW,
  ORDER,
  RECEIVED,
  deliver,
  failing,
  openTheShop,
  orderIn,
  outcome,
  record,
  remembered,
  sqlite,
} from "./shop";

import { describe, expect, it } from "vitest";

/** PAY-F1-0 (./shop.ts): charge.refunded and charge.dispute.created. */

openTheShop();

const REFUNDED = "charge.refunded";
const DISPUTED = "charge.dispute.created";

const charge = (over: Record<string, unknown> = {}) => ({
  id: "ch_1",
  object: "charge",
  amount: MONEY.totalDkk,
  amount_refunded: MONEY.totalDkk,
  payment_intent: INTENT,
  metadata: {},
  ...over,
});

const refundAudit = (amount_refunded: number, partial: boolean) => ({
  actor: "stripe-webhook:system",
  tool: "orders.refund",
  argsJson: { orderId: ORDER, amount: MONEY.totalDkk, amount_refunded, partial },
  ok: true,
  requestId: "ch_1",
});

describe.skipIf(!sqlite)("charge.refunded", () => {
  it("in full, found through its payment intent: refunded, stamped, one audit row, no stock back", async () => {
    await orderIn("paid");

    const seen = await record(() => deliver("evt_1", REFUNDED, charge()));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: {
          ...remembered("evt_1", REFUNDED),
          Order: { updated: { [ORDER]: { status: "refunded", refundedAt: NOW } } },
          AuditLog: { inserted: [refundAudit(MONEY.totalDkk, false)] },
        },
      }),
    );
  });

  it("in part: partial_refund, and the audit row says so", async () => {
    await orderIn("paid");

    const seen = await record(() => deliver("evt_1", REFUNDED, charge({ amount_refunded: 5000 })));

    expect(seen.rows).toEqual({
      ...remembered("evt_1", REFUNDED),
      Order: { updated: { [ORDER]: { status: "partial_refund", refundedAt: NOW } } },
      AuditLog: { inserted: [refundAudit(5000, true)] },
    });
  });

  it.each([1, MONEY.totalDkk - 1])("%i refunded is a part, however small or large", async (refunded) => {
    await orderIn("paid");

    const seen = await record(() => deliver("evt_1", REFUNDED, charge({ amount_refunded: refunded })));

    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "partial_refund", refundedAt: NOW } } });
  });

  it("a part, then the rest: partial_refund, then refunded", async () => {
    await orderIn("paid");
    await deliver("evt_1", REFUNDED, charge({ amount_refunded: 5000 }));

    const seen = await record(() => deliver("evt_2", REFUNDED, charge()));

    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "refunded" } } });
    expect(seen.rows.AuditLog).toEqual({ inserted: [refundAudit(MONEY.totalDkk, false)] });
  });

  it("known: nothing refunded yet reads as refunded in full", async () => {
    await orderIn("paid");

    const seen = await record(() => deliver("evt_1", REFUNDED, charge({ amount_refunded: 0 })));

    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "refunded", refundedAt: NOW } } });
    expect(seen.rows.AuditLog).toEqual({ inserted: [refundAudit(0, false)] });
  });

  it("the order id on the charge itself wins over its payment intent", async () => {
    await orderIn("paid", { stripePaymentIntentId: "pi_another" });

    const seen = await record(() => deliver("evt_1", REFUNDED, charge({ metadata: { orderId: ORDER } })));

    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "refunded", refundedAt: NOW } } });
  });

  it("a payment intent given as an object is read the same", async () => {
    await orderIn("paid");

    const seen = await record(() => deliver("evt_1", REFUNDED, charge({ payment_intent: { id: INTENT } })));

    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "refunded", refundedAt: NOW } } });
  });

  it.each(["shipped", "cancelled", "disputed", "pending_payment", "refunded"])(
    "written over %s: money went back, whatever the order says",
    async (status) => {
      await orderIn(status);

      const seen = await record(() => deliver("evt_1", REFUNDED, charge()));

      const written = status === "refunded" ? { refundedAt: NOW } : { status: "refunded", refundedAt: NOW };
      expect(seen.rows.Order).toEqual({ updated: { [ORDER]: written } });
    },
  );

  it("an order nobody can find: a warning, no row", async () => {
    await orderIn("paid");

    const seen = await record(() => deliver("evt_1", REFUNDED, charge({ payment_intent: "pi_stranger" })));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: remembered("evt_1", REFUNDED),
        logs: [["warn", "[stripe-webhook] charge.refunded — kunne ikke resolve order (payment_intent: pi_stranger)"]],
      }),
    );
  });

  it("no payment intent either: the same warning", async () => {
    await orderIn("paid");

    const seen = await record(() => deliver("evt_1", REFUNDED, charge({ payment_intent: null })));

    expect(seen.logs).toEqual([
      ["warn", "[stripe-webhook] charge.refunded — kunne ikke resolve order (payment_intent: null)"],
    ]);
    expect(seen.rows).toEqual(remembered("evt_1", REFUNDED));
  });

  it("known: an order id on the charge that matches nothing still gets its audit row", async () => {
    const seen = await record(() => deliver("evt_1", REFUNDED, charge({ metadata: { orderId: "ord_gone" } })));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: {
          ...remembered("evt_1", REFUNDED),
          AuditLog: {
            inserted: [
              {
                actor: "stripe-webhook:system",
                tool: "orders.refund",
                argsJson: { orderId: "ord_gone", amount: MONEY.totalDkk, amount_refunded: MONEY.totalDkk, partial: false },
                ok: true,
                requestId: "ch_1",
              },
            ],
          },
        },
        logs: [["error", "[stripe-webhook] kunne ikke refund order ord_gone:", expect.any(String)]],
      }),
    );
  });

  it("the status write fails: 200 all the same, a line, and the audit row", async () => {
    await orderIn("paid");
    failing("order.update");

    const seen = await record(() => deliver("evt_1", REFUNDED, charge()));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: {
          ...remembered("evt_1", REFUNDED),
          AuditLog: { inserted: [refundAudit(MONEY.totalDkk, false)] },
        },
        logs: [["error", `[stripe-webhook] kunne ikke refund order ${ORDER}:`, "Error: db down"]],
      }),
    );
  });

  it("the audit row fails: 200, the order written, not a word", async () => {
    await orderIn("paid");
    failing("auditLog.create");

    const seen = await record(() => deliver("evt_1", REFUNDED, charge()));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: {
          ...remembered("evt_1", REFUNDED),
          Order: { updated: { [ORDER]: { status: "refunded", refundedAt: NOW } } },
        },
      }),
    );
  });
});

const dispute = (over: Record<string, unknown> = {}) => ({
  id: "dp_1",
  object: "dispute",
  charge: "ch_1",
  payment_intent: INTENT,
  reason: "fraudulent",
  amount: 12345,
  ...over,
});

const DISPUTE_AUDIT = {
  actor: "stripe-webhook:system",
  tool: "orders.dispute",
  argsJson: { orderId: ORDER, disputeId: "dp_1", reason: "fraudulent", amount: 12345 },
  ok: true,
  requestId: "dp_1",
};

describe.skipIf(!sqlite)("charge.dispute.created", () => {
  it("disputed, stamped, one audit row", async () => {
    await orderIn("paid");

    const seen = await record(() => deliver("evt_1", DISPUTED, dispute()));

    expect(seen).toEqual(
      outcome({
        result: RECEIVED,
        rows: {
          ...remembered("evt_1", DISPUTED),
          Order: { updated: { [ORDER]: { status: "disputed", disputedAt: NOW } } },
          AuditLog: { inserted: [DISPUTE_AUDIT] },
        },
      }),
    );
  });

  it("a charge and a payment intent given as objects are read the same", async () => {
    await orderIn("paid");

    const seen = await record(() =>
      deliver("evt_1", DISPUTED, dispute({ charge: { id: "ch_1" }, payment_intent: { id: INTENT } })),
    );

    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "disputed", disputedAt: NOW } } });
  });

  it.each(["shipped", "cancelled", "refunded"])("written over %s: the customer disputed, whatever the order says", async (status) => {
    await orderIn(status);

    const seen = await record(() => deliver("evt_1", DISPUTED, dispute()));

    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { status: "disputed", disputedAt: NOW } } });
  });

  it.each([
    ["no charge", { charge: null }, "[stripe-webhook] dispute.created uden charge: dp_1"],
    ["no payment intent", { payment_intent: null }, "[stripe-webhook] dispute.created uden payment_intent: dp_1"],
    ["a payment intent nobody knows", { payment_intent: "pi_stranger" }, "[stripe-webhook] dispute for ukendt PI pi_stranger: dp_1"],
  ])("%s: a warning, no row", async (_case, over, line) => {
    await orderIn("paid");

    const seen = await record(() => deliver("evt_1", DISPUTED, dispute(over)));

    expect(seen).toEqual(outcome({ result: RECEIVED, rows: remembered("evt_1", DISPUTED), logs: [["warn", line]] }));
  });

  it("the status write fails: 500 and Sentry, and no audit row", async () => {
    await orderIn("paid");
    failing("order.update");

    const seen = await record(() => deliver("evt_1", DISPUTED, dispute()));

    expect(seen).toEqual(
      outcome({
        result: { status: 500, body: { error: "Handler failed" } },
        rows: remembered("evt_1", DISPUTED),
        sentry: [
          [new Error("db down"), { tags: { source: "stripe-webhook", eventType: DISPUTED }, extra: { eventId: "evt_1" } }],
        ],
        logs: [["error", `[stripe-webhook] handler for ${DISPUTED} failed:`, "Error: db down"]],
      }),
    );
  });

  it("known: the audit row fails after the status landed: 500, with the order already disputed", async () => {
    await orderIn("paid");
    failing("auditLog.create");

    const seen = await record(() => deliver("evt_1", DISPUTED, dispute()));

    expect(seen.result).toEqual({ status: 500, body: { error: "Handler failed" } });
    expect(seen.rows).toEqual({
      ...remembered("evt_1", DISPUTED),
      Order: { updated: { [ORDER]: { status: "disputed", disputedAt: NOW } } },
    });
    expect(seen.sentry).toHaveLength(1);
  });
});
