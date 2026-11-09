import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import { ORDER_STATUSES, STATUS_LABELS, legalNextStates, type OrderStatus } from "@/lib/orders/status";

/**
 * TIL1-a — a quote is an Order in status `quote`. No path creates one yet, so each
 * test writes the row itself and then runs the real routes, actions, tools and
 * pages on a real libSQL file: a payment does not touch it, an operator moves it
 * out only two ways and never in, it counts as revenue nowhere, no customer sees
 * it, and no stock moves. The stand-ins are Stripe's network, the mail provider and
 * the request. The tool schemas, frozen at module load, are in
 * ./orders/quotes-flag.test.ts. The list of who reads an order is in
 * ./orders/quote-readers.test.ts.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const WEBHOOK_SECRET = "whsec_quote_test";
const CRON_SECRET = "cron-quote-test";

const state = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  webhooks: null as unknown as Stripe["webhooks"],
  quotes: false,
  orderWorkspace: false,
  session: null as null | { user: { id: string; email: string; name: string } },
  retrieveIntent: vi.fn(),
  cancelIntent: vi.fn(),
  sendOrderConfirmation: vi.fn(),
  sendOwnerNewOrderEmail: vi.fn(),
  sendShippingNotificationEmail: vi.fn(),
  emitMarketingEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get prisma() {
    return state.prisma;
  },
}));
vi.mock("@/brand.config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/brand.config")>();
  return {
    ...actual,
    brand: {
      ...actual.brand,
      features: {
        ...actual.brand.features,
        get quotes() {
          return state.quotes;
        },
      },
    },
  };
});
vi.mock("@/lib/stripe", () => ({
  getStripeMode: async () => "stripe",
  isStripeReady: async () => true,
  getStripeKeys: async () => ({ publishableKey: "pk_test_quote", webhookSecret: WEBHOOK_SECRET }),
  getStripeClient: async () => ({
    webhooks: state.webhooks,
    paymentIntents: { retrieve: state.retrieveIntent, cancel: state.cancelIntent },
  }),
  createPaymentIntent: vi.fn(),
  createRefund: vi.fn(),
}));
vi.mock("@/lib/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mailer")>()),
  mailer: { sendOrderConfirmation: state.sendOrderConfirmation },
  sendOwnerNewOrderEmail: state.sendOwnerNewOrderEmail,
  sendShippingNotificationEmail: state.sendShippingNotificationEmail,
}));
vi.mock("@/lib/marketing/automations", () => ({
  emitMarketingEvent: state.emitMarketingEvent,
  MARKETING_EVENTS: { orderPlaced: "cartwright.order.placed" },
}));
vi.mock("@/lib/brand", () => ({
  getBrand: async () => ({
    features: { ownerOrderEmail: true, mcpPublic: false },
    emails: { admin: "owner@shop.example.test" },
    url: "https://shop.example.test",
    defaultLocale: "en",
  }),
  getFeatures: async () => ({
    orderWorkspace: state.orderWorkspace,
    orderAi: false,
    fulfillmentPdf: true,
    returns: true,
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ucp/gate", () => ({
  ucpIdentityLinkingEnabled: async () => true,
  issuerFromRequest: () => "https://shop.example.test",
  ucpDisabledResponse: () => new Response(null, { status: 404 }),
}));
vi.mock("@/lib/ucp/identity", () => ({
  requireUcpIdentity: async () => ({ ok: true, identity: { userId: "customer" } }),
}));

import OrdrerPage from "@/app/[locale]/account/orders/page";
import OrderConfirmationPage from "@/app/[locale]/order/[id]/page";
import AdminOrderPage from "@/app/admin/ordrer/[id]/page";
import {
  bulkUpdateStatus,
  createFulfillment,
  createReturn,
  issueRefund,
  listOrdersPage,
  resendConfirmation,
  sendShippingNotification,
  updateOrderStatusAdmin,
} from "@/app/admin/ordrer/actions";
import AdminOrdersPage from "@/app/admin/ordrer/page";
import AdminCustomersPage from "@/app/admin/kunder/page";
import AdminPage from "@/app/admin/page";
import { GET as reconcileCronRoute } from "@/app/api/cron/reconcile-stripe/route";
import { POST as stripeWebhookRoute } from "@/app/api/webhook/stripe/route";
import { formatPriceDkk } from "@/lib/format";
import { exportUserData } from "@/lib/gdpr/export";
import { createRefund } from "@/lib/stripe";
import { getOrderStatuses } from "@/lib/orders/status-reader";
import { seedOrderStatuses } from "@/lib/orders/status-seed";
import { analyticsSummary } from "@/lib/tools/analytics";
import { _resetLookupCountsForTest, lookupByEmailTool, lookupByPhoneTool } from "@/lib/tools/customer";
import { listOrders, updateOrderStatus } from "@/lib/tools/orders";

// Each test runs real routes or renders real pages on a real database file: a
// busy runner must not turn slow into red.
vi.setConfig({ testTimeout: 30_000 });

state.webhooks = new Stripe("sk_test_quote").webhooks;

// Not literal imports: a light scaffold prunes UCP (create-cartwright's
// LIGHT_EXCLUDED_PATHS) and a shop can uninstall the reviews plugin, and a literal
// import of a pruned path breaks its typecheck.
const UCP_ROUTE = "app/api/ucp/orders/route.ts";
const REVIEW_ROUTE = "plugins/reviews/api/submit.ts";
const REVIEW_PAGE = "plugins/reviews/pages/OrderReviewPage.tsx";
const has = (file: string) => existsSync(join(ROOT, file));
const load = <T,>(file: string) => import(/* @vite-ignore */ join(ROOT, file)) as Promise<T>;

const QUOTE_ID = "quote-1";
const PAID_ID = "paid-1";
const QUOTE_TOTAL = 999_900;
const PAID_TOTAL = 12_900;
const CTX = { actor: "user:admin", ip: "10.0.0.9", userAgent: "agent/1.0" } as never;

let dir = "";
let raw: Client;

beforeEach(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-order-quote-"));
  const url = `file:${join(dir, "shop.db")}`;
  raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  state.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  state.quotes = false;
  state.orderWorkspace = false;
  state.session = null;

  state.retrieveIntent.mockReset().mockResolvedValue({ status: "requires_payment_method" });
  state.cancelIntent.mockReset().mockResolvedValue({ status: "canceled" });
  state.sendOrderConfirmation.mockReset().mockResolvedValue(undefined);
  state.sendOwnerNewOrderEmail.mockReset().mockResolvedValue(undefined);
  state.sendShippingNotificationEmail.mockReset().mockResolvedValue(undefined);
  state.emitMarketingEvent.mockReset().mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  _resetLookupCountsForTest();

  const db = state.prisma;
  await db.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
  await db.supplier.create({ data: { id: "sup", name: "Supplier", mode: "manual" } });
  await db.product.create({
    data: { id: "mug", slug: "mug", name: "Plain Mug", description: "", priceDkk: 12900, images: "[]", categoryId: "cat", stock: 20, supplierId: "sup" },
  });
  await db.user.create({ data: { id: "customer", email: "buyer@shop.example.test", role: "customer" } });
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (!sqlite) return;
  await state.prisma.$disconnect();
  raw.close();
  rmSync(dir, { recursive: true, force: true });
});

/** An order as a later slice will write it: a row in the given status, no stock moved. */
function addOrder(id: string, status: string, over: { totalDkk?: number; quantity?: number; minute?: number; stripePaymentIntentId?: string; phoneNumber?: string; email?: string } = {}) {
  const totalDkk = over.totalDkk ?? 12_900;
  return state.prisma.order.create({
    data: {
      id,
      userId: "customer",
      email: over.email ?? "buyer@shop.example.test",
      phoneNumber: over.phoneNumber ?? null,
      shippingName: `Name of ${id}`,
      shippingAddress: "Example Road 12",
      shippingZip: "1234",
      shippingCity: "Exampleton",
      subtotalDkk: totalDkk,
      shippingDkk: 500,
      discountDkk: 300,
      totalDkk,
      status,
      stripePaymentIntentId: over.stripePaymentIntentId ?? null,
      createdAt: new Date(Date.UTC(2026, 9, 1, 10, over.minute ?? 0)),
      items: { create: { productId: "mug", productName: "Plain Mug", unitPriceDkk: totalDkk, quantity: over.quantity ?? 1 } },
    },
  });
}

const addQuote = (over: Parameters<typeof addOrder>[2] = {}) =>
  addOrder(QUOTE_ID, "quote", { totalDkk: QUOTE_TOTAL, quantity: 7, minute: 30, ...over });

const statusOf = async (id: string) => (await state.prisma.order.findUniqueOrThrow({ where: { id } })).status;
const stock = async () => (await state.prisma.product.findUniqueOrThrow({ where: { id: "mug" } })).stock;
const notes = (orderId: string) => state.prisma.orderNote.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
const auditCount = (tool: string) => state.prisma.auditLog.count({ where: { tool } });

const mails = () => ({
  receipts: state.sendOrderConfirmation.mock.calls.length,
  ownerMails: state.sendOwnerNewOrderEmail.mock.calls.length,
  shipping: state.sendShippingNotificationEmail.mock.calls.length,
  events: state.emitMarketingEvent.mock.calls.length,
});
const NO_MAILS = { receipts: 0, ownerMails: 0, shipping: 0, events: 0 };

let eventCounter = 0;

/** A signed delivery, over the real signature check. */
async function deliver(type: string, object: unknown) {
  const payload = JSON.stringify({ id: `evt_quote_${++eventCounter}`, object: "event", type, data: { object } });
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

/** The intent as it would be for this order: the right amount, the right currency. */
async function intentOf(orderId: string, amount?: number) {
  const row = await state.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return {
    id: row.stripePaymentIntentId ?? `pi_${orderId}`,
    object: "payment_intent",
    status: "succeeded",
    amount: amount ?? row.totalDkk,
    currency: row.currency.toLowerCase(),
    payment_method_types: ["card"],
    metadata: { orderId },
  };
}

async function runCron() {
  const res = await reconcileCronRoute(
    new Request("https://shop.example.test/api/cron/reconcile-stripe", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    }) as never,
  );
  return (await res.json()) as { results: { orderId: string; action: string }[] };
}

const listPage = async (tab?: string) =>
  renderToStaticMarkup(await AdminOrdersPage({ searchParams: Promise.resolve(tab ? { tab } : {}) }));
const orderPage = async (id: string) =>
  renderToStaticMarkup(await AdminOrderPage({ params: Promise.resolve({ id }) }));

/** The status select's options, in the order they stand. */
function options(html: string): string[] {
  const select = /<select[^>]*>([\s\S]*?)<\/select>/.exec(html)?.[1] ?? "";
  return [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
}

/** The labels of the tab links at the top of a list page. */
function tabLabels(html: string): string[] {
  const nav = /<nav[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
  return [...nav.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
}

const FLAG_STATES = [
  ["the `quotes` flag off", false],
  ["the `quotes` flag on", true],
] as const;

describe.skipIf(!sqlite).each(FLAG_STATES)("a payment on a quote, %s", (_name, quotes) => {
  beforeEach(() => {
    state.quotes = quotes;
  });

  it("a late success is refused as on any status not awaiting payment: nothing fires, and it is on the audit log", async () => {
    await addQuote({ stripePaymentIntentId: "pi_quote" });

    await deliver("payment_intent.succeeded", await intentOf(QUOTE_ID));

    const row = await state.prisma.order.findUniqueOrThrow({ where: { id: QUOTE_ID } });
    expect(row.status).toBe("quote");
    expect(row.paidAt).toBeNull();
    expect(mails()).toEqual(NO_MAILS);
    expect(await auditCount("orders.payment_not_applied")).toBe(1);
    expect(await stock()).toBe(20);
  });

  it("the wrong amount does not flag it either: the refusal comes first, as on a cancelled order", async () => {
    await addQuote({ stripePaymentIntentId: "pi_quote" });

    await deliver("payment_intent.succeeded", await intentOf(QUOTE_ID, 100));

    expect(await statusOf(QUOTE_ID)).toBe("quote");
    expect(await auditCount("orders.payment_not_applied")).toBe(1);
  });

  it("a cancelled intent leaves it: that webhook only cancels what is awaiting payment", async () => {
    await addQuote({ stripePaymentIntentId: "pi_quote" });

    await deliver("payment_intent.canceled", { ...(await intentOf(QUOTE_ID)), status: "canceled" });

    expect(await statusOf(QUOTE_ID)).toBe("quote");
    expect(await stock()).toBe(20);
  });

  it("the cron does not look at it, whatever Stripe would answer", async () => {
    await addQuote({ stripePaymentIntentId: "pi_quote" });
    state.retrieveIntent.mockResolvedValue({ status: "succeeded" });

    expect((await runCron()).results).toEqual([]);

    expect(state.retrieveIntent).not.toHaveBeenCalled();
    expect(await statusOf(QUOTE_ID)).toBe("quote");
  });

  it("a refund event is a fact about money and is recorded, as on any status (status.ts doctrine)", async () => {
    await addQuote({ stripePaymentIntentId: "pi_quote" });

    await deliver("charge.refunded", { id: "ch_1", object: "charge", amount: QUOTE_TOTAL, amount_refunded: QUOTE_TOTAL, metadata: { orderId: QUOTE_ID } });

    expect(await statusOf(QUOTE_ID)).toBe("refunded");
    expect(await stock()).toBe(20);
    expect(mails()).toEqual(NO_MAILS);
  });
});

describe.skipIf(!sqlite).each(FLAG_STATES)("an operator and a quote, %s", (_name, quotes) => {
  beforeEach(() => {
    state.quotes = quotes;
  });

  const TOOL = (orderId: string, status: string) =>
    updateOrderStatus.handler({ orderId, status: status as OrderStatus }, CTX);

  it.each(["pending_payment", "cancelled"])("the admin action moves it to %s: one note, nobody mailed, no stock moved, no Stripe call", async (to) => {
    await addQuote();

    expect(await updateOrderStatusAdmin(QUOTE_ID, to)).toEqual({ ok: true });

    expect(await statusOf(QUOTE_ID)).toBe(to);
    const written = await notes(QUOTE_ID);
    expect(written.map((n) => n.body)).toEqual([`Status: Quote → ${STATUS_LABELS[to as "cancelled"]}`]);
    expect(JSON.parse(written[0].metaJson ?? "{}")).toEqual({ from: "quote", to });
    expect(await stock()).toBe(20);
    expect(mails()).toEqual(NO_MAILS);
    expect(state.retrieveIntent).not.toHaveBeenCalled();
    expect(state.cancelIntent).not.toHaveBeenCalled();
  });

  it.each(["pending_payment", "cancelled"])("the tool moves it to %s the same way, and says no stock came back", async (to) => {
    await addQuote();

    await expect(TOOL(QUOTE_ID, to)).resolves.toEqual({ id: QUOTE_ID, status: to });

    expect(await statusOf(QUOTE_ID)).toBe(to);
    expect(await stock()).toBe(20);
    expect(mails()).toEqual(NO_MAILS);
  });

  it("a cancel in bulk works on it too, and a move it has no row for is skipped", async () => {
    await addQuote();
    expect(await bulkUpdateStatus([QUOTE_ID], "shipped")).toMatchObject({ updated: 0, skipped: [{ id: QUOTE_ID }] });
    expect(await statusOf(QUOTE_ID)).toBe("quote");

    expect(await bulkUpdateStatus([QUOTE_ID], "cancelled")).toEqual({ updated: 1, skipped: [] });

    expect(await statusOf(QUOTE_ID)).toBe("cancelled");
    expect(await stock()).toBe(20);
  });

  it("every other move out of it is refused, and writes nothing, on both paths", async () => {
    await addQuote();
    for (const to of ORDER_STATUSES.filter((s) => !legalNextStates("quote").includes(s))) {
      const refusal = await updateOrderStatusAdmin(QUOTE_ID, to);
      expect(refusal, to).toMatchObject({ ok: false, error: expect.stringMatching(/Illegal order transition: quote/) });
      if (to !== "refunded" && to !== "partial_refund") {
        await expect(TOOL(QUOTE_ID, to), to).rejects.toThrow(/Illegal order transition: quote/);
      }
    }
    expect(await statusOf(QUOTE_ID)).toBe("quote");
    expect(await notes(QUOTE_ID)).toEqual([]);
  });

  it("no move leads in: not from any status, not from a legacy string the machine cannot validate", async () => {
    let minute = 0;
    for (const from of [...ORDER_STATUSES, "legacy_weird"]) {
      const id = `from-${from}`;
      await addOrder(id, from, { minute: minute++ });

      expect(await updateOrderStatusAdmin(id, "quote"), from).toEqual({ ok: false, error: "Invalid status: quote" });
      expect(await bulkUpdateStatus([id], "quote"), from).toMatchObject({ updated: 0 });
      await expect(TOOL(id, "quote"), from).rejects.toThrow(/Illegal order transition/);

      expect(await statusOf(id), from).toBe(from);
      expect(await notes(id), from).toEqual([]);
    }
  });

  it("what presumes a purchase is refused on a quote and left as it was on a real order", async () => {
    await addQuote({ stripePaymentIntentId: "pi_quote" });
    await addOrder(PAID_ID, "paid");

    const REFUSED = { ok: false, error: expect.stringMatching(/quote, not an order yet/) };
    expect(await issueRefund(QUOTE_ID, {})).toEqual(REFUSED);
    expect(createRefund).not.toHaveBeenCalled();
    const line = await state.prisma.orderItem.findFirstOrThrow({ where: { orderId: QUOTE_ID } });
    expect(await resendConfirmation(QUOTE_ID)).toEqual(REFUSED);
    expect(await sendShippingNotification(QUOTE_ID)).toEqual(REFUSED);
    expect(await createFulfillment(QUOTE_ID)).toEqual(REFUSED);
    expect(await createReturn(QUOTE_ID, { items: [{ orderItemId: line.id, quantity: 1 }], reason: "changed mind" })).toEqual(REFUSED);

    expect(mails()).toEqual(NO_MAILS);
    expect(await state.prisma.fulfillmentOrder.count()).toBe(0);
    expect(await state.prisma.return.count()).toBe(0);

    const paidLine = await state.prisma.orderItem.findFirstOrThrow({ where: { orderId: PAID_ID } });
    expect(await resendConfirmation(PAID_ID)).toEqual({ ok: true });
    expect(await sendShippingNotification(PAID_ID)).toEqual({ ok: true });
    // The admin form's shipping mail goes out, and the timeline says so (lib/orders/tracking.ts notifyShipped).
    expect(state.sendShippingNotificationEmail).toHaveBeenCalledTimes(1);
    expect(await state.prisma.orderNote.count({ where: { orderId: PAID_ID, body: "Shipping notification sent to the customer" } })).toBe(1);
    expect(await createFulfillment(PAID_ID)).toEqual({ ok: true });
    expect(await createReturn(PAID_ID, { items: [{ orderItemId: paidLine.id, quantity: 1 }], reason: "changed mind" })).toEqual({ ok: true });
    expect(await state.prisma.fulfillmentOrder.count()).toBe(1);
    expect(await state.prisma.return.count()).toBe(1);
  });

  it("NOT DONE, TIL1-c's: a quote moved to awaiting payment has drawn no stock, and a cancel from there gives back what it never drew", async () => {
    // This pins today's gap so that the slice that draws stock has to change it on
    // purpose. No path creates a quote yet, so no shop can get here.
    await addQuote();
    await updateOrderStatusAdmin(QUOTE_ID, "pending_payment");
    expect(await stock()).toBe(20);

    await updateOrderStatusAdmin(QUOTE_ID, "cancelled");

    expect(await stock()).toBe(27);
  });
});

describe.skipIf(!sqlite).each(FLAG_STATES)("a quote counts as nothing, %s", (_name, quotes) => {
  beforeEach(async () => {
    state.quotes = quotes;
    await addOrder(PAID_ID, "paid", { totalDkk: PAID_TOTAL, quantity: 2, minute: 10, phoneNumber: "+4511223344" });
    await addOrder("cancelled-1", "cancelled", { totalDkk: 5_000, quantity: 1, minute: 11 });
    await addQuote({ phoneNumber: "+4511223344" });
  });

  it("analytics.summary: revenue, discounts, shipping, count, recent orders, top sellers", async () => {
    const summary = await analyticsSummary.handler({ lowStockThreshold: 3, topProductsLimit: 5 }, CTX);

    expect(summary.orders.revenueOere).toBe(PAID_TOTAL);
    expect(summary.orders.discountsGivenOere).toBe(300);
    expect(summary.orders.shippingCollectedOere).toBe(500);
    expect(summary.orders.count).toBe(2);
    expect(summary.recentOrders.map((o) => o.id)).toEqual(["cancelled-1", PAID_ID]);
    expect(summary.topProducts).toEqual([{ productId: "mug", productName: "Plain Mug", totalSold: 3 }]);
  });

  it("analytics.summary under a date range holds them out too", async () => {
    const summary = await analyticsSummary.handler(
      { fromDate: "2026-10-01T00:00:00.000Z", toDate: "2026-10-02T00:00:00.000Z", lowStockThreshold: 3, topProductsLimit: 5 },
      CTX,
    );
    expect(summary.orders.count).toBe(2);
    expect(summary.orders.revenueOere).toBe(PAID_TOTAL);
  });

  it("the dashboard: the Orders tile, the Revenue tile and the recent list", async () => {
    const html = renderToStaticMarkup(await AdminPage());
    const tile = (label: string) =>
      new RegExp(`<p class="text-3xl[^>]*>([^<]*)</p><p[^>]*>\\s*${label}\\s*</p>`).exec(html)?.[1];

    expect(tile("Orders")).toBe("2");
    expect(tile("Revenue")).toBe(formatPriceDkk(PAID_TOTAL));
    expect(html).toContain(PAID_ID);
    expect(html).not.toContain(QUOTE_ID);
  });

  it("the customers list: a quote is no order placed", async () => {
    const html = renderToStaticMarkup(await AdminCustomersPage());
    expect(html).toMatch(/>2</);
    expect(html).not.toMatch(/>3</);
  });

  it("the customer's account: their quote is not on it", async () => {
    state.session = { user: { id: "customer", email: "buyer@shop.example.test", name: "Buyer" } };
    const html = renderToStaticMarkup(await OrdrerPage());
    expect(html).toContain(PAID_ID);
    expect(html).not.toContain(QUOTE_ID);
  });

  it("the customer's receipt page does not thank anyone for a quote", async () => {
    await expect(OrderConfirmationPage({ params: Promise.resolve({ id: QUOTE_ID }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(renderToStaticMarkup(await OrderConfirmationPage({ params: Promise.resolve({ id: PAID_ID }) }))).toContain("Thank you for your order.");
  });

  it.skipIf(!has(UCP_ROUTE))("a UCP client reading the customer's orders does not get it", async () => {
    const { GET } = await load<{ GET: (req: Request) => Promise<Response> }>(UCP_ROUTE);
    const res = await GET(new Request("https://shop.example.test/api/ucp/orders"));
    const { orders } = (await res.json()) as { orders: { id: string }[] };
    expect(orders.map((o) => o.id)).toEqual(["cancelled-1", PAID_ID]);
  });

  it("the customer lookups: a quote is no earlier purchase and no address to offer", async () => {
    const ctx = { actor: "storefront-chat:quote-test" } as never;
    await state.prisma.order.update({ where: { id: PAID_ID }, data: { email: "other@shop.example.test", phoneNumber: "+4599887766" } });
    await state.prisma.order.update({ where: { id: "cancelled-1" }, data: { email: "other@shop.example.test" } });

    await expect(lookupByEmailTool.handler({ email: "buyer@shop.example.test" }, ctx)).resolves.toMatchObject({
      hasOrders: false,
      orderCount: 0,
      lastShipping: null,
    });
    await expect(lookupByPhoneTool.handler({ phone: "+4511223344" }, ctx)).resolves.toMatchObject({
      hasOrders: false,
      orderCount: 0,
      email: null,
      lastShipping: null,
    });
    await expect(lookupByEmailTool.handler({ email: "other@shop.example.test" }, ctx)).resolves.toMatchObject({
      hasOrders: true,
      orderCount: 2,
    });
  });

  it.skipIf(!has(REVIEW_ROUTE) || !has(REVIEW_PAGE))("a review on a quote is no verified purchase: the route and the page refuse it, and a real order passes", async () => {
    state.session = { user: { id: "customer", email: "buyer@shop.example.test", name: "Buyer" } };
    const { POST } = await load<{ POST: (req: never) => Promise<Response> }>(REVIEW_ROUTE);
    const { default: ReviewOrderPage } = await load<{
      default: (props: { params: Promise<{ id: string; locale: string }> }) => Promise<React.ReactElement>;
    }>(REVIEW_PAGE);
    const submit = (orderId: string) =>
      POST(
        new Request("https://shop.example.test/api/reviews", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": `10.9.9.${quotes ? 1 : 2}` },
          body: JSON.stringify({ productId: "mug", orderId, rating: 5, body: "A very good mug indeed." }),
        }) as never,
      );

    expect((await submit(QUOTE_ID)).status).toBe(403);
    expect(await state.prisma.productReview.count()).toBe(0);
    await expect(ReviewOrderPage({ params: Promise.resolve({ id: QUOTE_ID, locale: "en" }) })).rejects.toThrow("NEXT_NOT_FOUND");

    expect((await submit(PAID_ID)).status).toBe(200);
    expect(await state.prisma.productReview.count({ where: { orderId: PAID_ID } })).toBe(1);
    expect(renderToStaticMarkup(await ReviewOrderPage({ params: Promise.resolve({ id: PAID_ID, locale: "en" }) }))).toContain("Plain Mug");
  });

  it("a data export holds it: it is the customer's personal data, whatever it counts as", async () => {
    const data = await exportUserData("customer");
    expect((data?.orders as { id: string }[]).map((o) => o.id).sort()).toEqual(["cancelled-1", PAID_ID, QUOTE_ID].sort());
  });

  it("the operator's own lists do show it, with its label", async () => {
    expect(await listPage()).toContain('bg-sky-50 text-sky-700">Quote</span>');
    state.orderWorkspace = true;
    const list = await listPage();
    expect(list).toContain(">Quote</span>");
    expect((await listOrdersPage({})).rows.map((r) => r.id)).toContain(QUOTE_ID);
    await expect(listOrders.handler({ limit: 20 }, CTX)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: QUOTE_ID, status: "quote" })]),
    );
  });
});

describe.skipIf(!sqlite)("the admin filter and form, with the flag off", () => {
  beforeEach(async () => {
    state.quotes = false;
    await addOrder(PAID_ID, "paid");
    await addQuote();
  });

  it("the workspace has its seven tabs, and `?tab=quotes` is an unknown tab: everything, as before", async () => {
    state.orderWorkspace = true;
    const list = await listPage();
    expect(tabLabels(list)).toEqual(["All", "Awaiting payment", "Processing", "Shipped", "Completed", "Cancelled / refunded", "Needs action"]);
    expect(list).not.toContain("Quotes");
    const rows = (await listOrdersPage({ tab: "quotes" })).rows.map((r) => r.id);
    expect(rows).toEqual((await listOrdersPage({ tab: "nope" })).rows.map((r) => r.id));
    expect(rows.sort()).toEqual([PAID_ID, QUOTE_ID].sort());
  });

  it("the plain list has no filter, and `?tab=quotes` changes nothing", async () => {
    const list = await listPage();
    expect(tabLabels(list)).toEqual([]);
    expect(await listPage("quotes")).toBe(list);
  });

  it("an order in quote renders on both order pages, and may leave, never as an unknown string could", async () => {
    const plain = await orderPage(QUOTE_ID);
    expect(plain).toContain(">Change status from Quote to</label>");
    expect(options(plain)).toEqual(["pending_payment", "cancelled"]);

    state.orderWorkspace = true;
    const workspace = await orderPage(QUOTE_ID);
    expect(workspace).toContain(">Quote</span>");
    expect(options(workspace)).toEqual(["pending_payment", "cancelled"]);
  });

  it("the reader hands the pages the 12 rows, on an empty table and a seeded one, and the seed writes 12", async () => {
    expect((await getOrderStatuses()).map((r) => r.key)).toEqual([...ORDER_STATUSES]);
    await seedOrderStatuses(state.prisma);
    expect(await state.prisma.orderStatus.count()).toBe(ORDER_STATUSES.length);
    expect((await getOrderStatuses()).map((r) => r.key)).toEqual([...ORDER_STATUSES]);
  });

  it("a legacy string may go to any of the 12, and the quote is not among them", async () => {
    await addOrder("legacy", "legacy_weird");
    expect(options(await orderPage("legacy"))).toEqual([...ORDER_STATUSES]);
  });

  it("a real order's page is byte for byte the same with the flag on, on both page kinds", async () => {
    for (const workspace of [false, true]) {
      state.orderWorkspace = workspace;
      state.quotes = false;
      const off = await orderPage(PAID_ID);
      state.quotes = true;
      expect(await orderPage(PAID_ID), `workspace ${workspace}`).toBe(off);
    }
  });
});

describe.skipIf(!sqlite)("the admin filter and form, with the flag on", () => {
  beforeEach(async () => {
    state.quotes = true;
    await addOrder(PAID_ID, "paid");
    await addQuote();
  });

  it("the workspace gets a Quotes tab, and it holds the quotes and nothing else", async () => {
    state.orderWorkspace = true;
    const list = await listPage();
    expect(tabLabels(list)).toEqual(["All", "Awaiting payment", "Processing", "Shipped", "Completed", "Cancelled / refunded", "Needs action", "Quotes"]);
    expect(list).toContain('href="/admin/ordrer?tab=quotes"');

    expect((await listOrdersPage({ tab: "quotes" })).rows.map((r) => r.id)).toEqual([QUOTE_ID]);
    const tabbed = await listPage("quotes");
    expect(tabbed).toContain(`Name of ${QUOTE_ID}`);
    expect(tabbed).not.toContain(`Name of ${PAID_ID}`);
    // And no other tab holds it, All apart.
    for (const tab of ["awaiting_payment", "processing", "shipped", "completed", "closed", "attention"]) {
      expect((await listOrdersPage({ tab })).rows.map((r) => r.id), tab).not.toContain(QUOTE_ID);
    }
    expect((await listOrdersPage({ tab: "all" })).rows.map((r) => r.id).sort()).toEqual([PAID_ID, QUOTE_ID].sort());
  });

  it("the plain list, which has no tabs of its own, gets All and Quotes, and the filter works", async () => {
    const list = await listPage();
    expect(tabLabels(list)).toEqual(["All", "Quotes"]);
    expect(list).toContain(PAID_ID);
    expect(list).toContain(QUOTE_ID);

    const quotes = await listPage("quotes");
    expect(quotes).toContain(QUOTE_ID);
    expect(quotes).not.toContain(PAID_ID);
    // Which of the two is lit follows the filter.
    const lit = (html: string) => /<a [^>]*bg-sol-accent[^>]*>([^<]*)<\/a>/.exec(html)?.[1];
    expect(lit(list)).toBe("All");
    expect(lit(quotes)).toBe("Quotes");
  });

  it("the order page's form names it and offers its two ways out, opening on the first", async () => {
    for (const workspace of [false, true]) {
      state.orderWorkspace = workspace;
      const page = await orderPage(QUOTE_ID);
      expect(options(page), `workspace ${workspace}`).toEqual(["pending_payment", "cancelled"]);
      expect(/<option value="([^"]*)"[^>]*\bselected\b/.exec(page)?.[1]).toBe("pending_payment");
    }
    state.orderWorkspace = false;
    expect(await orderPage(QUOTE_ID)).toContain(">Change status from Quote to</label>");
  });

  it("the workspace's order page leaves out what presumes a purchase, on a quote only", async () => {
    state.orderWorkspace = true;
    const PANELS = ['id="tracking"', 'id="handlinger"', 'id="fulfillment"', 'id="returneringer"'];
    const quote = await orderPage(QUOTE_ID);
    const paid = await orderPage(PAID_ID);
    for (const panel of PANELS) {
      expect(quote, panel).not.toContain(panel);
      expect(paid, panel).toContain(panel);
    }
  });

  it("no status offers a move into it, and a legacy string still may go to the 12 and no further", async () => {
    await addOrder("legacy", "legacy_weird");
    expect(options(await orderPage("legacy"))).toEqual([...ORDER_STATUSES]);
    for (const status of ORDER_STATUSES) expect(options(await orderPage(PAID_ID)), status).not.toContain("quote");
  });

  it("the reader adds the quote's row, on an empty table, a seeded one and a broken one", async () => {
    const keys = async () => (await getOrderStatuses()).map((r) => r.key);
    expect(await keys()).toEqual([...ORDER_STATUSES, "quote"]);
    await seedOrderStatuses(state.prisma);
    expect(await keys()).toEqual([...ORDER_STATUSES, "quote"]);
    await raw.execute('DROP TABLE "OrderStatus"');
    expect(await keys()).toEqual([...ORDER_STATUSES, "quote"]);
  });

  it("a shop's own row for the quote gives it its label on the list and the form, and moves no status list", async () => {
    await state.prisma.orderStatus.create({ data: { key: "quote", label: "Tilbud", sortOrder: 5 } });

    expect(await listPage()).toContain(">Tilbud</span>");
    expect(await orderPage(QUOTE_ID)).toContain(">Change status from Tilbud to</label>");
    expect(options(await orderPage(PAID_ID))).toEqual([...legalNextStates("paid")]);
  });
});
