/**
 * CANCEL-RESTOCK — an order cancelled before it was paid gets its stock back,
 * exactly once, whichever path cancels it first.
 *
 * Measured on #623: an admin cancel of a pending_payment order never gave its
 * stock back. Checkout decremented it, the admin action only wrote the status,
 * the `payment_intent.canceled` webhook set `cancelled` unconditionally with
 * no restock, and the reconcile cron only looks at pending_payment orders —
 * which a cancelled order no longer is. Since #623 every operator cancel also
 * cancels the PaymentIntent, so that webhook now arrives routinely.
 *
 * These run the REAL admin action, `orders.update_status` tool, webhook route
 * and reconcile cron against one in-memory database, so the order in which
 * the paths land is the only variable.
 *
 * RACE-MARKPAID (measured on #626): every other operator move wrote the status
 * unconditionally, so a "mark paid" that read pending_payment before a cancel
 * landed turned the cancelled, restocked order into a paid one — its units
 * then both shipped and on sale. ORDER-NOTE-TOOL: a move through the tool left
 * no order-timeline note. Both are pinned at the bottom of this file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Order = {
  id: string;
  status: string;
  stripePaymentIntentId: string | null;
  totalDkk: number;
  createdAt: Date;
};
type Item = { orderId: string; productId: string | null; variantId: string | null; quantity: number };
type State = {
  orders: Record<string, Order>;
  items: Item[];
  productStock: Record<string, number>;
  variantStock: Record<string, number>;
  notes: { orderId: string; body: string; metaJson?: string }[];
  processedEvents: string[];
};

const h = vi.hoisted(() => {
  const empty = (): State => ({
    orders: {},
    items: [],
    productStock: {},
    variantStock: {},
    notes: [],
    processedEvents: [],
  });
  const ref = { db: empty() };
  const intents: Record<string, string> = {};
  const withItems = (o: Order | undefined) =>
    o ? { ...o, items: ref.db.items.filter((i) => i.orderId === o.id) } : null;

  type Where = { id: string; status?: string };
  const prisma = {
    order: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        withItems(ref.db.orders[where.id]),
      ),
      findMany: vi.fn(async ({ where }: { where: { status: string } }) =>
        Object.values(ref.db.orders)
          .filter((o) => o.status === where.status && o.stripePaymentIntentId)
          .map(withItems),
      ),
      update: vi.fn(async ({ where, data }: { where: Where; data: Partial<Order> }) => {
        const o = ref.db.orders[where.id];
        if (!o) throw Object.assign(new Error("not found"), { code: "P2025" });
        Object.assign(o, data);
        return { ...o };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<Order> }) => {
        const o = ref.db.orders[where.id];
        if (!o || (where.status !== undefined && o.status !== where.status)) return { count: 0 };
        Object.assign(o, data);
        return { count: 1 };
      }),
    },
    orderItem: {
      findMany: vi.fn(async ({ where }: { where: { orderId: string } }) =>
        ref.db.items
          .filter((i) => i.orderId === where.orderId)
          .map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
      ),
    },
    product: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { stock: { increment: number } } }) => {
        ref.db.productStock[where.id] += data.stock.increment;
      }),
    },
    productVariant: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { stock: { increment: number } } }) => {
        ref.db.variantStock[where.id] += data.stock.increment;
      }),
    },
    orderNote: {
      create: vi.fn(async ({ data }: { data: { orderId: string; body: string; metaJson?: string } }) => {
        ref.db.notes.push(data);
        return { id: `n${ref.db.notes.length}` };
      }),
    },
    processedWebhookEvent: {
      create: vi.fn(async ({ data }: { data: { id: string } }) => {
        if (ref.db.processedEvents.includes(data.id)) {
          throw Object.assign(new Error("Unique"), { code: "P2002" });
        }
        ref.db.processedEvents.push(data.id);
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
    // A callback transaction is atomic: a throw restores the state it began with.
    $transaction: vi.fn(async (arg: unknown): Promise<unknown> => {
      if (Array.isArray(arg)) return Promise.all(arg);
      const snapshot = structuredClone(ref.db);
      try {
        return await (arg as (tx: unknown) => Promise<unknown>)(prisma);
      } catch (err) {
        ref.db = snapshot;
        throw err;
      }
    }),
  };

  const stripe = {
    webhooks: { constructEvent: vi.fn((raw: string) => JSON.parse(raw)) },
    paymentIntents: {
      retrieve: vi.fn(async (id: string) => ({ id, status: intents[id] })),
      cancel: vi.fn(async (id: string) => {
        intents[id] = "canceled";
        return { id, status: "canceled" };
      }),
    },
  };
  const audits: { tool: string; args: unknown }[] = [];
  return { ref, empty, intents, prisma, stripe, audits };
});

vi.mock("@/lib/db", () => ({ prisma: h.prisma }));
vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(async () => h.stripe),
  getStripeKeys: vi.fn(async () => ({ secretKey: "sk_test", publishableKey: "pk_test", webhookSecret: "whsec_test" })),
  createRefund: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({
  withAudit: async (meta: { tool: string; args: unknown }, handler: () => Promise<unknown>) => {
    h.audits.push({ tool: meta.tool, args: meta.args });
    return handler();
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })) }));
vi.mock("@/lib/fulfillment", () => ({ createFulfillmentOrders: vi.fn() }));
vi.mock("@/lib/mailer", () => ({
  mailer: { sendOrderConfirmation: vi.fn() },
  sendShippingNotificationEmail: vi.fn(),
  sendRefundConfirmationEmail: vi.fn(),
  sendReturnReceivedEmail: vi.fn(),
}));
vi.mock("@/lib/orders/notify-owner", () => ({ notifyOwnerOfPaidOrder: vi.fn() }));
vi.mock("@/lib/marketing/automations", () => ({
  emitMarketingEvent: vi.fn(),
  MARKETING_EVENTS: { orderPlaced: "cartwright.order.placed" },
}));

import { bulkUpdateStatus, updateOrderStatusAdmin } from "@/app/admin/ordrer/actions";
import { updateOrderStatus } from "@/lib/tools/orders";
import { POST as stripeWebhook } from "@/app/api/webhook/stripe/route";
import { GET as reconcileCron } from "@/app/api/cron/reconcile-stripe/route";

// After checkout: the shirt (size M variant) and the mug were decremented.
const SHIRT_M_AFTER_CHECKOUT = 3;
const MUG_AFTER_CHECKOUT = 5;
const SHIRT_PARENT = 10;

function seed(status = "pending_payment", id = "o1", intent = "pi_1") {
  h.ref.db.orders[id] = {
    id,
    status,
    stripePaymentIntentId: intent,
    totalDkk: 44700,
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
  };
  h.ref.db.items.push(
    { orderId: id, productId: "prod_shirt", variantId: "var_shirt_m", quantity: 2 },
    { orderId: id, productId: "prod_mug", variantId: null, quantity: 1 },
  );
  h.intents[intent] = status === "paid" ? "succeeded" : "requires_payment_method";
}

const stock = () => ({
  shirtM: h.ref.db.variantStock.var_shirt_m,
  mug: h.ref.db.productStock.prod_mug,
  shirtParent: h.ref.db.productStock.prod_shirt,
});
const RESTOCKED_ONCE = { shirtM: SHIRT_M_AFTER_CHECKOUT + 2, mug: MUG_AFTER_CHECKOUT + 1, shirtParent: SHIRT_PARENT };
const UNTOUCHED = { shirtM: SHIRT_M_AFTER_CHECKOUT, mug: MUG_AFTER_CHECKOUT, shirtParent: SHIRT_PARENT };
const status = (id = "o1") => h.ref.db.orders[id].status;

let eventSeq = 0;
async function intentCanceledWebhook(orderId = "o1", intent = "pi_1") {
  const event = {
    id: `evt_${++eventSeq}`,
    type: "payment_intent.canceled",
    data: { object: { id: intent, metadata: { orderId } } },
  };
  const res = await stripeWebhook(
    new Request("http://localhost/api/webhook/stripe", {
      method: "POST",
      body: JSON.stringify(event),
      headers: { "stripe-signature": "t=1,v1=sig" },
    }) as never,
  );
  expect(res.status).toBe(200);
}

async function runCron() {
  const res = await reconcileCron(
    new Request("http://localhost/api/cron/reconcile-stripe", {
      headers: { authorization: "Bearer cron-secret" },
    }) as never,
  );
  return (await res.json()) as { results: { orderId: string; action: string }[] };
}

const toolCtx = { actor: "apikey:k1" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.ref.db = h.empty();
  h.audits.length = 0;
  for (const k of Object.keys(h.intents)) delete h.intents[k];
  h.ref.db.variantStock = { var_shirt_m: SHIRT_M_AFTER_CHECKOUT };
  h.ref.db.productStock = { prod_mug: MUG_AFTER_CHECKOUT, prod_shirt: SHIRT_PARENT };
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("an admin cancel of an order awaiting payment", () => {
  it("returns its stock once — a variant line to the variant, a plain line to the product", async () => {
    seed();

    await expect(updateOrderStatusAdmin("o1", "cancelled")).resolves.toEqual({ ok: true });

    expect(status()).toBe("cancelled");
    expect(stock()).toEqual(RESTOCKED_ONCE);
    const note = h.ref.db.notes.find((n) => n.metaJson?.includes('"restocked":true'));
    expect(note?.body).toMatch(/items returned to stock/);
    // #623 still holds: the intent is cancelled after the status is written.
    expect(h.stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_1");
  });

  it("the payment_intent.canceled webhook that cancel fires does not restock a second time", async () => {
    seed();
    await updateOrderStatusAdmin("o1", "cancelled");

    await intentCanceledWebhook();
    await intentCanceledWebhook(); // Stripe redelivers under a new event id

    expect(status()).toBe("cancelled");
    expect(stock()).toEqual(RESTOCKED_ONCE);
  });

  it("the bulk action restocks each order once", async () => {
    seed("pending_payment", "o1", "pi_1");
    seed("pending_payment", "o2", "pi_2");

    await expect(bulkUpdateStatus(["o1", "o2"], "cancelled")).resolves.toEqual({
      updated: 2,
      skipped: [],
    });
    await intentCanceledWebhook("o1", "pi_1");
    await intentCanceledWebhook("o2", "pi_2");

    expect(stock()).toEqual({
      shirtM: SHIRT_M_AFTER_CHECKOUT + 4,
      mug: MUG_AFTER_CHECKOUT + 2,
      shirtParent: SHIRT_PARENT,
    });
  });

  it("a paid order is cancelled without a restock — a refund or a return owns that", async () => {
    seed("paid");

    await expect(updateOrderStatusAdmin("o1", "cancelled")).resolves.toEqual({ ok: true });

    expect(status()).toBe("cancelled");
    expect(stock()).toEqual(UNTOUCHED);
  });
});

describe("the webhook cancels first", () => {
  it("restocks once, and a later admin cancel is refused without restocking again", async () => {
    seed();

    await intentCanceledWebhook();
    expect(status()).toBe("cancelled");
    expect(stock()).toEqual(RESTOCKED_ONCE);

    await expect(updateOrderStatusAdmin("o1", "cancelled")).resolves.toMatchObject({ ok: false });
    expect(stock()).toEqual(RESTOCKED_ONCE);
  });

  it("an admin who read the order before the webhook landed gets an error, not a second restock", async () => {
    seed();
    // The admin's read happened while the order was still pending_payment …
    h.prisma.order.findUnique.mockResolvedValueOnce({
      status: "pending_payment",
      stripePaymentIntentId: "pi_1",
    } as never);
    // … and the webhook cancelled it before the admin's write ran.
    await intentCanceledWebhook();

    const result = await updateOrderStatusAdmin("o1", "cancelled");

    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/no longer awaiting payment/) });
    expect(stock()).toEqual(RESTOCKED_ONCE);
    expect(h.ref.db.notes.filter((n) => n.metaJson?.includes('"restocked":true'))).toHaveLength(0);
    expect(h.stripe.paymentIntents.cancel).not.toHaveBeenCalled();
  });
});

describe("the webhook never overwrites an order that is not awaiting payment", () => {
  for (const s of ["paid", "flagged_review", "shipped", "refunded"]) {
    it(`a ${s} order stays ${s} and keeps its stock`, async () => {
      seed(s);

      await intentCanceledWebhook();

      expect(status()).toBe(s);
      expect(stock()).toEqual(UNTOUCHED);
    });
  }
});

describe("orders.update_status", () => {
  it("restocks once, says so in a result the schema accepts, and the webhook adds nothing", async () => {
    seed();

    const result = await updateOrderStatus.handler({ orderId: "o1", status: "cancelled" }, toolCtx);

    expect(result).toMatchObject({ id: "o1", status: "cancelled", restocked: true });
    expect(() => updateOrderStatus.output.parse(result)).not.toThrow();
    await intentCanceledWebhook();
    expect(stock()).toEqual(RESTOCKED_ONCE);
  });

  it("refuses — and restocks nothing more — when the webhook cancelled the order after the read", async () => {
    seed();
    h.prisma.order.findUnique.mockResolvedValueOnce({
      status: "pending_payment",
      totalDkk: 44700,
      stripePaymentIntentId: "pi_1",
    } as never);
    await intentCanceledWebhook();

    await expect(
      updateOrderStatus.handler({ orderId: "o1", status: "cancelled" }, toolCtx),
    ).rejects.toThrow(/no longer awaiting payment/);
    expect(stock()).toEqual(RESTOCKED_ONCE);
  });
});

describe("the reconcile cron", () => {
  it("and the webhook, for the same cancelled intent, restock once between them", async () => {
    seed();
    h.intents.pi_1 = "canceled";

    expect((await runCron()).results).toEqual([
      { orderId: "o1", action: "reconciled_cancelled_restocked" },
    ]);
    await intentCanceledWebhook();
    expect(await runCron()).toEqual(expect.objectContaining({ results: [] }));

    expect(status()).toBe("cancelled");
    expect(stock()).toEqual(RESTOCKED_ONCE);
  });
});

describe("RACE-MARKPAID: a move decided on a stale read is refused, never applied", () => {
  // The operator's read happened while the order was still awaiting payment;
  // the cancel below lands before that operator's write runs.
  const staleRead = () =>
    h.prisma.order.findUnique.mockResolvedValueOnce({
      status: "pending_payment",
      totalDkk: 44700,
      stripePaymentIntentId: "pi_1",
    } as never);
  const statusNotes = (id = "o1") =>
    h.ref.db.notes.filter((n) => n.orderId === id && n.metaJson?.includes('"from"'));

  it("a stale admin 'mark paid' after a cancel restocked the order: refused, still cancelled, stock back once", async () => {
    seed();
    await updateOrderStatusAdmin("o1", "cancelled");
    staleRead();

    const result = await updateOrderStatusAdmin("o1", "paid");

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/changed while it was being updated\. Reload the order/),
    });
    expect(status()).toBe("cancelled");
    expect(stock()).toEqual(RESTOCKED_ONCE);
    expect(statusNotes().map((n) => n.body)).toEqual([
      "Status: Awaiting payment → Cancelled — items returned to stock",
    ]);
  });

  it("a stale bulk 'mark paid' after the webhook cancelled skips that order", async () => {
    seed();
    await intentCanceledWebhook();
    staleRead();

    await expect(bulkUpdateStatus(["o1"], "paid")).resolves.toEqual({
      updated: 0,
      skipped: [{ id: "o1", reason: expect.stringMatching(/Reload the order/) }],
    });
    expect(status()).toBe("cancelled");
    expect(stock()).toEqual(RESTOCKED_ONCE);
    expect(statusNotes()).toHaveLength(0);
  });

  it("a stale orders.update_status 'paid' after a cancel throws and writes nothing", async () => {
    seed();
    await updateOrderStatus.handler({ orderId: "o1", status: "cancelled" }, toolCtx);
    const notesBefore = h.ref.db.notes.length;
    staleRead();

    await expect(
      updateOrderStatus.handler({ orderId: "o1", status: "paid" }, toolCtx),
    ).rejects.toThrow(/changed while it was being updated/);
    expect(status()).toBe("cancelled");
    expect(stock()).toEqual(RESTOCKED_ONCE);
    expect(h.ref.db.notes).toHaveLength(notesBefore);
  });

  it("moves still land when nothing changed in between: mark paid, then ship", async () => {
    seed();

    await expect(updateOrderStatusAdmin("o1", "paid")).resolves.toEqual({ ok: true });
    await expect(
      updateOrderStatus.handler({ orderId: "o1", status: "shipped" }, toolCtx),
    ).resolves.toEqual({ id: "o1", status: "shipped" });

    expect(status()).toBe("shipped");
    expect(stock()).toEqual(UNTOUCHED);
    expect(statusNotes().map((n) => n.body)).toEqual([
      "Status: Awaiting payment → Paid",
      "Status: Paid → Shipped",
    ]);
  });
});

describe("ORDER-NOTE-TOOL: orders.update_status leaves the admin form's trail", () => {
  const statusNote = (id: string) =>
    h.ref.db.notes.find((n) => n.orderId === id && n.metaJson?.includes('"from"'));

  it("an unpaid cancel through the tool writes the same timeline note as the admin form", async () => {
    seed("pending_payment", "o1", "pi_1");
    seed("pending_payment", "o2", "pi_2");

    await updateOrderStatusAdmin("o1", "cancelled");
    await updateOrderStatus.handler({ orderId: "o2", status: "cancelled" }, toolCtx);

    expect(statusNote("o2")?.body).toBe(
      "Status: Awaiting payment → Cancelled — items returned to stock",
    );
    expect(JSON.parse(statusNote("o2")!.metaJson!)).toEqual({
      from: "pending_payment",
      to: "cancelled",
      restocked: true,
    });
    expect(statusNote("o2")?.body).toBe(statusNote("o1")?.body);
    expect(statusNote("o2")?.metaJson).toBe(statusNote("o1")?.metaJson);
  });

  it("the admin audit says restocked: true on an unpaid cancel, and nothing of the kind on others", async () => {
    seed("pending_payment", "o1", "pi_1");
    seed("paid", "o2", "pi_2");

    await updateOrderStatusAdmin("o1", "cancelled");
    await updateOrderStatusAdmin("o2", "cancelled");

    expect(h.audits.filter((a) => a.tool === "orders.update_status").map((a) => a.args)).toEqual([
      { orderId: "o1", from: "pending_payment", to: "cancelled", restocked: true },
      { orderId: "o2", from: "paid", to: "cancelled" },
    ]);
  });
});
