import {
  BUYER,
  MONEY,
  NOW,
  ORDER,
  failing,
  minutesAgo,
  openTheShop,
  orderIn,
  outcome,
  record,
  sqlite,
  world,
} from "./shop";

import { describe, expect, it } from "vitest";

import {
  addOrderNote,
  approveReturn,
  bulkUpdateStatus,
  createFulfillment,
  createReturn,
  issueRefund,
  listOrdersPage,
  receiveAndRestock,
  refundReturn,
  rejectReturn,
  resendConfirmation,
  sendShippingNotification,
  setTracking,
  updateOrderStatusAdmin,
} from "@/app/admin/ordrer/actions";

/**
 * PAY-F1-0 (./shop.ts): the rest of the order workspace's actions. PAY-F1-b edits this
 * file for its refund and cancel paths (./refund-db.test.ts, ./cancel-db.test.ts), so
 * what sits beside them is held too. None of these call Stripe; each literal says so.
 */

openTheShop();

const ORDER_PAGE = [`/admin/ordrer/${ORDER}`];

const note = (body: string, over: Record<string, unknown> = {}) => ({
  orderId: ORDER,
  type: "system",
  author: "user:admin",
  body,
  ...over,
});

const audit = (tool: string, argsJson: unknown, over: Record<string, unknown> = {}) => ({
  actor: "user:admin",
  tool,
  argsJson,
  ok: true,
  requestId: "<uuid>",
  modality: "text",
  ...over,
});

describe.skipIf(!sqlite)("every action asks who is asking, before anything else", () => {
  it.each([
    ["listOrdersPage", () => listOrdersPage({})],
    ["updateOrderStatusAdmin", () => updateOrderStatusAdmin(ORDER, "cancelled")],
    ["bulkUpdateStatus", () => bulkUpdateStatus([ORDER], "cancelled")],
    ["addOrderNote", () => addOrderNote(ORDER, "a note")],
    ["setTracking", () => setTracking(ORDER, { carrier: "PostNord" })],
    ["resendConfirmation", () => resendConfirmation(ORDER)],
    ["sendShippingNotification", () => sendShippingNotification(ORDER)],
    ["issueRefund", () => issueRefund(ORDER, {})],
    ["createFulfillment", () => createFulfillment(ORDER)],
    ["createReturn", () => createReturn(ORDER, { items: [{ orderItemId: "line-plain", quantity: 1 }], reason: "damaged" })],
    ["approveReturn", () => approveReturn("ret-1")],
    ["rejectReturn", () => rejectReturn("ret-1", "no")],
    ["receiveAndRestock", () => receiveAndRestock("ret-1")],
    ["refundReturn", () => refundReturn("ret-1", 5000)],
  ])("%s, from anyone but an admin: refused, nothing read or written", async (_name, action) => {
    await orderIn("paid");
    await world.prisma.return.create({
      data: { id: "ret-1", orderId: ORDER, status: "requested", reason: "damaged", createdBy: "user:admin" },
    });
    world.admin = null;

    const seen = await record(() => (action() as Promise<unknown>).catch((err: Error) => ({ threw: err.message })));

    expect(seen).toEqual(outcome({ result: { threw: "not an admin" } }));
  });
});

describe.skipIf(!sqlite)("an operator's note", () => {
  it("private, trimmed, audited", async () => {
    await orderIn("paid");

    const seen = await record(() => addOrderNote(ORDER, "  called the customer  "));

    const written = note("called the customer", { type: "private" });
    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          OrderNote: { inserted: [written] },
          AuditLog: { inserted: [audit("orders.note", { orderId: ORDER }, { afterJson: { ...written, metaJson: null } })] },
        },
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it("empty: refused", async () => {
    await orderIn("paid");

    const seen = await record(() => addOrderNote(ORDER, "   "));

    expect(seen).toEqual(outcome({ result: { ok: false, error: "The note is empty" } }));
  });
});

describe.skipIf(!sqlite)("tracking", () => {
  it("every field: on the order, in a note, in the audit", async () => {
    await orderIn("paid");

    const seen = await record(() =>
      setTracking(ORDER, {
        carrier: " PostNord ",
        trackingNumber: " 123 ",
        trackingUrl: " https://track.example.test/123 ",
        estDeliveryFrom: "2026-11-02",
        estDeliveryTo: "2026-11-04",
      }),
    );

    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          Order: {
            updated: {
              [ORDER]: {
                carrier: "PostNord",
                trackingNumber: "123",
                trackingUrl: "https://track.example.test/123",
                estDeliveryFrom: "2026-11-02T00:00:00.000Z",
                estDeliveryTo: "2026-11-04T00:00:00.000Z",
              },
            },
          },
          OrderNote: {
            inserted: [
              note("Tracking updated: PostNord 123", {
                metaJson: { carrier: "PostNord", trackingNumber: "123", trackingUrl: "https://track.example.test/123" },
              }),
            ],
          },
          AuditLog: {
            inserted: [audit("orders.set_tracking", { orderId: ORDER, carrier: "PostNord", trackingNumber: "123" })],
          },
        },
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it("nothing given: the fields cleared, a dash in the note", async () => {
    await orderIn("paid", { carrier: "PostNord", trackingNumber: "123" });

    const seen = await record(() => setTracking(ORDER, {}));

    expect(seen.rows.Order).toEqual({ updated: { [ORDER]: { carrier: null, trackingNumber: null } } });
    expect(seen.rows.OrderNote?.inserted).toEqual([
      note("Tracking updated: —", { metaJson: { carrier: null, trackingNumber: null, trackingUrl: null } }),
    ]);
  });
});

describe.skipIf(!sqlite)("mails an operator asks for", () => {
  it("the receipt again: refused for an order the shop does not have", async () => {
    const seen = await record(() => resendConfirmation("ord_gone"));

    expect(seen).toEqual(outcome({ result: { ok: false, error: "Order not found" } }));
  });

  it("the receipt again, the provider refusing: said so, no note", async () => {
    await orderIn("paid");
    world.mailFaults.set("sendOrderConfirmation", new Error("mail down"));

    const seen = await record(() => resendConfirmation(ORDER));

    expect(seen.result).toEqual({ ok: false, error: "Could not send receipt" });
    expect(seen.rows).toEqual({});
  });

  it("the receipt again: in the order's own currency and rate, a note, an audit row", async () => {
    await orderIn("paid", { currency: "XTS", fxRate: 0.5 });

    const seen = await record(() => resendConfirmation(ORDER));

    const written = note("Order receipt resent to the customer");
    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          OrderNote: { inserted: [written] },
          AuditLog: { inserted: [audit("orders.resend_confirmation", { orderId: ORDER }, { afterJson: { ...written, metaJson: null } })] },
        },
        mails: [
          [
            "sendOrderConfirmation",
            {
              orderId: ORDER,
              email: BUYER.email,
              shippingName: BUYER.shippingName,
              items: [
                { productName: "Fence Panel", quantity: 2, unitPriceDkk: 60000 },
                { productName: "Plain Mug", quantity: 2, unitPriceDkk: 12900 },
              ],
              ...MONEY,
              currency: "XTS",
              fxRate: 0.5,
            },
          ],
        ],
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it("the shipping notice: the tracking in the mail, a note, an audit row", async () => {
    await orderIn("shipped", { carrier: "PostNord", trackingNumber: "123", trackingUrl: "https://track.example.test/123" });

    const seen = await record(() => sendShippingNotification(ORDER));

    const written = note("Shipping notification sent to the customer");
    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          OrderNote: { inserted: [written] },
          AuditLog: { inserted: [audit("orders.notify_shipped", { orderId: ORDER }, { afterJson: { ...written, metaJson: null } })] },
        },
        mails: [
          [
            "sendShippingNotificationEmail",
            {
              orderId: ORDER,
              email: BUYER.email,
              shippingName: BUYER.shippingName,
              carrier: "PostNord",
              trackingNumber: "123",
              trackingUrl: "https://track.example.test/123",
              items: [
                { productName: "Fence Panel", quantity: 2 },
                { productName: "Plain Mug", quantity: 2 },
              ],
            },
          ],
        ],
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it("the shipping notice, the provider refusing: said so, no note", async () => {
    await orderIn("shipped");
    world.mailFaults.set("sendShippingNotificationEmail", new Error("mail down"));

    const seen = await record(() => sendShippingNotification(ORDER));

    expect(seen.result).toEqual({ ok: false, error: "Could not send shipping notification" });
    expect(seen.rows).toEqual({});
  });

  it("the shipping notice, for an order the shop does not have", async () => {
    const seen = await record(() => sendShippingNotification("ord_gone"));

    expect(seen).toEqual(outcome({ result: { ok: false, error: "Order not found" } }));
  });
});

describe.skipIf(!sqlite)("fulfillment", () => {
  it("no supplier on any line: a note that says none, an audit row", async () => {
    await orderIn("paid");

    const seen = await record(() => createFulfillment(ORDER));

    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          OrderNote: { inserted: [note("Fulfillment created: 0 supplier order(s)")] },
          AuditLog: { inserted: [audit("fulfillment.create", { orderId: ORDER })] },
        },
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it("the note failing changes nothing for the operator", async () => {
    await orderIn("paid");
    failing("orderNote.create");

    const seen = await record(() => createFulfillment(ORDER));

    expect(seen.result).toEqual({ ok: true });
    expect(seen.rows.OrderNote).toBeUndefined();
  });
});

describe.skipIf(!sqlite)("a return, from request to stock", () => {
  const RETURN = "ret-1";
  const items = [{ orderItemId: "line-plain", quantity: 1 }];

  const requested = (status: string) =>
    world.prisma.return.create({
      data: {
        id: RETURN,
        orderId: ORDER,
        status,
        reason: "damaged",
        createdBy: "user:admin",
        items: {
          create: [
            { id: "ret-plain", orderItemId: "line-plain", quantity: 1, productName: "Plain Mug" },
            { id: "ret-fence", orderItemId: "line-fence", quantity: 2, productName: "Fence Panel", variantId: "fence-2m" },
          ],
        },
      },
    });

  it("created: the lines as ordered, a note, an audit row, no stock moved", async () => {
    await orderIn("shipped");

    const seen = await record(() =>
      createReturn(ORDER, {
        items: [
          { orderItemId: "line-plain", quantity: 0 },
          { orderItemId: "line-fence", quantity: 2 },
        ],
        reason: " damaged ",
      }),
    );

    const returnId = (await world.prisma.return.findFirstOrThrow()).id;
    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          Return: { inserted: [{ orderId: ORDER, status: "requested", reason: "damaged", refundDkk: 0, restocked: false, createdBy: "user:admin" }] },
          ReturnItem: {
            inserted: [{ returnId, orderItemId: "line-fence", quantity: 2, productName: "Fence Panel", variantId: "fence-2m" }],
          },
          OrderNote: {
            inserted: [note("Return created (1 item(s)): damaged", { metaJson: { returnId } })],
          },
          AuditLog: { inserted: [audit("orders.return_create", { orderId: ORDER, reason: "damaged" })] },
        },
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it.each([
    ["no reason", { items, reason: "  " }, "Provide a reason"],
    ["no lines", { items: [], reason: "damaged" }, "Select at least one item"],
    ["only zero quantities", { items: [{ orderItemId: "line-plain", quantity: 0 }], reason: "damaged" }, "Select at least one item"],
    ["a line that is not on the order", { items: [{ orderItemId: "line-other", quantity: 1 }], reason: "damaged" }, "Ukendt ordre-linje"],
    ["more than was ordered", { items: [{ orderItemId: "line-plain", quantity: 3 }], reason: "damaged" }, "Quantity exceeds the amount ordered (Plain Mug)"],
    ["half a piece", { items: [{ orderItemId: "line-plain", quantity: 1.5 }], reason: "damaged" }, "Quantity exceeds the amount ordered (Plain Mug)"],
  ])("created, refused: %s", async (_case, input, error) => {
    await orderIn("shipped");

    const seen = await record(() => createReturn(ORDER, input));

    expect(seen).toEqual(outcome({ result: { ok: false, error } }));
  });

  it("created, refused: an order the shop does not have", async () => {
    const seen = await record(() => createReturn("ord_gone", { items, reason: "damaged" }));

    expect(seen).toEqual(outcome({ result: { ok: false, error: "Order not found" } }));
  });

  it("approved", async () => {
    await orderIn("shipped");
    await requested("requested");

    const seen = await record(() => approveReturn(RETURN));

    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          Return: { updated: { [RETURN]: { status: "approved" } } },
          OrderNote: { inserted: [note("Retur godkendt")] },
          AuditLog: { inserted: [audit("orders.return_approve", { returnId: RETURN })] },
        },
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it("approved, refused: not requested any more, or not there", async () => {
    await orderIn("shipped");
    await requested("approved");

    expect((await record(() => approveReturn(RETURN))).result).toEqual({
      ok: false,
      error: "Only requested returns can be approved",
    });
    expect((await record(() => approveReturn("ret-gone"))).result).toEqual({ ok: false, error: "Return not found" });
  });

  it.each([
    ["with a reason", " wrong item ", "Retur afvist: wrong item"],
    ["without one", "  ", "Retur afvist"],
  ])("rejected %s", async (_case, reason, body) => {
    await orderIn("shipped");
    await requested("requested");

    const seen = await record(() => rejectReturn(RETURN, reason));

    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          Return: { updated: { [RETURN]: { status: "rejected" } } },
          OrderNote: { inserted: [note(body)] },
          AuditLog: { inserted: [audit("orders.return_reject", { returnId: RETURN })] },
        },
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it("rejected, refused: not there", async () => {
    const seen = await record(() => rejectReturn("ret-gone", "x"));

    expect(seen).toEqual(outcome({ result: { ok: false, error: "Return not found" } }));
  });

  // app/admin/ordrer/actions.ts:632: the goods are back on the shelf, or the money back
  // with the customer. Refunded before the goods arrived is the case only the status catches.
  it.each([
    ["received and restocked", "received", true],
    ["refunded, the goods not yet back", "refunded", false],
  ])("rejected, refused: %s, nothing written", async (_case, status, restocked) => {
    await orderIn("shipped");
    await requested(status);
    await world.prisma.return.update({ where: { id: RETURN }, data: { restocked } });

    const seen = await record(() => rejectReturn(RETURN, "no"));

    expect(seen).toEqual(
      outcome({ result: { ok: false, error: "A return that has been received or refunded cannot be rejected" } }),
    );
  });

  it("received: each line's stock back where it came from, the customer told", async () => {
    await orderIn("shipped");
    await requested("approved");

    const seen = await record(() => receiveAndRestock(RETURN));

    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          Product: { updated: { plain: { stock: 4 } } },
          ProductVariant: { updated: { "fence-2m": { stock: 3 } } },
          Return: { updated: { [RETURN]: { status: "received", restocked: true } } },
          OrderNote: { inserted: [note("Return received + stock restored (2 item(s))")] },
          AuditLog: {
            inserted: [
              audit(
                "orders.return_restock",
                { returnId: RETURN },
                {
                  afterJson: {
                    restockedNow: true,
                    // status + paidAt since #758 (56f18232): a return reads them to refuse a double restock.
                    order: { id: ORDER, email: BUYER.email, shippingName: BUYER.shippingName, status: "shipped", paidAt: null },
                    items: expect.arrayContaining([
                      { productName: "Plain Mug", quantity: 1 },
                      { productName: "Fence Panel", quantity: 2 },
                    ]),
                  },
                },
              ),
            ],
          },
        },
        mails: [
          [
            "sendReturnReceivedEmail",
            {
              orderId: ORDER,
              email: BUYER.email,
              shippingName: BUYER.shippingName,
              items: [
                { productName: "Fence Panel", quantity: 2 },
                { productName: "Plain Mug", quantity: 1 },
              ],
            },
          ],
        ],
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it("received twice: the stock once, the customer told once", async () => {
    await orderIn("shipped");
    await requested("approved");
    await receiveAndRestock(RETURN);

    const seen = await record(() => receiveAndRestock(RETURN));

    expect(seen).toEqual(
      outcome({
        result: { ok: true },
        rows: {
          AuditLog: {
            inserted: [
              audit(
                "orders.return_restock",
                { returnId: RETURN },
                {
                  afterJson: {
                    restockedNow: false,
                    // status + paidAt since #758 (56f18232): a return reads them to refuse a double restock.
                    order: { id: ORDER, email: BUYER.email, shippingName: BUYER.shippingName, status: "shipped", paidAt: null },
                    items: expect.arrayContaining([
                      { productName: "Plain Mug", quantity: 1 },
                      { productName: "Fence Panel", quantity: 2 },
                    ]),
                  },
                },
              ),
            ],
          },
        },
        revalidated: [ORDER_PAGE],
      }),
    );
  });

  it("received, the mail failing: the operator hears nothing of it", async () => {
    await orderIn("shipped");
    await requested("approved");
    world.mailFaults.set("sendReturnReceivedEmail", new Error("mail down"));

    const seen = await record(() => receiveAndRestock(RETURN));

    expect(seen.result).toEqual({ ok: true });
  });

  // app/admin/ordrer/actions.ts:682: a rejected return is closed; its lines may be returned anew.
  it("received, refused: a rejected return, no stock moved, a failed audit row", async () => {
    await orderIn("shipped");
    await requested("rejected");

    const seen = await record(() => receiveAndRestock(RETURN));

    const refusal = "This return was rejected, so it cannot be received. Create a new return for these items.";
    expect(seen).toEqual(
      outcome({
        result: { ok: false, error: refusal },
        rows: {
          AuditLog: { inserted: [audit("orders.return_restock", { returnId: RETURN }, { ok: false, errorMsg: refusal })] },
        },
      }),
    );
  });

  // lib/orders/restock.ts:103: a payment on record keeps the return, whatever the status
  // says now. Without one, a cancelled order with no cancel note had its stock back already.
  it("received, on a cancelled order paid before it was cancelled: the stock back", async () => {
    await orderIn("cancelled", { paidAt: minutesAgo(5) });
    await requested("approved");

    const seen = await record(() => receiveAndRestock(RETURN));

    expect(seen.result).toEqual({ ok: true });
    expect(seen.rows.Product).toEqual({ updated: { plain: { stock: 4 } } });
    expect(seen.rows.ProductVariant).toEqual({ updated: { "fence-2m": { stock: 3 } } });
    expect(seen.rows.Return).toEqual({ updated: { [RETURN]: { status: "received", restocked: true } } });
  });

  it("received, refused: a cancelled order never paid, no stock moved", async () => {
    await orderIn("cancelled");
    await requested("approved");

    const seen = await record(() => receiveAndRestock(RETURN));

    const refusal =
      "This order was cancelled before its payment was registered, so it has no stock to bring back. A return would add units the shop does not have.";
    expect(seen).toEqual(
      outcome({
        result: { ok: false, error: refusal },
        rows: {
          AuditLog: { inserted: [audit("orders.return_restock", { returnId: RETURN }, { ok: false, errorMsg: refusal })] },
        },
      }),
    );
  });

  it("received, refused: not there", async () => {
    const seen = await record(() => receiveAndRestock("ret-gone"));

    expect(seen.result).toEqual({ ok: false, error: "Return not found" });
    expect(seen.rows.AuditLog?.inserted?.[0]).toMatchObject({ ok: false, errorMsg: "RETURN_NOT_FOUND" });
  });

  it("received, the database failing: said so, nothing back", async () => {
    await orderIn("shipped");
    await requested("approved");
    failing("$transaction");

    const seen = await record(() => receiveAndRestock(RETURN));

    expect(seen.result).toEqual({ ok: false, error: "Could not register the return" });
    expect(seen.rows.Product).toBeUndefined();
  });
});

describe.skipIf(!sqlite)("the order list", () => {
  const anOrder = (id: string, over: Record<string, unknown> = {}) =>
    world.prisma.order.create({
      data: {
        id,
        status: "paid",
        ...BUYER,
        subtotalDkk: 100,
        shippingDkk: 0,
        totalDkk: 100,
        createdAt: minutesAgo(10),
        ...over,
      },
    });

  type Page = { rows: { id: string; flags: Record<string, boolean> }[]; nextCursor: string | null };
  const ids = (result: unknown) => (result as Page).rows.map((row) => row.id);
  const flagsOf = async (id: string) => {
    const page = await listOrdersPage({ q: id });
    return page.rows[0].flags;
  };

  it("a row as the workspace shows it, with its flags", async () => {
    await orderIn("flagged_review", { carrier: "PostNord", trackingNumber: "123" });

    const seen = await record(() => listOrdersPage({ q: BUYER.email }));

    expect(seen).toEqual(
      outcome({
        result: {
          rows: [
            {
              id: ORDER,
              email: BUYER.email,
              shippingName: BUYER.shippingName,
              status: "flagged_review",
              totalDkk: MONEY.totalDkk,
              itemCount: 4,
              createdAt: minutesAgo(10).toISOString(),
              carrier: "PostNord",
              trackingNumber: "123",
              flags: { delayed: false, lowStock: true, attention: true },
            },
          ],
          nextCursor: null,
        },
      }),
    );
  });

  it("delayed: shipped, and more than seven days old to the millisecond", async () => {
    const week = 7 * 86_400_000;
    await anOrder("just-old", { status: "shipped", createdAt: new Date(Date.parse(NOW) - week - 1) });
    await anOrder("just-young", { status: "shipped", createdAt: new Date(Date.parse(NOW) - week) });
    await anOrder("old-unshipped", { status: "paid", createdAt: new Date(Date.parse(NOW) - 2 * week) });

    expect((await flagsOf("just-old")).delayed).toBe(true);
    expect((await flagsOf("just-young")).delayed).toBe(false);
    expect((await flagsOf("old-unshipped")).delayed).toBe(false);
  });

  it.each([
    ["flagged_review", true],
    ["disputed", true],
    ["paid", false],
    ["pending_payment", false],
  ])("attention: %s is %s", async (status, attention) => {
    await anOrder("the-order", { status });

    expect((await flagsOf("the-order")).attention).toBe(attention);
  });

  it.each([
    ["a product line at the threshold", 3, 99, false, true],
    ["a product line above it", 4, 99, false, false],
    ["a variant line at the threshold, its product's stock not read", 99, 3, true, true],
    ["a variant line above it, whatever its product holds", 0, 4, true, false],
  ])("low stock: %s", async (_case, productStock, variantStock, onVariant, lowStock) => {
    await world.prisma.product.update({ where: { id: "fence" }, data: { stock: productStock } });
    await world.prisma.productVariant.update({ where: { id: "fence-2m" }, data: { stock: variantStock } });
    await anOrder("the-order", {
      items: {
        create: [
          {
            productId: "fence",
            productName: "Fence Panel",
            unitPriceDkk: 100,
            quantity: 1,
            ...(onVariant ? { variantId: "fence-2m" } : {}),
          },
        ],
      },
    });

    expect((await flagsOf("the-order")).lowStock).toBe(lowStock);
  });

  it("a line whose product is gone has no stock to run low", async () => {
    await anOrder("the-order", {
      items: { create: [{ productId: null, productName: "Gone", unitPriceDkk: 100, quantity: 1 }] },
    });

    expect((await flagsOf("the-order")).lowStock).toBe(false);
  });

  it("the newest first, whatever the ids say, and the higher id first on the same instant", async () => {
    await anOrder("z-oldest", { createdAt: new Date("2026-10-01T10:00:00.000Z") });
    // The higher id written first, so the order they were written in cannot pass for the rule.
    await anOrder("c-tied", { createdAt: new Date("2026-10-15T10:00:00.000Z") });
    await anOrder("b-tied", { createdAt: new Date("2026-10-15T10:00:00.000Z") });
    await anOrder("a-newest", { createdAt: new Date("2026-10-20T10:00:00.000Z") });

    expect(ids(await listOrdersPage({}))).toEqual(["a-newest", "c-tied", "b-tied", "z-oldest"]);
  });

  it("the tab, the search and the dates narrow it", async () => {
    await anOrder("a-oldest", { createdAt: new Date("2026-10-01T10:00:00.000Z"), status: "cancelled" });
    await anOrder("b-middle", { createdAt: new Date("2026-10-15T10:00:00.000Z"), email: "someone@shop.example.test" });
    await anOrder("c-newest", { createdAt: new Date("2026-10-20T10:00:00.000Z") });

    expect(ids(await listOrdersPage({ tab: "closed" }))).toEqual(["a-oldest"]);
    expect(ids(await listOrdersPage({ tab: "no-such-tab" }))).toEqual(["c-newest", "b-middle", "a-oldest"]);
    expect(ids(await listOrdersPage({ q: " someone " }))).toEqual(["b-middle"]);
    expect(ids(await listOrdersPage({ q: "c-new" }))).toEqual(["c-newest"]);
    expect(ids(await listOrdersPage({ q: "   " }))).toEqual(["c-newest", "b-middle", "a-oldest"]);
    expect(ids(await listOrdersPage({ fromDate: "2026-10-10" }))).toEqual(["c-newest", "b-middle"]);
    expect(ids(await listOrdersPage({ toDate: "2026-10-15T09:00:00.000Z" }))).toEqual(["a-oldest"]);
  });

  it("a date alone means the whole of that day, in the server's own clock", async () => {
    const lastOfTheDay = new Date("2026-10-15");
    lastOfTheDay.setHours(23, 59, 59, 999);
    await anOrder("last-of-the-day", { createdAt: lastOfTheDay });
    await anOrder("next-day", { createdAt: new Date(lastOfTheDay.getTime() + 1) });

    expect(ids(await listOrdersPage({ toDate: "2026-10-15" }))).toEqual(["last-of-the-day"]);
  });

  it("25 to a page, and a full page says where the next one starts", async () => {
    for (let n = 0; n < 26; n++) {
      await anOrder(`order-${String(n).padStart(2, "0")}`, { createdAt: minutesAgo(n + 1) });
    }

    const first = (await listOrdersPage({})) as Page;
    expect(first.rows).toHaveLength(25);
    expect(first.nextCursor).toBe("order-24");

    const second = await listOrdersPage({ cursor: "order-24" });
    expect(ids(second)).toEqual(["order-25"]);
    expect(second.nextCursor).toBeNull();
  });

  it("a page size asked for is the page size", async () => {
    await anOrder("a", { createdAt: minutesAgo(30) });
    await anOrder("b", { createdAt: minutesAgo(20) });
    await anOrder("c", { createdAt: minutesAgo(10) });

    const first = await listOrdersPage({ take: 2 });
    expect(ids(first)).toEqual(["c", "b"]);
    expect(first.nextCursor).toBe("b");

    const second = await listOrdersPage({ take: 2, cursor: "b" });
    expect(ids(second)).toEqual(["a"]);
    expect(second.nextCursor).toBeNull();
  });
});

describe.skipIf(!sqlite)("the bulk action's own count", () => {
  it("nothing to move: nothing moved, the page refreshed", async () => {
    const seen = await record(() => bulkUpdateStatus([], "shipped"));

    expect(seen).toEqual(outcome({ result: { updated: 0, skipped: [] }, revalidated: [["/admin/ordrer"]] }));
  });
});
