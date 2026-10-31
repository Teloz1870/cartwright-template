import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient, type Prisma } from "@/app/generated/prisma/client";

/**
 * ORD0-a — a replay of everything that can make an order paid, over the REAL
 * route handlers on a real libSQL file: the Stripe webhook (with a genuine
 * signature check), the reconcile cron, the ACP complete route and mock-mode
 * checkout. The stand-ins are Stripe's network calls, the mail provider, the
 * marketing event and the request (cookie, session); the shop's config turns the
 * owner mail and ACP on, and fixes the shipping policy and a test currency.
 * `onOrderPaid` is the real one, wrapped so the table below can read what each
 * path handed it.
 *
 * What it pins: signed, repeated and late events give exactly one receipt, one
 * owner mail and one stock change, and the races on a paid write leave one of
 * each. Stock moves when the order is created and never again, so "one stock
 * change" is the stock staying where checkout left it through every replay.
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
  stripeReady: true,
  /** The currency the customer picked; null is the shop's own. */
  checkoutCurrency: null as string | null,
  /** Runs once as a `$transaction` opens: another path gets there first. */
  beforeTransaction: null as null | (() => Promise<unknown>),
  /** Runs once before an `order.updateMany`: the same, for a conditional write. */
  beforeOrderWrite: null as null | (() => Promise<unknown>),
  intentCounter: 0,
  retrieveIntent: vi.fn(),
  createIntent: vi.fn(),
  sendOrderConfirmation: vi.fn(),
  sendOwnerNewOrderEmail: vi.fn(),
  emitMarketingEvent: vi.fn(),
}));

function once(step: "beforeTransaction" | "beforeOrderWrite") {
  const run = state[step];
  state[step] = null;
  return run?.();
}

// The real client, with two seams to interleave one path inside another.
vi.mock("@/lib/db", () => ({
  get prisma() {
    return new Proxy(state.prisma, {
      get(target, key) {
        if (key === "$transaction") {
          return async (fn: Parameters<PrismaClient["$transaction"]>[0]) => {
            await once("beforeTransaction");
            return target.$transaction(fn as never);
          };
        }
        if (key === "order") {
          return new Proxy(target.order, {
            get(order, method) {
              if (method !== "updateMany") return Reflect.get(order, method, order);
              return async (args: Parameters<typeof order.updateMany>[0]) => {
                await once("beforeOrderWrite");
                return order.updateMany(args);
              };
            },
          });
        }
        return Reflect.get(target, key, target);
      },
    });
  },
}));
vi.mock("@/lib/stripe", () => ({
  isStripeReady: async () => state.stripeReady,
  getStripeKeys: async () => ({ publishableKey: "pk_test_replay", webhookSecret: WEBHOOK_SECRET }),
  getStripeClient: async () => ({
    webhooks: state.webhooks,
    paymentIntents: { retrieve: state.retrieveIntent, create: state.createIntent },
    refunds: { create: vi.fn() },
  }),
  createPaymentIntent: async () => ({
    paymentIntentId: `pi_replay_${++state.intentCounter}`,
    clientSecret: "pi_replay_secret",
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
// The real notifyOwnerOfPaidOrder, on a shop with its flag on.
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({
    features: { ownerOrderEmail: true },
    emails: { admin: "owner@shop.example.test" },
    url: "https://shop.example.test",
  }),
}));
// The ACP routes answer 404 unless the shop's config opts in. The shipping policy
// and a currency are fixed, so the figures in the table below hold in any fork.
// XTS is ISO 4217's code reserved for tests: no shop has it as its own.
vi.mock("@/brand.config", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/brand.config")>();
  return {
    ...real,
    brand: {
      ...real.brand,
      acp: { ...real.brand.acp, enabled: true },
      policies: {
        ...real.brand.policies,
        shippingDefaultDkk: 4900,
        shippingFreeThresholdDkk: 200000,
        supportedCurrencies: {
          ...real.brand.policies.supportedCurrencies,
          XTS: { rate: 0.5, label: "Test currency" },
        },
      },
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
// An operator's server action: a signed-in admin, nothing to revalidate.
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/currency-server", async () => {
  const { brand } = await import("@/brand.config");
  return { getCheckoutCurrency: async () => state.checkoutCurrency ?? brand.policies.currency };
});
vi.mock("@/lib/fx/rates", () => ({ primeFxRatesFromDb: async () => undefined }));
vi.mock("@/lib/orders/on-paid", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/orders/on-paid")>();
  return { ...real, onOrderPaid: vi.fn(real.onOrderPaid) };
});

import { brand } from "@/brand.config";
import { POST as acpCompleteRoute } from "@/app/api/acp/v1/checkout_sessions/[id]/complete/route";
import { resendConfirmation } from "@/app/admin/ordrer/actions";
import { GET as reconcileCronRoute } from "@/app/api/cron/reconcile-stripe/route";
import { POST as stripeWebhookRoute } from "@/app/api/webhook/stripe/route";
import { expectedStripeCharge } from "@/lib/money";
import { createOrder } from "@/lib/orders/create";
import { createOrderFromAcpSession } from "@/lib/orders/create-acp";
import { onOrderPaid } from "@/lib/orders/on-paid";
import { writeOperatorStatus } from "@/lib/orders/operator-status";

state.webhooks = new Stripe("sk_test_replay").webhooks;

const door = vi.mocked(onOrderPaid);

const BASE_CURRENCY = brand.policies.currency;
const shipping = {
  email: "buyer@shop.example.test",
  shippingName: "Buyer Example",
  shippingAddress: "Example Road 12",
  shippingZip: "1234",
  shippingCity: "Exampleton",
};

type CartLine = { productId: string; variantId: string | null };

/** "plain" sells without variants; "fence" sells only through its variant. */
const PLAIN: CartLine = { productId: "plain", variantId: null };
const VARIANT: CartLine = { productId: "fence", variantId: "fence-2m" };

let dir = "";
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-on-paid-replay-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  raw.close();
  state.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

  state.stripeReady = true;
  state.checkoutCurrency = null;
  state.beforeTransaction = null;
  state.beforeOrderWrite = null;
  state.retrieveIntent.mockReset();
  state.createIntent.mockReset().mockResolvedValue({ id: "pi_acp", status: "succeeded" });
  state.sendOrderConfirmation.mockReset().mockResolvedValue(undefined);
  state.sendOwnerNewOrderEmail.mockReset().mockResolvedValue(undefined);
  state.emitMarketingEvent.mockReset().mockResolvedValue(false);
  door.mockClear();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubEnv("ACP_PAYMENT_COMPLETION", "1");

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
  await db.cart.create({ data: { id: "cart-1", sessionId: "sess-1" } });
}, 60_000);

afterEach(async () => {
  consoleError?.mockRestore();
  vi.unstubAllEnvs();
  await state.prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

// ── What the shop did ───────────────────────────────────────────────────────

function fired() {
  return {
    receipts: state.sendOrderConfirmation.mock.calls.length,
    ownerMails: state.sendOwnerNewOrderEmail.mock.calls.length,
    events: state.emitMarketingEvent.mock.calls.length,
  };
}

const ONE_OF_EACH = { receipts: 1, ownerMails: 1, events: 1 };
const NOTHING = { receipts: 0, ownerMails: 0, events: 0 };

async function stock() {
  const db = state.prisma;
  const [plain, fence, variant] = await Promise.all([
    db.product.findUniqueOrThrow({ where: { id: "plain" } }),
    db.product.findUniqueOrThrow({ where: { id: "fence" } }),
    db.productVariant.findUniqueOrThrow({ where: { id: "fence-2m" } }),
  ]);
  return { plain: plain.stock, fence: fence.stock, variant: variant.stock };
}

const orderRow = (id: string) => state.prisma.order.findUniqueOrThrow({ where: { id } });

// ── Getting there ───────────────────────────────────────────────────────────

const fillCart = (lines: CartLine[]) =>
  state.prisma.cartItem.createMany({ data: lines.map((line) => ({ cartId: "cart-1", quantity: 2, ...line })) });

/** The real checkout with Stripe ready: the stock moves, the order awaits payment. */
async function checkout(lines: CartLine[] = [PLAIN], discountCode?: string) {
  await fillCart(lines);
  const result = await createOrder({ ...shipping, discountCode });
  if (!result.ok || result.paymentMode !== "stripe") throw new Error(`checkout failed: ${JSON.stringify(result)}`);
  return result.orderId;
}

/** The PaymentIntent Stripe holds for this order: charged exactly what it says. */
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

/** A signed delivery, over the real signature check. */
async function deliver(
  eventId: string,
  intent: Awaited<ReturnType<typeof intentOf>>,
  secret = WEBHOOK_SECRET,
) {
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    type: "payment_intent.succeeded",
    data: { object: intent },
  });
  const res = await stripeWebhookRoute(
    new Request("https://shop.example.test/api/webhook/stripe", {
      method: "POST",
      body: payload,
      headers: {
        "content-type": "application/json",
        "stripe-signature": state.webhooks.generateTestHeaderString({ payload, secret }),
      },
    }) as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
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

function operatorMoves(orderId: string, from: string, to: string) {
  return state.prisma.$transaction((tx) =>
    writeOperatorStatus(tx, { orderId, from, to, actor: "user:admin" }),
  );
}

const FENCE_SNAPSHOT = { id: "li-1", ...VARIANT, slug: "fence", sku: "F-2M", name: "Fence Panel", quantity: 2, unitPriceDkk: 60000 };

/** A session ready for payment, snapshotting two of one line, as createSession does. */
async function acpSession(id = "acp-1", over: Partial<Prisma.AcpCheckoutSessionUncheckedCreateInput> = {}) {
  await state.prisma.acpCheckoutSession.create({
    data: {
      id,
      status: "ready_for_payment",
      currency: BASE_CURRENCY.toLowerCase(),
      lineItemsJson: JSON.stringify([FENCE_SNAPSHOT]),
      buyerEmail: "agent@shop.example.test",
      shippingName: "Agent Buyer",
      shippingAddress: "Example Road 1",
      shippingZip: "1234",
      shippingCity: "Exampleton",
      subtotalDkk: 120000,
      totalDkk: 120000,
      expiresAt: new Date(Date.now() + 3_600_000),
      ...over,
    },
  });
}

async function completeAcp(sessionId: string, body: Record<string, unknown>) {
  const res = await acpCompleteRoute(
    new Request(`https://shop.example.test/api/acp/v1/checkout_sessions/${sessionId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const paidOrderId = async (sessionId: string) =>
  (await state.prisma.acpCheckoutSession.findUniqueOrThrow({ where: { id: sessionId } })).orderId as string;

// ── The replay ──────────────────────────────────────────────────────────────

describe.skipIf(!sqlite)("the Stripe webhook, replayed", () => {
  it("a signed success pays the order: one receipt, one owner mail, one event, the stock where checkout left it", async () => {
    const orderId = await checkout();
    expect(await stock()).toEqual({ plain: 3, fence: 5, variant: 3 });

    const res = await deliver("evt_1", await intentOf(orderId));

    expect(res).toEqual({ status: 200, body: { received: true } });
    expect(fired()).toEqual(ONE_OF_EACH);
    expect(await stock()).toEqual({ plain: 3, fence: 5, variant: 3 });
    const order = await orderRow(orderId);
    expect(order.status).toBe("paid");
    expect(order.paymentMethod).toBe("stripe_card");
    expect(order.paidAt).toBeInstanceOf(Date);
    expect(order.confirmationEmailSentAt).toBeInstanceOf(Date);
  });

  it("the same event again: answered idempotent, nothing fires twice", async () => {
    const orderId = await checkout();
    const intent = await intentOf(orderId);
    await deliver("evt_1", intent);

    const again = await deliver("evt_1", intent);

    expect(again).toEqual({ status: 200, body: { received: true, idempotent: true } });
    expect(fired()).toEqual(ONE_OF_EACH);
    expect(door).toHaveBeenCalledTimes(1);
    expect(await stock()).toEqual({ plain: 3, fence: 5, variant: 3 });
  });

  it("the same success under a new event id (a re-send from the dashboard): nothing fires twice", async () => {
    const orderId = await checkout();
    const intent = await intentOf(orderId);
    await deliver("evt_1", intent);
    const stamped = (await orderRow(orderId)).confirmationEmailSentAt;

    const again = await deliver("evt_2", intent);

    expect(again).toEqual({ status: 200, body: { received: true } });
    expect(fired()).toEqual(ONE_OF_EACH);
    expect(door).toHaveBeenCalledTimes(1);
    expect((await orderRow(orderId)).confirmationEmailSentAt).toEqual(stamped);
    expect(await stock()).toEqual({ plain: 3, fence: 5, variant: 3 });
    // A paid order is simply done: not the "left unchanged, review manually" row.
    expect(await state.prisma.auditLog.count()).toBe(0);
  });

  it("a bad signature: 400, the order still awaits payment, nothing fires", async () => {
    const orderId = await checkout();

    const res = await deliver("evt_forged", await intentOf(orderId), "whsec_someone_else");

    expect(res.status).toBe(400);
    expect((await orderRow(orderId)).status).toBe("pending_payment");
    expect(fired()).toEqual(NOTHING);
    expect(door).not.toHaveBeenCalled();
  });

  it("late, after an operator cancelled: it stays cancelled, the stock stays returned, nothing fires, one audit row", async () => {
    const orderId = await checkout();
    const intent = await intentOf(orderId);
    await operatorMoves(orderId, "pending_payment", "cancelled");
    expect(await stock()).toEqual({ plain: 5, fence: 5, variant: 3 });

    const res = await deliver("evt_late", intent);

    expect(res).toEqual({ status: 200, body: { received: true } });
    expect((await orderRow(orderId)).status).toBe("cancelled");
    expect(fired()).toEqual(NOTHING);
    expect(door).not.toHaveBeenCalled();
    expect(await stock()).toEqual({ plain: 5, fence: 5, variant: 3 });
    const audit = await state.prisma.auditLog.findMany({ where: { tool: "orders.payment_not_applied" } });
    expect(audit).toHaveLength(1);
  });

  it("late, after it shipped: it stays shipped and no second receipt goes out", async () => {
    const orderId = await checkout();
    const intent = await intentOf(orderId);
    await deliver("evt_1", intent);
    await operatorMoves(orderId, "paid", "shipped");

    await deliver("evt_late", intent);

    expect((await orderRow(orderId)).status).toBe("shipped");
    expect(fired()).toEqual(ONE_OF_EACH);
    expect(await stock()).toEqual({ plain: 3, fence: 5, variant: 3 });
  });

  it("the wrong amount flags the order and fires nothing; the right one then pays it, once", async () => {
    const orderId = await checkout();
    const intent = await intentOf(orderId);

    await deliver("evt_tampered", { ...intent, amount: 100 });
    expect((await orderRow(orderId)).status).toBe("flagged_review");
    expect(fired()).toEqual(NOTHING);

    await deliver("evt_right", intent);
    expect((await orderRow(orderId)).status).toBe("paid");
    expect(fired()).toEqual(ONE_OF_EACH);

    await deliver("evt_right_again", intent);
    expect(fired()).toEqual(ONE_OF_EACH);
    expect(await stock()).toEqual({ plain: 3, fence: 5, variant: 3 });
  });

  it("a receipt that went out already is not sent again; the owner still hears", async () => {
    const orderId = await checkout();
    const sentAt = new Date("2026-10-01T10:00:00.000Z");
    await state.prisma.order.update({ where: { id: orderId }, data: { confirmationEmailSentAt: sentAt } });

    await deliver("evt_1", await intentOf(orderId));

    expect((await orderRow(orderId)).status).toBe("paid");
    expect(fired()).toEqual({ receipts: 0, ownerMails: 1, events: 1 });
    expect((await orderRow(orderId)).confirmationEmailSentAt).toEqual(sentAt);
  });

  it("a receipt that fails: the order is paid, no stamp, the owner hears, and a replay does not retry it", async () => {
    const orderId = await checkout();
    const intent = await intentOf(orderId);
    const down = new Error("mail provider down");
    state.sendOrderConfirmation.mockRejectedValueOnce(down);

    const res = await deliver("evt_1", intent);

    expect(res.status).toBe(200);
    const order = await orderRow(orderId);
    expect(order.status).toBe("paid");
    expect(order.confirmationEmailSentAt).toBeNull();
    expect(fired()).toEqual(ONE_OF_EACH);
    expect(consoleError).toHaveBeenCalledWith(
      `[stripe-webhook] kunne ikke sende kvittering for ${orderId}:`,
      down,
    );

    await deliver("evt_2", intent);
    expect(fired()).toEqual(ONE_OF_EACH);
  });
});

describe.skipIf(!sqlite)("the reconcile cron, replayed", () => {
  it("it pays the order the webhook missed, once; a second run finds nothing", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    const intent = await intentOf(orderId);
    state.retrieveIntent.mockResolvedValue(intent);

    expect((await runCron()).results).toEqual([{ orderId, action: "reconciled_paid" }]);
    expect((await runCron()).results).toEqual([]);

    expect((await orderRow(orderId)).status).toBe("paid");
    expect(fired()).toEqual({ receipts: 1, ownerMails: 1, events: 0 });
    expect(await stock()).toEqual({ plain: 3, fence: 5, variant: 3 });
  });

  it("the wrong amount flags the order and fires nothing; the next run leaves it for review", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    state.retrieveIntent.mockResolvedValue({ ...(await intentOf(orderId)), amount: 100 });

    expect((await runCron()).results).toEqual([{ orderId, action: "flagged_amount_mismatch" }]);
    expect((await runCron()).results).toEqual([]);

    expect((await orderRow(orderId)).status).toBe("flagged_review");
    expect(fired()).toEqual(NOTHING);
  });

  it("a receipt that went out already is not sent again; the owner still hears", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    const sentAt = new Date("2026-10-01T10:00:00.000Z");
    await state.prisma.order.update({ where: { id: orderId }, data: { confirmationEmailSentAt: sentAt } });
    state.retrieveIntent.mockResolvedValue(await intentOf(orderId));

    await runCron();

    expect((await orderRow(orderId)).status).toBe("paid");
    expect(fired()).toEqual({ receipts: 0, ownerMails: 1, events: 0 });
    expect((await orderRow(orderId)).confirmationEmailSentAt).toEqual(sentAt);
  });

  it("the webhook that arrives after the cron finds the order paid: nothing fires twice", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    const intent = await intentOf(orderId);
    state.retrieveIntent.mockResolvedValue(intent);
    await runCron();

    await deliver("evt_late", intent);

    expect(fired()).toEqual({ receipts: 1, ownerMails: 1, events: 0 });
    expect(door).toHaveBeenCalledTimes(1);
  });
});

describe.skipIf(!sqlite)("the race on the paid write (RACE-MARKPAID): the loser fires nothing", () => {
  it("the webhook wins while the cron is asking Stripe", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    const intent = await intentOf(orderId);
    state.retrieveIntent.mockImplementation(async () => {
      await deliver("evt_1", intent);
      return intent;
    });

    const { results } = await runCron();

    expect(results).toEqual([{ orderId, action: "already_paid_by_webhook" }]);
    expect(fired()).toEqual(ONE_OF_EACH);
    expect(door).toHaveBeenCalledTimes(1);
  });

  it("the cron wins between the webhook's read and its write", async () => {
    const orderId = await checkout();
    await ageForCron(orderId);
    const intent = await intentOf(orderId);
    state.retrieveIntent.mockResolvedValue(intent);
    state.beforeOrderWrite = () => runCron();

    const res = await deliver("evt_1", intent);

    expect(res).toEqual({ status: 200, body: { received: true } });
    expect((await orderRow(orderId)).status).toBe("paid");
    // The cron's call, not the webhook's: it has never emitted the event.
    expect(fired()).toEqual({ receipts: 1, ownerMails: 1, events: 0 });
    expect(door).toHaveBeenCalledTimes(1);
  });
});

describe.skipIf(!sqlite)("ACP completion, replayed", () => {
  it("the route pays once; the same key answers from its record, a new key is refused, nothing fires twice", async () => {
    await acpSession();

    const first = await completeAcp("acp-1", { shared_payment_token: "spt_1", idempotency_key: "key-1" });
    expect(first.status).toBe(200);
    expect(fired()).toEqual({ receipts: 1, ownerMails: 1, events: 0 });
    expect(await stock()).toEqual({ plain: 5, fence: 5, variant: 1 });

    const sameKey = await completeAcp("acp-1", { shared_payment_token: "spt_1", idempotency_key: "key-1" });
    expect(sameKey).toEqual(first);

    const newKey = await completeAcp("acp-1", { shared_payment_token: "spt_1", idempotency_key: "key-2" });
    expect(newKey.status).toBe(409);

    expect(fired()).toEqual({ receipts: 1, ownerMails: 1, events: 0 });
    expect(door).toHaveBeenCalledTimes(1);
    expect(state.createIntent).toHaveBeenCalledTimes(1);
    expect(await state.prisma.order.count()).toBe(1);
    expect(await stock()).toEqual({ plain: 5, fence: 5, variant: 1 });
  });

  it("a session that already has its order: the same order back, nothing fires", async () => {
    await acpSession();
    const args = { sessionId: "acp-1", paymentIntentId: "pi_acp" };
    const orderId = await createOrderFromAcpSession(args);

    expect(await createOrderFromAcpSession(args)).toBe(orderId);

    expect(fired()).toEqual({ receipts: 1, ownerMails: 1, events: 0 });
    expect(await stock()).toEqual({ plain: 5, fence: 5, variant: 1 });
  });

  it("two completions at once: the loser rolls back, returns the winner's order and fires nothing", async () => {
    // Stock for both, so the session claim is what stops the loser.
    await state.prisma.productVariant.update({ where: { id: "fence-2m" }, data: { stock: 10 } });
    await acpSession();
    const args = { sessionId: "acp-1", paymentIntentId: "pi_acp" };
    state.beforeTransaction = () => createOrderFromAcpSession(args);

    const orderId = await createOrderFromAcpSession(args);

    expect(orderId).toBe(await paidOrderId("acp-1"));
    expect(await state.prisma.order.count()).toBe(1);
    expect(fired()).toEqual({ receipts: 1, ownerMails: 1, events: 0 });
    expect(door).toHaveBeenCalledTimes(1);
    expect(await stock()).toEqual({ plain: 5, fence: 5, variant: 8 });
  });
});

describe.skipIf(!sqlite)("mock-mode checkout, replayed", () => {
  it("the order is created paid and fires once; the emptied cart cannot fire again", async () => {
    state.stripeReady = false;
    await state.prisma.cartItem.create({ data: { cartId: "cart-1", quantity: 2, ...PLAIN } });

    const result = await createOrder(shipping);

    if (!result.ok) throw new Error(result.error);
    const order = await orderRow(result.orderId);
    expect(order.status).toBe("paid");
    expect(order.paymentMethod).toBe("mock");
    expect(order.confirmationEmailSentAt).toBeInstanceOf(Date);
    expect(fired()).toEqual({ receipts: 1, ownerMails: 1, events: 0 });
    expect(await stock()).toEqual({ plain: 3, fence: 5, variant: 3 });

    expect(await createOrder(shipping)).toMatchObject({ ok: false, code: "EMPTY_CART" });
    expect(fired()).toEqual({ receipts: 1, ownerMails: 1, events: 0 });
    expect(await stock()).toEqual({ plain: 3, fence: 5, variant: 3 });
  });
});

describe.skipIf(!sqlite)("an operator moving an order to paid does not come through the door", () => {
  it("no receipt, no owner mail, and the success that arrives later finds the order paid: as before ORD0-a", async () => {
    const orderId = await checkout();
    const intent = await intentOf(orderId);

    await operatorMoves(orderId, "pending_payment", "paid");
    expect(fired()).toEqual(NOTHING);

    await deliver("evt_after_operator", intent);

    expect(fired()).toEqual(NOTHING);
    expect(door).not.toHaveBeenCalled();
    expect((await orderRow(orderId)).confirmationEmailSentAt).toBeNull();
  });
});

/**
 * The single door's table. Each row is a real path run to the end. The arguments
 * it hands `onOrderPaid` are what keep that path's behaviour as it was: ORD1-c,
 * not this slice, decides whether they should still differ.
 */
describe.skipIf(!sqlite)("every path calls onOrderPaid, with the arguments that preserve today's behaviour", () => {
  type Purchase = {
    lines: CartLine[];
    discountCode?: string;
    /** The same purchase as an ACP session holds it. */
    session?: Partial<Prisma.AcpCheckoutSessionUncheckedCreateInput>;
  };

  const FENCE: Purchase = { lines: [VARIANT] };

  /** Two of each line at 10 % off, below the free-shipping threshold. */
  const MONEY = { subtotalDkk: 145800, discountDkk: 14580, shippingDkk: 4900, totalDkk: 136120 };
  const MIXED: Purchase = {
    lines: [PLAIN, VARIANT],
    discountCode: "TEN",
    session: {
      ...MONEY,
      discountCode: "TEN",
      lineItemsJson: JSON.stringify([
        { id: "li-0", ...PLAIN, slug: "plain", sku: null, name: "Plain Mug", quantity: 2, unitPriceDkk: 12900 },
        FENCE_SNAPSHOT,
      ]),
    },
  };

  async function payByWebhook(purchase = FENCE) {
    const orderId = await checkout(purchase.lines, purchase.discountCode);
    await deliver("evt_1", await intentOf(orderId));
    return orderId;
  }

  async function payByCron(purchase = FENCE) {
    const orderId = await checkout(purchase.lines, purchase.discountCode);
    await ageForCron(orderId);
    state.retrieveIntent.mockResolvedValue(await intentOf(orderId));
    await runCron();
    return orderId;
  }

  async function payByMockCheckout(purchase = FENCE) {
    state.stripeReady = false;
    await fillCart(purchase.lines);
    const result = await createOrder({ ...shipping, discountCode: purchase.discountCode });
    if (!result.ok) throw new Error(result.error);
    return result.orderId;
  }

  async function payByAcp(purchase = FENCE) {
    await acpSession("acp-1", purchase.session);
    await completeAcp("acp-1", { shared_payment_token: "spt_1" });
    return paidOrderId("acp-1");
  }

  const FOREIGN = { currency: "XTS", fxRate: 0.5 };

  const TABLE = [
    {
      path: "the Stripe webhook",
      run: payByWebhook,
      emitOrderPlaced: true,
      receiptFailureLog: (id: string) => `[stripe-webhook] kunne ikke sende kvittering for ${id}:`,
      line: "Fence Panel",
      charged: FOREIGN,
    },
    {
      path: "the reconcile cron",
      run: payByCron,
      emitOrderPlaced: false,
      receiptFailureLog: (id: string) => `[reconcile-cron] mail failed for ${id}:`,
      line: "Fence Panel",
      charged: FOREIGN,
    },
    {
      path: "mock-mode checkout",
      run: payByMockCheckout,
      emitOrderPlaced: false,
      receiptFailureLog: () => "[createOrder] could not send order confirmation",
      // The one path that names the variant in the mails.
      line: "Fence Panel (2m)",
      charged: FOREIGN,
    },
    {
      path: "the ACP complete route",
      run: payByAcp,
      emitOrderPlaced: false,
      receiptFailureLog: () => "[acp] order confirmation email failed",
      line: "Fence Panel",
      // A session is in the shop's own currency whatever the customer picked
      // (lib/acp/index.ts), so its rate is a constant, not a snapshot.
      charged: { currency: BASE_CURRENCY, fxRate: 1 },
    },
  ];

  it.each(TABLE)("$path", async ({ run, emitOrderPlaced, receiptFailureLog, line }) => {
    const orderId = await run();

    const order = await orderRow(orderId);
    const mailData = {
      orderId,
      email: order.email,
      shippingName: order.shippingName,
      items: [{ productName: line, quantity: 2, unitPriceDkk: 60000 }],
      subtotalDkk: order.subtotalDkk,
      discountDkk: order.discountDkk,
      shippingDkk: order.shippingDkk,
      totalDkk: order.totalDkk,
      currency: BASE_CURRENCY,
      fxRate: 1,
    };
    expect(door).toHaveBeenCalledExactlyOnceWith({
      order: mailData,
      receiptSentAt: null,
      emitOrderPlaced,
      receiptFailureLog: receiptFailureLog(orderId),
    });

    // …and what those arguments did.
    expect(fired()).toEqual({ receipts: 1, ownerMails: 1, events: emitOrderPlaced ? 1 : 0 });
    expect(state.sendOrderConfirmation).toHaveBeenCalledExactlyOnceWith(mailData);
    expect(state.sendOwnerNewOrderEmail).toHaveBeenCalledExactlyOnceWith({
      ...mailData,
      to: "owner@shop.example.test",
      adminUrl: `https://shop.example.test/admin/ordrer/${orderId}`,
    });
    expect(order.confirmationEmailSentAt).toBeInstanceOf(Date);
    expect(await stock()).toEqual({ plain: 5, fence: 5, variant: 1 });
  });

  /**
   * The purchase above is one line at no discount, in the shop's own currency, so
   * a path that handed the door a hard-coded 0 or 1, or dropped a line, would pass
   * it. Here there are two lines, every figure differs and the currency is not the
   * shop's, so a wrong one on the receipt or the owner mail goes red.
   */
  it.each(TABLE)("$path, on an order where every figure differs: the mails carry the real ones", async (row) => {
    await state.prisma.discountCode.create({ data: { code: "TEN", type: "percent", value: 10 } });
    state.checkoutCurrency = FOREIGN.currency;

    const orderId = await row.run(MIXED);

    const order = await orderRow(orderId);
    expect(order).toMatchObject({ ...MONEY, ...row.charged });
    const mailData = {
      orderId,
      email: order.email,
      shippingName: order.shippingName,
      // In either order: the OrderItem rows come back in no promised one.
      items: expect.arrayContaining([
        { productName: "Plain Mug", quantity: 2, unitPriceDkk: 12900 },
        { productName: row.line, quantity: 2, unitPriceDkk: 60000 },
      ]),
      ...MONEY,
      ...row.charged,
    };
    expect(door).toHaveBeenCalledExactlyOnceWith({
      order: mailData,
      receiptSentAt: null,
      emitOrderPlaced: row.emitOrderPlaced,
      receiptFailureLog: row.receiptFailureLog(orderId),
    });
    expect(state.sendOrderConfirmation).toHaveBeenCalledExactlyOnceWith(mailData);
    expect(state.sendOwnerNewOrderEmail).toHaveBeenCalledExactlyOnceWith({
      ...mailData,
      to: "owner@shop.example.test",
      adminUrl: `https://shop.example.test/admin/ordrer/${orderId}`,
    });
    expect(state.emitMarketingEvent.mock.calls).toEqual(
      row.emitOrderPlaced
        ? [["cartwright.order.placed", order.email, { orderId, totalDkk: MONEY.totalDkk, currency: row.charged.currency, itemCount: 2 }]]
        : [],
    );
    // The discount's use and the stock move at creation, once, on all four.
    const code = await state.prisma.discountCode.findUniqueOrThrow({ where: { code: "TEN" } });
    expect(code.usageCount).toBe(1);
    expect(await stock()).toEqual({ plain: 3, fence: 5, variant: 1 });
  });

  // The one receipt that does not come through the door (the ratchet in
  // orders/on-paid.test.ts names it): an operator asking for another copy.
  it("an operator's resend: the same figures as the receipt, no new stamp, the owner hears nothing", async () => {
    await state.prisma.discountCode.create({ data: { code: "TEN", type: "percent", value: 10 } });
    state.checkoutCurrency = FOREIGN.currency;
    const orderId = await payByWebhook(MIXED);
    const [receipt] = state.sendOrderConfirmation.mock.calls[0];
    const stamped = (await orderRow(orderId)).confirmationEmailSentAt;

    expect(await resendConfirmation(orderId)).toEqual({ ok: true });

    expect(state.sendOrderConfirmation).toHaveBeenCalledTimes(2);
    expect(state.sendOrderConfirmation).toHaveBeenLastCalledWith(receipt);
    expect(fired()).toEqual({ receipts: 2, ownerMails: 1, events: 1 });
    expect((await orderRow(orderId)).confirmationEmailSentAt).toEqual(stamped);
    expect(door).toHaveBeenCalledTimes(1);
  });

  it.each(TABLE)("$path, when the receipt fails: its own log line, no stamp, the order still paid", async (row) => {
    const down = new Error("mail provider down");
    state.sendOrderConfirmation.mockRejectedValueOnce(down);

    const orderId = await row.run();

    const order = await orderRow(orderId);
    expect(order.status).toBe("paid");
    expect(order.confirmationEmailSentAt).toBeNull();
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(row.receiptFailureLog(orderId), down);
    expect(fired()).toEqual({ receipts: 1, ownerMails: 1, events: row.emitOrderPlaced ? 1 : 0 });
  });
});
