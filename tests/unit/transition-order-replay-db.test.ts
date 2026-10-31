import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient, type Prisma } from "@/app/generated/prisma/client";

/**
 * ORD0-b — a replay of every path that moves an order, over the REAL route handlers,
 * server actions and tool on a real libSQL file: the Stripe webhook (with a genuine
 * signature check), the reconcile cron, createOrder's rollback, the admin status form
 * and bulk action, and `orders.update_status`. The stand-ins are Stripe's network
 * calls, the mails and the request. on-order-paid-replay-db.test.ts holds what follows
 * a paid write; this holds every write of the status: its where, its data, its note,
 * its restock, its audit row, and what the path does when it loses.
 *
 * Each `expect(doorCalls())` says what the path hands the door. Everything else is
 * behaviour, and passes the same with those lines stripped on the code from before
 * the door existed: that is the bar for ORD0, which keeps behaviour.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const WEBHOOK_SECRET = "whsec_replay_test";
const CRON_SECRET = "cron-replay-test";

const state = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  webhooks: null as unknown as Stripe["webhooks"],
  /** Runs once as a `$transaction` opens: another path gets there first. */
  beforeTransaction: null as null | (() => Promise<unknown>),
  /** Runs once before an `order.update` or `order.updateMany`: the same, for one write. */
  beforeOrderWrite: null as null | (() => Promise<unknown>),
  /** A table that fails inside a `$transaction`: a crash halfway through it. */
  faultInTransaction: null as null | string,
  intentCounter: 0,
  retrieveIntent: vi.fn(),
  cancelIntent: vi.fn(),
  createPaymentIntent: vi.fn(),
  sendOrderConfirmation: vi.fn(),
  captureException: vi.fn(),
}));

function once(step: "beforeTransaction" | "beforeOrderWrite") {
  const run = state[step];
  state[step] = null;
  return run?.();
}

function faulty<T extends object>(tx: T): T {
  const fault = state.faultInTransaction;
  if (!fault) return tx;
  return new Proxy(tx, {
    get(target, key) {
      if (key === fault) throw new Error(`${fault} is down`);
      return Reflect.get(target, key, target);
    },
  });
}

// The real client, with seams to interleave one path inside another.
vi.mock("@/lib/db", () => ({
  get prisma() {
    return new Proxy(state.prisma, {
      get(target, key) {
        if (key === "$transaction") {
          return async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
            await once("beforeTransaction");
            return target.$transaction((tx) => fn(faulty(tx)));
          };
        }
        if (key === "order") {
          return new Proxy(target.order, {
            get(order, method) {
              if (method === "updateMany") {
                return async (args: Parameters<typeof order.updateMany>[0]) => {
                  await once("beforeOrderWrite");
                  return order.updateMany(args);
                };
              }
              if (method === "update") {
                return async (args: Parameters<typeof order.update>[0]) => {
                  await once("beforeOrderWrite");
                  return order.update(args);
                };
              }
              return Reflect.get(order, method, order);
            },
          });
        }
        return Reflect.get(target, key, target);
      },
    });
  },
}));
vi.mock("@/lib/stripe", () => ({
  isStripeReady: async () => true,
  getStripeKeys: async () => ({ publishableKey: "pk_test_replay", webhookSecret: WEBHOOK_SECRET }),
  getStripeClient: async () => ({
    webhooks: state.webhooks,
    paymentIntents: { retrieve: state.retrieveIntent, cancel: state.cancelIntent },
  }),
  createPaymentIntent: state.createPaymentIntent,
  createRefund: vi.fn(),
}));
vi.mock("@/lib/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mailer")>()),
  mailer: { sendOrderConfirmation: state.sendOrderConfirmation },
  sendOwnerNewOrderEmail: vi.fn(),
}));
vi.mock("@/lib/marketing/automations", () => ({
  emitMarketingEvent: vi.fn(async () => false),
  MARKETING_EVENTS: { orderPlaced: "cartwright.order.placed" },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: state.captureException }));
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({ features: {}, emails: { admin: "owner@shop.example.test" }, url: "https://shop.example.test" }),
}));
// The shipping policy is fixed, so the figures below hold in any fork.
vi.mock("@/brand.config", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/brand.config")>();
  return {
    ...real,
    brand: {
      ...real.brand,
      policies: { ...real.brand.policies, shippingDefaultDkk: 4900, shippingFreeThresholdDkk: 200000 },
    },
  };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "cart_session" ? { value: "sess-1" } : undefined),
    set: vi.fn(),
  }),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/currency-server", async () => {
  const { brand } = await import("@/brand.config");
  return { getCheckoutCurrency: async () => brand.policies.currency };
});
vi.mock("@/lib/fx/rates", () => ({ primeFxRatesFromDb: async () => undefined }));
vi.mock("@/lib/orders/lifecycle", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/orders/lifecycle")>();
  return { ...real, transitionOrder: vi.fn(real.transitionOrder) };
});

import { bulkUpdateStatus, updateOrderStatusAdmin } from "@/app/admin/ordrer/actions";
import { GET as reconcileCronRoute } from "@/app/api/cron/reconcile-stripe/route";
import { POST as stripeWebhookRoute } from "@/app/api/webhook/stripe/route";
import { expectedStripeCharge } from "@/lib/money";
import { createOrder } from "@/lib/orders/create";
import { transitionOrder } from "@/lib/orders/lifecycle";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { updateOrderStatus } from "@/lib/tools/orders";

state.webhooks = new Stripe("sk_test_replay").webhooks;

const door = vi.mocked(transitionOrder as (move: Record<string, unknown>) => Promise<unknown>);

/** What the paths handed the door, without the client they handed it. */
function doorCalls() {
  return door.mock.calls.map(([move]) => {
    const { client: _client, ...rest } = move;
    return rest;
  });
}

const WEBHOOK = { kind: "fact", actor: "stripe-webhook:system", source: "stripe-webhook" };
const CRON = { kind: "fact", actor: "system:reconcile-cron", source: "reconcile-cron" };
const ADMIN = { kind: "operator", actor: "user:admin", source: "admin" };
const TOOL = { kind: "operator", actor: "apikey:k1", source: "orders.update_status" };

const shipping = {
  email: "buyer@shop.example.test",
  shippingName: "Buyer Example",
  shippingAddress: "Example Road 12",
  shippingZip: "1234",
  shippingCity: "Exampleton",
};

let dir = "";
let consoleError: ReturnType<typeof vi.spyOn>;
let consoleInfo: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-transition-replay-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  raw.close();
  state.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

  state.beforeTransaction = null;
  state.beforeOrderWrite = null;
  state.faultInTransaction = null;
  state.retrieveIntent.mockReset();
  state.cancelIntent.mockReset().mockResolvedValue({ status: "canceled" });
  state.createPaymentIntent.mockReset().mockImplementation(async () => ({
    paymentIntentId: `pi_replay_${++state.intentCounter}`,
    clientSecret: "pi_replay_secret",
  }));
  state.sendOrderConfirmation.mockReset().mockResolvedValue(undefined);
  state.captureException.mockReset();
  door.mockClear();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("CRON_SECRET", CRON_SECRET);

  const db = state.prisma;
  await db.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
  await db.product.createMany({
    data: [
      { id: "plain", slug: "plain", name: "Plain Mug", description: "", priceDkk: 12900, images: "[]", categoryId: "cat", stock: 5 },
      { id: "fence", slug: "fence", name: "Fence Panel", description: "", priceDkk: 50000, images: "[]", categoryId: "cat", stock: 5 },
    ],
  });
  await db.productVariant.create({
    data: { id: "fence-2m", productId: "fence", sku: "F-2M", priceDkk: 60000, stock: 3, attributes: { height: "2m" } },
  });
  await db.discountCode.create({ data: { code: "TEN", type: "percent", value: 10, usageCount: 3 } });
  await db.cart.create({ data: { id: "cart-1", sessionId: "sess-1" } });
}, 60_000);

afterEach(async () => {
  consoleError?.mockRestore();
  consoleInfo?.mockRestore();
  consoleWarn?.mockRestore();
  vi.unstubAllEnvs();
  await state.prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

// ── What the shop holds ─────────────────────────────────────────────────────

const orderRow = (id: string) => state.prisma.order.findUniqueOrThrow({ where: { id } });

async function stock() {
  const db = state.prisma;
  const [plain, fence, variant, code] = await Promise.all([
    db.product.findUniqueOrThrow({ where: { id: "plain" } }),
    db.product.findUniqueOrThrow({ where: { id: "fence" } }),
    db.productVariant.findUniqueOrThrow({ where: { id: "fence-2m" } }),
    db.discountCode.findUniqueOrThrow({ where: { code: "TEN" } }),
  ]);
  return { plain: plain.stock, fence: fence.stock, variant: variant.stock, discountUses: code.usageCount };
}

/** Where checkout leaves the shop: two of each line taken, one use of the code counted. */
const AFTER_CHECKOUT = { plain: 3, fence: 5, variant: 1, discountUses: 4 };
/** Where a cancel of that order puts it: all of it back, the variant line on the variant. */
const GIVEN_BACK = { plain: 5, fence: 5, variant: 3, discountUses: 3 };

/** The timeline, in an order that does not depend on the clock. */
async function notes(orderId: string) {
  const rows = await state.prisma.orderNote.findMany({ where: { orderId } });
  return rows
    .map(({ type, author, body, metaJson }) => ({ type, author, body, meta: metaJson ? JSON.parse(metaJson) : null }))
    .sort((a, b) => a.body.localeCompare(b.body));
}

async function auditRows() {
  const rows = await state.prisma.auditLog.findMany();
  return rows
    .map(({ actor, tool, argsJson, beforeJson, afterJson, ok, errorMsg }) => ({
      actor,
      tool,
      args: JSON.parse(argsJson),
      before: beforeJson ? JSON.parse(beforeJson) : null,
      after: afterJson ? JSON.parse(afterJson) : null,
      ok,
      errorMsg,
    }))
    .sort((a, b) => a.tool.localeCompare(b.tool));
}

// ── Getting there ───────────────────────────────────────────────────────────

/** The real checkout with Stripe ready and a discount code: stock moves, it awaits payment. */
async function checkout() {
  await state.prisma.cartItem.createMany({
    data: [
      { cartId: "cart-1", quantity: 2, productId: "plain", variantId: null },
      { cartId: "cart-1", quantity: 2, productId: "fence", variantId: "fence-2m" },
    ],
  });
  const result = await createOrder({ ...shipping, discountCode: "TEN" });
  if (!result.ok || result.paymentMode !== "stripe") throw new Error(`checkout failed: ${JSON.stringify(result)}`);
  door.mockClear();
  return result.orderId;
}

let seeded = 0;

/** An order put straight in `status`: what a path does from there, whatever that is. */
async function orderIn(status: string) {
  const id = `ord_${++seeded}`;
  await state.prisma.order.create({
    data: {
      id,
      status,
      ...shipping,
      subtotalDkk: 12900,
      shippingDkk: 4900,
      totalDkk: 17800,
      stripePaymentIntentId: `pi_${id}`,
      items: { create: [{ productId: "plain", productName: "Plain Mug", unitPriceDkk: 12900, quantity: 1 }] },
    },
  });
  return id;
}

let events = 0;

/** A signed delivery, over the real signature check. */
async function deliver(type: string, object: unknown) {
  const payload = JSON.stringify({ id: `evt_${++events}`, object: "event", type, data: { object } });
  const res = await stripeWebhookRoute(
    new Request("https://shop.example.test/api/webhook/stripe", {
      method: "POST",
      body: payload,
      headers: {
        "content-type": "application/json",
        "stripe-signature": state.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }),
      },
    }) as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function intentOf(orderId: string) {
  const order = await orderRow(orderId);
  return {
    id: order.stripePaymentIntentId,
    object: "payment_intent",
    status: "succeeded",
    ...expectedStripeCharge(order),
    payment_method_types: ["card"],
    metadata: { orderId },
  };
}

const canceledIntent = (orderId: string) => ({
  id: `pi_${orderId}`,
  object: "payment_intent",
  status: "canceled",
  metadata: { orderId },
});

function chargeOf(orderId: string | null, over: Record<string, unknown> = {}) {
  return {
    id: "ch_1",
    object: "charge",
    amount: 17800,
    amount_refunded: 17800,
    metadata: orderId ? { orderId } : {},
    payment_intent: null,
    ...over,
  };
}

function disputeOf(paymentIntent: string | null, over: Record<string, unknown> = {}) {
  return {
    id: "dp_1",
    object: "dispute",
    charge: "ch_1",
    payment_intent: paymentIntent,
    reason: "fraudulent",
    amount: 17800,
    ...over,
  };
}

/** Old enough for the cron's query, which leaves the last 5 minutes alone. */
async function ageForCron(orderId: string) {
  await state.prisma.order.update({
    where: { id: orderId },
    data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
  });
}

async function runCron() {
  const res = await reconcileCronRoute(
    new Request("https://shop.example.test/api/cron/reconcile-stripe", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }) as never,
  );
  return (await res.json()) as { results: { orderId: string; action: string }[] };
}

const callTool = (args: Record<string, unknown>) =>
  updateOrderStatus.handler(args as never, { actor: "apikey:k1", ip: "10.0.0.9", userAgent: "agent/1.0" } as never);

// ── The replay ──────────────────────────────────────────────────────────────

describe.skipIf(!sqlite)("charge.refunded: a fact, recorded from any status", () => {
  it.each(ORDER_STATUSES)("%s: refunded, refundedAt stamped, one audit row, no note, no stock", async (from) => {
    const orderId = await orderIn(from);
    const before = await orderRow(orderId);
    const stockBefore = await stock();

    const res = await deliver("charge.refunded", chargeOf(orderId));

    expect(res).toEqual({ status: 200, body: { received: true } });
    expect(await orderRow(orderId)).toEqual({ ...before, status: "refunded", refundedAt: expect.any(Date) });
    expect(await notes(orderId)).toEqual([]);
    expect(await stock()).toEqual(stockBefore);
    expect(await auditRows()).toEqual([
      {
        actor: "stripe-webhook:system",
        tool: "orders.refund",
        args: { orderId, amount: 17800, amount_refunded: 17800, partial: false },
        before: null,
        after: null,
        ok: true,
        errorMsg: null,
      },
    ]);
    expect(doorCalls()).toEqual([{ ...WEBHOOK, orderId, from: null, to: "refunded" }]);
  });

  it("part of the amount: partial_refund", async () => {
    const orderId = await orderIn("paid");

    await deliver("charge.refunded", chargeOf(orderId, { amount_refunded: 5000 }));

    const order = await orderRow(orderId);
    expect(order.status).toBe("partial_refund");
    expect(order.refundedAt).toBeInstanceOf(Date);
    const [row] = await auditRows();
    expect(row.args).toMatchObject({ partial: true, amount_refunded: 5000 });
    expect(doorCalls()).toEqual([{ ...WEBHOOK, orderId, from: null, to: "partial_refund" }]);
  });

  it("no orderId on the charge: it finds the order through the payment intent", async () => {
    const orderId = await orderIn("paid");

    await deliver("charge.refunded", chargeOf(null, { payment_intent: `pi_${orderId}` }));

    expect((await orderRow(orderId)).status).toBe("refunded");
  });

  it("no order to be found: a warning, nothing written", async () => {
    const res = await deliver("charge.refunded", chargeOf(null, { payment_intent: "pi_unknown" }));

    expect(res.status).toBe(200);
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringMatching(/charge\.refunded — kunne ikke resolve order/));
    expect(await auditRows()).toEqual([]);
    expect(doorCalls()).toEqual([]);
  });

  it("the order is gone when the write runs: logged, the audit row goes in anyway, and Stripe hears 200", async () => {
    const res = await deliver("charge.refunded", chargeOf("no-such-order"));

    expect(res).toEqual({ status: 200, body: { received: true } });
    expect(consoleError).toHaveBeenCalledWith(
      "[stripe-webhook] kunne ikke refund order no-such-order:",
      expect.objectContaining({ code: "P2025" }),
    );
    expect((await auditRows()).map((r) => r.tool)).toEqual(["orders.refund"]);
    expect(state.captureException).not.toHaveBeenCalled();
  });
});

describe.skipIf(!sqlite)("charge.dispute.created: a fact, recorded from any status", () => {
  it.each(ORDER_STATUSES)("%s: disputed, disputedAt stamped, one audit row, no note, no stock", async (from) => {
    const orderId = await orderIn(from);
    const before = await orderRow(orderId);
    const stockBefore = await stock();

    const res = await deliver("charge.dispute.created", disputeOf(`pi_${orderId}`));

    expect(res).toEqual({ status: 200, body: { received: true } });
    expect(await orderRow(orderId)).toEqual({ ...before, status: "disputed", disputedAt: expect.any(Date) });
    expect(await notes(orderId)).toEqual([]);
    expect(await stock()).toEqual(stockBefore);
    expect(await auditRows()).toEqual([
      {
        actor: "stripe-webhook:system",
        tool: "orders.dispute",
        args: { orderId, disputeId: "dp_1", reason: "fraudulent", amount: 17800 },
        before: null,
        after: null,
        ok: true,
        errorMsg: null,
      },
    ]);
    expect(doorCalls()).toEqual([{ ...WEBHOOK, orderId, from: null, to: "disputed" }]);
  });

  it("no order for the payment: a warning, nothing written", async () => {
    const res = await deliver("charge.dispute.created", disputeOf("pi_unknown"));

    expect(res.status).toBe(200);
    expect(consoleWarn).toHaveBeenCalledWith("[stripe-webhook] dispute for ukendt PI pi_unknown: dp_1");
    expect(await auditRows()).toEqual([]);
    expect(doorCalls()).toEqual([]);
  });

  it("the order is gone when the write runs: 500, so Stripe retries, Sentry hears, no audit row", async () => {
    const orderId = await orderIn("paid");
    state.beforeOrderWrite = () => state.prisma.order.delete({ where: { id: orderId } });

    const res = await deliver("charge.dispute.created", disputeOf(`pi_${orderId}`));

    expect(res).toEqual({ status: 500, body: { error: "Handler failed" } });
    expect(state.captureException).toHaveBeenCalledTimes(1);
    expect(await auditRows()).toEqual([]);
  });
});

describe.skipIf(!sqlite)("payment_intent.canceled: an unpaid order was cancelled", () => {
  it("the stock and the discount use go back, one transaction, no note, no audit row; a redelivery changes nothing", async () => {
    const orderId = await checkout();
    expect(await stock()).toEqual(AFTER_CHECKOUT);
    const before = await orderRow(orderId);

    const res = await deliver("payment_intent.canceled", canceledIntent(orderId));

    expect(res).toEqual({ status: 200, body: { received: true } });
    expect(await orderRow(orderId)).toEqual({ ...before, status: "cancelled" });
    expect(await stock()).toEqual(GIVEN_BACK);
    expect(await notes(orderId)).toEqual([]);
    expect(await auditRows()).toEqual([]);
    expect(doorCalls()).toEqual([{ ...WEBHOOK, orderId, from: "pending_payment", to: "cancelled" }]);

    await deliver("payment_intent.canceled", canceledIntent(orderId));

    expect(await stock()).toEqual(GIVEN_BACK);
    expect(consoleInfo).toHaveBeenCalledWith(
      `[stripe-webhook] payment_intent.canceled for order ${orderId} (intent pi_${orderId}): not awaiting payment — left unchanged`,
    );
  });

  it.each(ORDER_STATUSES.filter((status) => status !== "pending_payment"))(
    "%s: left alone, nothing goes back",
    async (from) => {
      const orderId = await orderIn(from);
      const before = await orderRow(orderId);
      const stockBefore = await stock();

      const res = await deliver("payment_intent.canceled", canceledIntent(orderId));

      expect(res.status).toBe(200);
      expect(await orderRow(orderId)).toEqual(before);
      expect(await stock()).toEqual(stockBefore);
    },
  );

  it("a crash after the restock rolls it all back; Stripe hears 200, and the order still awaits payment for the cron", async () => {
    const orderId = await checkout();
    state.faultInTransaction = "discountCode";

    const res = await deliver("payment_intent.canceled", canceledIntent(orderId));

    expect(res.status).toBe(200);
    expect((await orderRow(orderId)).status).toBe("pending_payment");
    expect(await stock()).toEqual(AFTER_CHECKOUT);
    expect(consoleError).toHaveBeenCalledWith(
      `[stripe-webhook] kunne ikke cancel order ${orderId}:`,
      expect.objectContaining({ message: "discountCode is down" }),
    );
  });
});

describe.skipIf(!sqlite)("payment_intent.succeeded, up against another path (RACE-MARKPAID)", () => {
  it("each status it may pay from is the condition of its write", async () => {
    for (const from of ["pending_payment", "pending", "flagged_review"]) {
      door.mockClear();
      const orderId = await orderIn(from);

      await deliver("payment_intent.succeeded", await intentOf(orderId));

      const order = await orderRow(orderId);
      expect(order).toMatchObject({ status: "paid", paymentMethod: "stripe_card" });
      expect(order.paidAt).toBeInstanceOf(Date);
      expect(doorCalls()).toEqual([{ ...WEBHOOK, orderId, from, to: "paid", paymentMethod: "stripe_card" }]);
    }
  });

  it("an amount that does not match, on a status it read: flagged, over that status", async () => {
    const orderId = await orderIn("pending");
    const before = await orderRow(orderId);

    await deliver("payment_intent.succeeded", { ...(await intentOf(orderId)), amount: 100 });

    expect(await orderRow(orderId)).toEqual({ ...before, status: "flagged_review" });
    expect(doorCalls()).toEqual([{ ...WEBHOOK, orderId, from: "pending", to: "flagged_review" }]);
  });

  it("an operator cancels after its read: the flag is lost and logged, the order stays cancelled, the stock back once", async () => {
    const orderId = await checkout();
    const intent = await intentOf(orderId);
    state.beforeOrderWrite = () => updateOrderStatusAdmin(orderId, "cancelled");

    const res = await deliver("payment_intent.succeeded", { ...intent, amount: 100 });

    expect(res.status).toBe(200);
    expect((await orderRow(orderId)).status).toBe("cancelled");
    expect(await stock()).toEqual(GIVEN_BACK);
    expect(consoleError).toHaveBeenCalledWith(
      `[stripe-webhook] order ${orderId} changed while it was being flagged — left as it is now, review manually`,
    );
  });

  it("an operator cancels after its read: the payment is lost in silence, no receipt, the order stays cancelled", async () => {
    const orderId = await checkout();
    const intent = await intentOf(orderId);
    state.beforeOrderWrite = () => updateOrderStatusAdmin(orderId, "cancelled");

    const res = await deliver("payment_intent.succeeded", intent);

    expect(res).toEqual({ status: 200, body: { received: true } });
    const order = await orderRow(orderId);
    expect(order).toMatchObject({ status: "cancelled", paymentMethod: null, paidAt: null });
    expect(state.sendOrderConfirmation).not.toHaveBeenCalled();
    expect(await stock()).toEqual(GIVEN_BACK);
  });
});

describe.skipIf(!sqlite)("the reconcile cron", () => {
  it("an intent cancelled at Stripe: the stock and the discount use go back; the next run finds nothing", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    state.retrieveIntent.mockResolvedValue({ status: "canceled" });

    expect((await runCron()).results).toEqual([{ orderId, action: "reconciled_cancelled_restocked" }]);
    expect(await runCron()).toMatchObject({ results: [] });

    expect((await orderRow(orderId)).status).toBe("cancelled");
    expect(await stock()).toEqual(GIVEN_BACK);
    expect(await notes(orderId)).toEqual([]);
    expect(await auditRows()).toEqual([]);
    expect(doorCalls()).toEqual([{ ...CRON, orderId, from: "pending_payment", to: "cancelled" }]);
  });

  it("the webhook cancels while it is asking Stripe: already_cancelled, the stock back once", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    state.retrieveIntent.mockImplementation(async () => {
      await deliver("payment_intent.canceled", canceledIntent(orderId));
      return { status: "canceled" };
    });

    expect((await runCron()).results).toEqual([{ orderId, action: "already_cancelled" }]);

    expect(await stock()).toEqual(GIVEN_BACK);
  });

  it("a crash after the restock: this order is an error, rolled back, and the run goes on", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    state.retrieveIntent.mockResolvedValue({ status: "canceled" });
    state.faultInTransaction = "discountCode";

    expect((await runCron()).results).toEqual([{ orderId, action: "error" }]);

    expect((await orderRow(orderId)).status).toBe("pending_payment");
    expect(await stock()).toEqual(AFTER_CHECKOUT);
  });

  it("the amount does not match: flagged, pinned to pending_payment", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    const before = await orderRow(orderId);
    state.retrieveIntent.mockResolvedValue({ ...(await intentOf(orderId)), amount: 100 });

    expect((await runCron()).results).toEqual([{ orderId, action: "flagged_amount_mismatch" }]);

    expect(await orderRow(orderId)).toEqual({ ...before, status: "flagged_review" });
    expect(doorCalls()).toEqual([{ ...CRON, orderId, from: "pending_payment", to: "flagged_review" }]);
  });

  it("the right amount: paid, pinned to pending_payment", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    state.retrieveIntent.mockResolvedValue(await intentOf(orderId));

    expect((await runCron()).results).toEqual([{ orderId, action: "reconciled_paid" }]);

    const order = await orderRow(orderId);
    expect(order).toMatchObject({ status: "paid", paymentMethod: "stripe_card" });
    expect(order.paidAt).toBeInstanceOf(Date);
    expect(doorCalls()).toEqual([{ ...CRON, orderId, from: "pending_payment", to: "paid", paymentMethod: "stripe_card" }]);
  });

  it("an operator cancels after its read: the flag is lost, status_changed_not_flagged, it stays cancelled", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    state.retrieveIntent.mockResolvedValue({ ...(await intentOf(orderId)), amount: 100 });
    state.beforeOrderWrite = () => updateOrderStatusAdmin(orderId, "cancelled");

    expect((await runCron()).results).toEqual([{ orderId, action: "status_changed_not_flagged" }]);

    expect((await orderRow(orderId)).status).toBe("cancelled");
    expect(await stock()).toEqual(GIVEN_BACK);
  });

  it("an operator cancels after its read: the payment is lost, already_paid_by_webhook, no receipt, it stays cancelled", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    state.retrieveIntent.mockResolvedValue(await intentOf(orderId));
    state.beforeOrderWrite = () => updateOrderStatusAdmin(orderId, "cancelled");

    expect((await runCron()).results).toEqual([{ orderId, action: "already_paid_by_webhook" }]);

    expect(await orderRow(orderId)).toMatchObject({ status: "cancelled", paymentMethod: null, paidAt: null });
    expect(state.sendOrderConfirmation).not.toHaveBeenCalled();
  });
});

describe.skipIf(!sqlite)("createOrder's rollback, when the payment cannot be set up", () => {
  async function failedCheckout() {
    state.createPaymentIntent.mockRejectedValueOnce(new Error("stripe down"));
    await state.prisma.cartItem.createMany({
      data: [
        { cartId: "cart-1", quantity: 2, productId: "plain", variantId: null },
        { cartId: "cart-1", quantity: 2, productId: "fence", variantId: "fence-2m" },
      ],
    });
    const result = await createOrder({ ...shipping, discountCode: "TEN" });
    const { id: orderId } = await state.prisma.order.findFirstOrThrow();
    return { result, orderId };
  }

  it("the order is cancelled, the stock and the discount use back, no note, no audit row", async () => {
    const { result, orderId } = await failedCheckout();

    expect(result).toMatchObject({ ok: false, code: "PAYMENT_INIT_FAILED" });
    expect((await orderRow(orderId)).status).toBe("cancelled");
    expect(await stock()).toEqual(GIVEN_BACK);
    expect(await notes(orderId)).toEqual([]);
    expect(await auditRows()).toEqual([]);
    expect(doorCalls()).toEqual([
      { kind: "fact", actor: "system:checkout", source: "checkout-rollback", orderId, from: "pending_payment", to: "cancelled" },
    ]);
  });

  it("a rollback that crashes halfway: logged, rolled back, the customer hears the same", async () => {
    state.beforeTransaction = async () => {
      // The first transaction is checkout's own. Arm the fault for the rollback's.
      state.beforeTransaction = async () => {
        state.faultInTransaction = "discountCode";
      };
    };

    const { result, orderId } = await failedCheckout();

    expect(result).toMatchObject({ ok: false, code: "PAYMENT_INIT_FAILED" });
    expect((await orderRow(orderId)).status).toBe("pending_payment");
    expect(await stock()).toEqual(AFTER_CHECKOUT);
    expect(consoleError).toHaveBeenCalledWith(
      "[createOrder] rollback-restock failed:",
      expect.objectContaining({ message: "discountCode is down" }),
    );
  });
});

describe.skipIf(!sqlite)("the admin status form", () => {
  it("a legal move: the status alone, its note, its audit row with what the write returned", async () => {
    const orderId = await orderIn("paid");
    const before = await orderRow(orderId);

    await expect(updateOrderStatusAdmin(orderId, "shipped")).resolves.toEqual({ ok: true });

    expect(await orderRow(orderId)).toEqual({ ...before, status: "shipped" });
    expect(await notes(orderId)).toEqual([
      { type: "system", author: "user:admin", body: "Status: Paid → Shipped", meta: { from: "paid", to: "shipped" } },
    ]);
    expect(await auditRows()).toEqual([
      {
        actor: "user:admin",
        tool: "orders.update_status",
        args: { orderId, from: "paid", to: "shipped" },
        before: { status: "paid" },
        after: { restocked: false },
        ok: true,
        errorMsg: null,
      },
    ]);
    expect(state.cancelIntent).not.toHaveBeenCalled();
    expect(doorCalls()).toEqual([{ ...ADMIN, orderId, from: "paid", to: "shipped" }]);
  });

  it("a cancel of an order awaiting payment: the stock and the discount use back, the note says so, then Stripe", async () => {
    const orderId = await checkout();
    state.retrieveIntent.mockResolvedValue({ status: "requires_payment_method" });

    await expect(updateOrderStatusAdmin(orderId, "cancelled")).resolves.toEqual({ ok: true });

    expect((await orderRow(orderId)).status).toBe("cancelled");
    expect(await stock()).toEqual(GIVEN_BACK);
    const intent = (await orderRow(orderId)).stripePaymentIntentId;
    expect(state.cancelIntent).toHaveBeenCalledExactlyOnceWith(intent);
    expect(await notes(orderId)).toEqual([
      {
        type: "system",
        author: "user:admin",
        body: "Status: Awaiting payment → Cancelled — items returned to stock",
        meta: { from: "pending_payment", to: "cancelled", restocked: true },
      },
      {
        type: "system",
        author: "user:admin",
        body: "Stripe payment cancelled — the customer can no longer pay for this order.",
        meta: { intentId: intent, outcome: "canceled" },
      },
    ]);
    const rows = await auditRows();
    expect(rows.map((r) => r.tool)).toEqual(["orders.cancel_payment_intent", "orders.update_status"]);
    expect(rows[1]).toMatchObject({
      args: { orderId, from: "pending_payment", to: "cancelled", restocked: true },
      after: { restocked: true },
    });
    expect(doorCalls()).toEqual([{ ...ADMIN, orderId, from: "pending_payment", to: "cancelled" }]);
  });

  it("a cancel of a paid order: no restock, as before ORD1-c", async () => {
    const orderId = await orderIn("paid");
    state.retrieveIntent.mockResolvedValue({ status: "succeeded" });
    const stockBefore = await stock();

    await updateOrderStatusAdmin(orderId, "cancelled");

    expect((await orderRow(orderId)).status).toBe("cancelled");
    expect(await stock()).toEqual(stockBefore);
    expect(state.cancelIntent).not.toHaveBeenCalled();
    const bodies = (await notes(orderId)).map((n) => n.body);
    expect(bodies).toContain("Status: Paid → Cancelled");
  });

  it("a refund status: registered as manual, no refundedAt, the note and the audit say no money moved", async () => {
    const orderId = await orderIn("paid");

    await updateOrderStatusAdmin(orderId, "refunded");

    const order = await orderRow(orderId);
    expect(order.status).toBe("refunded");
    expect(order.refundedAt).toBeNull();
    expect(await notes(orderId)).toEqual([
      {
        type: "system",
        author: "user:admin",
        body: "Manual registration — no money moved: Status: Paid → Refunded",
        meta: { from: "paid", to: "refunded", manual: true, moneyMoved: false },
      },
    ]);
    const [row] = await auditRows();
    expect(row.args).toEqual({ orderId, from: "paid", to: "refunded", manual: true, moneyMoved: false });
  });

  it("marking an order paid: no paidAt, no paymentMethod, as before", async () => {
    const orderId = await orderIn("pending");

    await updateOrderStatusAdmin(orderId, "paid");

    expect(await orderRow(orderId)).toMatchObject({ status: "paid", paidAt: null, paymentMethod: null });
  });

  it("an illegal move: the table's own words, nothing written, and no audit row", async () => {
    const orderId = await orderIn("refunded");
    const before = await orderRow(orderId);

    await expect(updateOrderStatusAdmin(orderId, "paid")).resolves.toEqual({
      ok: false,
      error: "Illegal order transition: refunded → paid. Legal next states from refunded: [(terminal)]",
    });

    expect(await orderRow(orderId)).toEqual(before);
    expect(await notes(orderId)).toEqual([]);
    expect(await auditRows()).toEqual([]);
    expect(doorCalls()).toEqual([]);
  });

  it("a status the engine does not know moves on, with the raw name in the note", async () => {
    const orderId = await orderIn("on_hold");

    await expect(updateOrderStatusAdmin(orderId, "paid")).resolves.toEqual({ ok: true });

    expect((await orderRow(orderId)).status).toBe("paid");
    expect((await notes(orderId)).map((n) => n.body)).toEqual(["Status: on_hold → Paid"]);
  });

  it("an unknown target, a missing order: refused before anything else", async () => {
    const orderId = await orderIn("paid");
    await expect(updateOrderStatusAdmin(orderId, "on_hold")).resolves.toEqual({ ok: false, error: "Invalid status: on_hold" });
    await expect(updateOrderStatusAdmin("no-such-order", "shipped")).resolves.toEqual({ ok: false, error: "Order not found" });
    expect(await auditRows()).toEqual([]);
  });

  it("the order moved after the read: refused, the operator reloads, the audit row says it failed, Stripe is not called", async () => {
    const orderId = await orderIn("paid");
    state.beforeTransaction = () => state.prisma.order.update({ where: { id: orderId }, data: { status: "shipped" } });
    const message = `Order ${orderId} is no longer "Paid" — it changed while it was being updated. Reload the order and try again.`;

    await expect(updateOrderStatusAdmin(orderId, "cancelled")).resolves.toEqual({ ok: false, error: message });

    expect((await orderRow(orderId)).status).toBe("shipped");
    expect(await notes(orderId)).toEqual([]);
    expect(state.retrieveIntent).not.toHaveBeenCalled();
    expect(await auditRows()).toEqual([
      {
        actor: "user:admin",
        tool: "orders.update_status",
        args: { orderId, from: "paid", to: "cancelled" },
        before: { status: "paid" },
        after: null,
        ok: false,
        errorMsg: message,
      },
    ]);
  });

  it("a cancel after the webhook cancelled: refused in its own words, the stock back once", async () => {
    const orderId = await checkout();
    state.beforeTransaction = () => deliver("payment_intent.canceled", canceledIntent(orderId));

    const result = await updateOrderStatusAdmin(orderId, "cancelled");

    expect(result).toEqual({
      ok: false,
      error: `Order ${orderId} is no longer awaiting payment — it changed while it was being cancelled. Reload the order and try again.`,
    });
    expect(await stock()).toEqual(GIVEN_BACK);
    expect(await notes(orderId)).toEqual([]);
    expect(state.retrieveIntent).not.toHaveBeenCalled();
  });

  it("a crash writing the note takes the move with it: one transaction, as it was", async () => {
    const orderId = await orderIn("paid");
    state.faultInTransaction = "orderNote";

    await expect(updateOrderStatusAdmin(orderId, "shipped")).rejects.toThrow("orderNote is down");

    expect((await orderRow(orderId)).status).toBe("paid");
    const [row] = await auditRows();
    expect(row).toMatchObject({ ok: false, errorMsg: "orderNote is down" });
  });

  it("the bulk action: each order on its own, what it could not move named", async () => {
    const shipped = await orderIn("paid");
    const refused = await orderIn("refunded");

    await expect(bulkUpdateStatus([shipped, refused, "no-such-order"], "shipped")).resolves.toEqual({
      updated: 1,
      skipped: [
        { id: refused, reason: "Illegal order transition: refunded → shipped. Legal next states from refunded: [(terminal)]" },
        { id: "no-such-order", reason: "Order not found" },
      ],
    });

    expect((await orderRow(shipped)).status).toBe("shipped");
    expect((await orderRow(refused)).status).toBe("refunded");
    expect(await notes(refused)).toEqual([]);
    expect(doorCalls()).toEqual([{ ...ADMIN, orderId: shipped, from: "paid", to: "shipped" }]);
  });
});

describe.skipIf(!sqlite)("orders.update_status", () => {
  it("a legal move: the same note as the admin form, its own audit row", async () => {
    const orderId = await orderIn("paid");
    const before = await orderRow(orderId);

    await expect(callTool({ orderId, status: "shipped" })).resolves.toEqual({ id: orderId, status: "shipped" });

    expect(await orderRow(orderId)).toEqual({ ...before, status: "shipped" });
    expect(await notes(orderId)).toEqual([
      { type: "system", author: "apikey:k1", body: "Status: Paid → Shipped", meta: { from: "paid", to: "shipped" } },
    ]);
    expect(await auditRows()).toEqual([
      {
        actor: "apikey:k1",
        tool: "orders.update_status",
        args: { orderId, status: "shipped" },
        before: { status: "paid" },
        after: { id: orderId, status: "shipped" },
        ok: true,
        errorMsg: null,
      },
    ]);
    expect(doorCalls()).toEqual([{ ...TOOL, orderId, from: "paid", to: "shipped" }]);
  });

  it("a cancel of an order awaiting payment: restocked in the result, the payment outcome too", async () => {
    const orderId = await checkout();
    state.retrieveIntent.mockResolvedValue({ status: "requires_payment_method" });

    await expect(callTool({ orderId, status: "cancelled" })).resolves.toEqual({
      id: orderId,
      status: "cancelled",
      restocked: true,
      paymentIntent: {
        outcome: "canceled",
        note: "Stripe payment cancelled — the customer can no longer pay for this order.",
      },
    });

    expect(await stock()).toEqual(GIVEN_BACK);
    expect((await notes(orderId)).map((n) => n.body)).toContain(
      "Status: Awaiting payment → Cancelled — items returned to stock",
    );
  });

  it("a manual partial refund: the tool's own wording, no refundedAt, moneyMoved false", async () => {
    const orderId = await orderIn("paid");

    await expect(
      callTool({ orderId, status: "partial_refund", manual: true, confirm: true, refundDkk: 5000 }),
    ).resolves.toEqual({ id: orderId, status: "partial_refund", moneyMoved: false });

    const order = await orderRow(orderId);
    expect(order.status).toBe("partial_refund");
    expect(order.refundedAt).toBeNull();
    expect(await notes(orderId)).toEqual([
      {
        type: "system",
        author: "apikey:k1",
        body: "Manual registration — no money moved: status set to partial_refund (5000 øre refunded outside the shop).",
        meta: { manual: true, moneyMoved: false, refundDkk: 5000 },
      },
    ]);
  });

  it("an illegal move throws, writes nothing, and leaves a failed audit row with what it read", async () => {
    const orderId = await orderIn("refunded");
    const before = await orderRow(orderId);
    const message = "Illegal order transition: refunded → shipped. Legal next states from refunded: [(terminal)]";

    await expect(callTool({ orderId, status: "shipped" })).rejects.toThrow(message);

    expect(await orderRow(orderId)).toEqual(before);
    expect(await notes(orderId)).toEqual([]);
    expect(await auditRows()).toEqual([
      {
        actor: "apikey:k1",
        tool: "orders.update_status",
        args: { orderId, status: "shipped" },
        before: { status: "refunded" },
        after: null,
        ok: false,
        errorMsg: message,
      },
    ]);
    expect(doorCalls()).toEqual([]);
  });

  it("the table is read before the amount: an illegal refund says illegal, whatever its amount", async () => {
    const orderId = await orderIn("refunded");

    await expect(
      callTool({ orderId, status: "partial_refund", manual: true, confirm: true, refundDkk: 999999 }),
    ).rejects.toThrow(/Illegal order transition/);
  });

  it("a refund at or above the total is refused, and nothing is written", async () => {
    const orderId = await orderIn("paid");

    await expect(
      callTool({ orderId, status: "partial_refund", manual: true, confirm: true, refundDkk: 17800 }),
    ).rejects.toThrow(/must be below the order total/);

    expect((await orderRow(orderId)).status).toBe("paid");
    expect(await notes(orderId)).toEqual([]);
  });

  it("the order moved after the read: it throws, nothing written, the audit row says so", async () => {
    const orderId = await orderIn("paid");
    state.beforeTransaction = () => state.prisma.order.update({ where: { id: orderId }, data: { status: "shipped" } });

    await expect(callTool({ orderId, status: "cancelled" })).rejects.toThrow(/changed while it was being updated/);

    expect((await orderRow(orderId)).status).toBe("shipped");
    expect(await notes(orderId)).toEqual([]);
    expect(state.retrieveIntent).not.toHaveBeenCalled();
    const [row] = await auditRows();
    expect(row).toMatchObject({ ok: false, errorMsg: expect.stringMatching(/changed while it was being updated/) });
  });
});
