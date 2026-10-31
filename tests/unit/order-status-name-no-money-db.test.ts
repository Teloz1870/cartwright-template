import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient, type Prisma } from "@/app/generated/prisma/client";

/**
 * ORD1-a1 — a status's NAME never legitimises money, and neither does what its row
 * says. The same purchase runs over the real route handlers on a real libSQL file,
 * under three tables: empty, seeded 1:1, and full of rows that lie. A row called
 * "paid" or "betalt" that denies it, an awaiting-payment row that claims to be
 * paid, a cancelled row that claims to be revenue and to keep its stock. Every run
 * must end the same to the digit: same statuses, same mails, same stock, same
 * revenue. The stand-ins are Stripe's network calls, the mail provider and the
 * request (cookie, session), as in on-order-paid-replay-db.test.ts.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const WEBHOOK_SECRET = "whsec_status_test";
const CRON_SECRET = "cron-status-test";

const state = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  webhooks: null as unknown as Stripe["webhooks"],
  intentCounter: 0,
  retrieveIntent: vi.fn(),
  cancelIntent: vi.fn(),
  sendOrderConfirmation: vi.fn(),
  sendOwnerNewOrderEmail: vi.fn(),
  emitMarketingEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get prisma() {
    return state.prisma;
  },
}));
vi.mock("@/lib/stripe", () => ({
  isStripeReady: async () => true,
  getStripeKeys: async () => ({ publishableKey: "pk_test_status", webhookSecret: WEBHOOK_SECRET }),
  getStripeClient: async () => ({
    webhooks: state.webhooks,
    paymentIntents: { retrieve: state.retrieveIntent, cancel: state.cancelIntent },
  }),
  createPaymentIntent: async () => ({
    paymentIntentId: `pi_status_${++state.intentCounter}`,
    clientSecret: "pi_status_secret",
  }),
}));
vi.mock("@/lib/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mailer")>()),
  mailer: { sendOrderConfirmation: state.sendOrderConfirmation },
  sendOwnerNewOrderEmail: state.sendOwnerNewOrderEmail,
}));
vi.mock("@/lib/marketing/automations", () => ({
  emitMarketingEvent: state.emitMarketingEvent,
  MARKETING_EVENTS: { orderPlaced: "cartwright.order.placed" },
}));
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({
    features: { ownerOrderEmail: true },
    emails: { admin: "owner@shop.example.test" },
    url: "https://shop.example.test",
  }),
}));
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

import { bulkUpdateStatus, updateOrderStatusAdmin } from "@/app/admin/ordrer/actions";
import { GET as reconcileCronRoute } from "@/app/api/cron/reconcile-stripe/route";
import { POST as stripeWebhookRoute } from "@/app/api/webhook/stripe/route";
import { expectedStripeCharge } from "@/lib/money";
import { createOrder } from "@/lib/orders/create";
import { getOrderStatuses } from "@/lib/orders/status-reader";
import { seedOrderStatuses } from "@/lib/orders/status-seed";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { analyticsSummary } from "@/lib/tools/analytics";
import { listOrders, updateOrderStatus } from "@/lib/tools/orders";

// Each test runs real routes or renders real pages on a real database file: a
// busy runner must not turn slow into red.
vi.setConfig({ testTimeout: 30_000 });

state.webhooks = new Stripe("sk_test_status").webhooks;

/** Every row here says the opposite of what the status does, under a name that invites it. */
const LYING_ROWS: Prisma.OrderStatusCreateManyInput[] = [
  // The real `paid`, renamed and denying it, and claiming to give stock back.
  { key: "paid", label: "betalt", isPaid: false, isFinal: true, countsAsRevenue: false, stockEffect: "release", notifyCustomer: false },
  // Still awaiting payment, saying it is paid, final and mailed, holding no stock.
  { key: "pending_payment", label: "paid", isPaid: true, isFinal: true, stockEffect: "none", notifyCustomer: true },
  { key: "flagged_review", label: "Paid", isPaid: true, stockEffect: "release", notifyCustomer: true },
  // Cancelled, saying it is paid, revenue, open, mailed, and keeping its stock.
  { key: "cancelled", label: "paid", isPaid: true, isFinal: false, countsAsRevenue: true, stockEffect: "reserve", notifyCustomer: true },
  // Out of the totals by its own word, or mailing the customer on arrival.
  { key: "refunded", label: "Refunded", countsAsRevenue: false, notifyCustomer: true },
  { key: "shipped", label: "Shipped", countsAsRevenue: false, stockEffect: "release", notifyCustomer: true },
  // A shop's own statuses: one with the Danish word for paid that denies it, one
  // that declares every meaning a money path could want.
  { key: "betalt", label: "betalt", isPaid: false, countsAsRevenue: false },
  { key: "mine", label: "Paid", isPaid: true, isFinal: true, countsAsRevenue: false, stockEffect: "release", notifyCustomer: true },
];

const TABLES: [string, () => Promise<unknown>][] = [
  ["an empty table", async () => {}],
  ["a table seeded 1:1", () => seedOrderStatuses(state.prisma)],
  ["a table of rows that lie", () => state.prisma.orderStatus.createMany({ data: LYING_ROWS })],
];

let dir = "";

beforeEach(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-status-money-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  raw.close();
  state.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

  state.retrieveIntent.mockReset().mockResolvedValue({ status: "requires_payment_method" });
  state.cancelIntent.mockReset().mockResolvedValue({ status: "canceled" });
  state.sendOrderConfirmation.mockReset().mockResolvedValue(undefined);
  state.sendOwnerNewOrderEmail.mockReset().mockResolvedValue(undefined);
  state.emitMarketingEvent.mockReset().mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("CRON_SECRET", CRON_SECRET);

  await state.prisma.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
  await state.prisma.product.create({
    data: { id: "mug", slug: "mug", name: "Plain Mug", description: "", priceDkk: 12900, images: "[]", categoryId: "cat", stock: 20 },
  });
  await state.prisma.cart.create({ data: { id: "cart-1", sessionId: "sess-1" } });
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await state.prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** The real checkout with Stripe ready: one mug, the stock moves, the order awaits payment. */
async function checkout() {
  await state.prisma.cartItem.create({ data: { cartId: "cart-1", productId: "mug", quantity: 1 } });
  const result = await createOrder({
    email: "buyer@shop.example.test",
    shippingName: "Buyer Example",
    shippingAddress: "Example Road 12",
    shippingZip: "1234",
    shippingCity: "Exampleton",
  });
  if (!result.ok || result.paymentMode !== "stripe") throw new Error(`checkout failed: ${JSON.stringify(result)}`);
  return result.orderId;
}

const order = (id: string) => state.prisma.order.findUniqueOrThrow({ where: { id } });

/** The PaymentIntent Stripe holds for this order: charged exactly what it says. */
async function intentOf(orderId: string) {
  const row = await order(orderId);
  return {
    id: row.stripePaymentIntentId ?? `pi_${orderId}`,
    object: "payment_intent",
    status: "succeeded",
    ...expectedStripeCharge(row),
    payment_method_types: ["card"],
    metadata: { orderId },
  };
}

let eventCounter = 0;

/** A signed delivery, over the real signature check. */
async function deliver(type: string, object: unknown) {
  const payload = JSON.stringify({ id: `evt_${++eventCounter}`, object: "event", type, data: { object } });
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
  expect(res.status).toBe(200);
}

const succeeded = async (orderId: string) => deliver("payment_intent.succeeded", await intentOf(orderId));

async function runCron() {
  const res = await reconcileCronRoute(
    new Request("https://shop.example.test/api/cron/reconcile-stripe", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }) as never,
  );
  return (await res.json()) as { results: { orderId: string; action: string }[] };
}

const stock = async () => (await state.prisma.product.findUniqueOrThrow({ where: { id: "mug" } })).stock;

const mails = () => ({
  receipts: state.sendOrderConfirmation.mock.calls.length,
  ownerMails: state.sendOwnerNewOrderEmail.mock.calls.length,
  events: state.emitMarketingEvent.mock.calls.length,
});

const auditCount = (tool: string) => state.prisma.auditLog.count({ where: { tool } });

/** An order already in a status no code knows: how a shop's own status would look. */
function orderIn(status: string) {
  return state.prisma.order.create({
    data: {
      email: "buyer@shop.example.test",
      shippingName: "Buyer Example",
      shippingAddress: "Example Road 12",
      shippingZip: "1234",
      shippingCity: "Exampleton",
      subtotalDkk: 12900,
      shippingDkk: 0,
      totalDkk: 12900,
      status,
      stripePaymentIntentId: `pi_own_${status}`,
      createdAt: new Date(Date.now() - 10 * 60 * 1000), // old enough for the cron's query
    },
  });
}

describe.skipIf(!sqlite).each(TABLES)("%s changes no money", (_name, fillTable) => {
  beforeEach(() => fillTable());

  it("a signed success pays an order, whatever `pending_payment` and `paid` say about themselves", async () => {
    const id = await checkout();
    expect(await stock()).toBe(19);

    await succeeded(id);

    expect((await order(id)).status).toBe("paid");
    expect(mails()).toEqual({ receipts: 1, ownerMails: 1, events: 1 });
    expect(await stock()).toBe(19);
  });

  it("the cron pays the one the webhook missed, and the same success again fires nothing", async () => {
    const id = await checkout();
    await state.prisma.order.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    const intent = await intentOf(id);
    state.retrieveIntent.mockResolvedValue(intent);

    expect((await runCron()).results).toEqual([{ orderId: id, action: "reconciled_paid" }]);
    await deliver("payment_intent.succeeded", intent);

    expect((await order(id)).status).toBe("paid");
    expect(mails()).toEqual({ receipts: 1, ownerMails: 1, events: 0 });
  });

  it("the wrong amount flags the order and mails nobody, whatever `flagged_review` says", async () => {
    const id = await checkout();

    await deliver("payment_intent.succeeded", { ...(await intentOf(id)), amount: 100 });

    expect((await order(id)).status).toBe("flagged_review");
    expect(mails()).toEqual({ receipts: 0, ownerMails: 0, events: 0 });
  });

  it("a cancel before payment gives the stock back, a cancel after it does not, whatever the rows say", async () => {
    const unpaid = await checkout();
    expect(await stock()).toBe(19);
    expect(await updateOrderStatusAdmin(unpaid, "cancelled")).toEqual({ ok: true });
    expect((await order(unpaid)).status).toBe("cancelled");
    expect(await stock()).toBe(20);

    const paid = await checkout();
    await succeeded(paid);
    expect(await stock()).toBe(19);
    state.retrieveIntent.mockResolvedValue({ status: "succeeded" });
    expect(await updateOrderStatusAdmin(paid, "cancelled")).toEqual({ ok: true });
    expect((await order(paid)).status).toBe("cancelled");
    expect(await stock()).toBe(19);
  });

  it("a late success stays out of a cancelled order, and the machine says what is final, not the row", async () => {
    const id = await checkout();
    const intent = await intentOf(id);
    await updateOrderStatusAdmin(id, "cancelled");

    await deliver("payment_intent.succeeded", intent);

    expect((await order(id)).status).toBe("cancelled");
    expect(mails()).toEqual({ receipts: 0, ownerMails: 0, events: 0 });
    expect(await auditCount("orders.payment_not_applied")).toBe(1);
    expect(await updateOrderStatusAdmin(id, "paid")).toMatchObject({ ok: false, error: expect.stringMatching(/Illegal order transition/) });

    // And `paid`'s row calling itself final stops no operator move out of it.
    const paid = await checkout();
    await succeeded(paid);
    expect(await updateOrderStatusAdmin(paid, "shipped")).toEqual({ ok: true });
    expect((await order(paid)).status).toBe("shipped");
  });

  it("moving a status by hand mails nobody, whatever notifyCustomer says", async () => {
    const id = await checkout();
    await succeeded(id);
    const before = mails();

    await updateOrderStatusAdmin(id, "shipped");
    await updateOrderStatusAdmin(id, "delivered");
    await updateOrderStatusAdmin(id, "completed");

    expect(mails()).toEqual(before);
  });

  it("a refund event writes the status and mails nobody, whatever `refunded` says", async () => {
    const id = await checkout();
    await succeeded(id);
    const before = mails();
    const { amount } = await intentOf(id);

    await deliver("charge.refunded", { id: "ch_1", object: "charge", amount, amount_refunded: amount, metadata: { orderId: id } });

    expect((await order(id)).status).toBe("refunded");
    expect(mails()).toEqual(before);
  });

  it("revenue is every order but the cancelled ones, whatever countsAsRevenue says", async () => {
    const paid = await checkout();
    await succeeded(paid);
    const awaiting = await checkout();
    const cancelled = await checkout();
    await updateOrderStatusAdmin(cancelled, "cancelled");
    const shipped = await checkout();
    await succeeded(shipped);
    await updateOrderStatusAdmin(shipped, "shipped");
    const refunded = await checkout();
    await succeeded(refunded);
    await deliver("charge.refunded", { id: "ch_2", object: "charge", amount: 1, amount_refunded: 1, metadata: { orderId: refunded } });
    const own = await orderIn("mine");
    const own2 = await orderIn("betalt");

    const expected = (await Promise.all([paid, awaiting, shipped, refunded].map(order))).reduce((sum, o) => sum + o.totalDkk, 0)
      + own.totalDkk + own2.totalDkk;

    const summary = await analyticsSummary.handler(
      { lowStockThreshold: 3, topProductsLimit: 5 },
      { actor: "user:admin" } as never,
    );
    expect(summary.orders.revenueOere).toBe(expected);
  });
});

describe.skipIf(!sqlite).each(TABLES)("%s: a status of the shop's own never reaches a money path", (_name, fillTable) => {
  beforeEach(() => fillTable());

  it.each(["betalt", "mine"])("an order in `%s` is not paid by a success, however its row reads, and nothing fires", async (status) => {
    const own = await orderIn(status);

    await succeeded(own.id);

    expect((await order(own.id)).status).toBe(status);
    expect((await order(own.id)).paidAt).toBeNull();
    expect(mails()).toEqual({ receipts: 0, ownerMails: 0, events: 0 });
    expect(await auditCount("orders.payment_not_applied")).toBe(1);
  });

  it("the cron does not look at it", async () => {
    await orderIn("mine");
    await orderIn("betalt");
    state.retrieveIntent.mockResolvedValue({ status: "succeeded" });

    expect((await runCron()).results).toEqual([]);
    expect(state.retrieveIntent).not.toHaveBeenCalled();
  });

  it.each(["betalt", "mine"])("no operator path writes `%s`", async (status) => {
    const id = await checkout();

    expect(await updateOrderStatusAdmin(id, status)).toEqual({ ok: false, error: `Invalid status: ${status}` });
    expect(await bulkUpdateStatus([id], status)).toMatchObject({ updated: 0, skipped: [{ id }] });

    expect((await order(id)).status).toBe("pending_payment");
  });

  it.each(["betalt", "mine"])("the tools' schemas stay the static 12 (B22 = b): `%s` is refused", (status) => {
    expect(updateOrderStatus.input.safeParse({ orderId: "o1", status }).success).toBe(false);
    expect(listOrders.input.safeParse({ status }).success).toBe(false);
    for (const known of ORDER_STATUSES) {
      expect(listOrders.input.safeParse({ status: known }).success, known).toBe(true);
    }
  });
});

describe.skipIf(!sqlite)("the rows that lie are really there", () => {
  it("the reader shows them as they declare themselves: that is all they reach", async () => {
    await state.prisma.orderStatus.createMany({ data: LYING_ROWS });

    const rows = await getOrderStatuses();

    expect(rows.find((r) => r.key === "paid")).toMatchObject({ label: "betalt", isPaid: false, countsAsRevenue: false, stockEffect: "release" });
    expect(rows.find((r) => r.key === "pending_payment")).toMatchObject({ label: "paid", isPaid: true });
    expect(rows.find((r) => r.key === "cancelled")).toMatchObject({ isPaid: true, countsAsRevenue: true, stockEffect: "reserve" });
    expect(rows.find((r) => r.key === "betalt")).toMatchObject({ label: "betalt", isPaid: false });
    expect(rows.find((r) => r.key === "mine")).toMatchObject({ label: "Paid", isPaid: true, stockEffect: "release", notifyCustomer: true });
  });
});
