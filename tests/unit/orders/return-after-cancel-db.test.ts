import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";

/**
 * An order's stock comes back once. Cancelling an unpaid order gives it all back,
 * and a return gives back what it names, so a return on an order cancelled that
 * way counted the same units twice. These run the real actions and the real
 * cancel on a real libSQL file and read the stock column. The stand-ins are the
 * mail provider, Stripe's network and the request.
 */

const ROOT = join(__dirname, "..", "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const state = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));

vi.mock("@/lib/db", () => ({
  get prisma() {
    return state.prisma;
  },
}));
vi.mock("@/lib/stripe", () => ({
  getStripeClient: async () => ({ paymentIntents: { retrieve: vi.fn(), cancel: vi.fn() } }),
  createRefund: vi.fn(),
}));
vi.mock("@/lib/mailer", () => ({
  mailer: { sendOrderConfirmation: vi.fn() },
  sendShippingNotificationEmail: vi.fn(),
  sendRefundConfirmationEmail: vi.fn(),
  sendReturnReceivedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/fulfillment", () => ({ createFulfillmentOrders: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ user: { id: "admin" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createReturn, receiveAndRestock, updateOrderStatusAdmin } from "@/app/admin/ordrer/actions";
import { cancelUnpaidOrder } from "@/lib/orders/cancel-unpaid";
import { transitionOrder } from "@/lib/orders/lifecycle";

vi.setConfig({ testTimeout: 30_000 });

const START_STOCK = 10;
const QUANTITY = 3;
const NOT_PAID = /has not been paid/;
const ALREADY_BACK = /cancelled before its payment was registered/;

let dir = "";
let raw: Client;

beforeEach(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-return-cancel-"));
  const url = `file:${join(dir, "shop.db")}`;
  raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  state.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  vi.spyOn(console, "error").mockImplementation(() => {});
  await state.prisma.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
  await state.prisma.product.create({
    data: {
      id: "mug",
      slug: "mug",
      name: "Plain Mug",
      description: "",
      priceDkk: 12900,
      images: "[]",
      categoryId: "cat",
      stock: START_STOCK,
    },
  });
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  if (!sqlite) return;
  await state.prisma.$disconnect();
  raw.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A row in the given status, with its units already drawn from stock as checkout draws them. */
async function addOrder(status: string, over: { paidAt?: Date } = {}) {
  await state.prisma.product.update({ where: { id: "mug" }, data: { stock: { decrement: QUANTITY } } });
  const order = await state.prisma.order.create({
    data: {
      id: "order-1",
      email: "buyer@shop.example.test",
      shippingName: "Buyer",
      shippingAddress: "Example Road 12",
      shippingZip: "1234",
      shippingCity: "Exampleton",
      subtotalDkk: 12900,
      shippingDkk: 500,
      totalDkk: 13400,
      status,
      paidAt: over.paidAt ?? null,
      items: { create: { productId: "mug", productName: "Plain Mug", unitPriceDkk: 4300, quantity: QUANTITY } },
    },
    include: { items: true },
  });
  return order.items[0].id;
}

/** A return that already exists: written before the rule, or while the order could still have one. */
async function addReturn(orderItemId: string) {
  const ret = await state.prisma.return.create({
    data: {
      orderId: "order-1",
      status: "approved",
      reason: "changed mind",
      createdBy: "user:admin",
      items: { create: { orderItemId, quantity: QUANTITY, productName: "Plain Mug" } },
    },
  });
  return ret.id;
}

const stock = async () => (await state.prisma.product.findUniqueOrThrow({ where: { id: "mug" } })).stock;
const ask = (orderItemId: string) =>
  createReturn("order-1", { items: [{ orderItemId, quantity: QUANTITY }], reason: "changed mind" });

describe.runIf(sqlite)("a return never brings back stock a cancel already gave back", () => {
  it("an order awaiting payment gets no return, and its later cancel gives the stock back once", async () => {
    const line = await addOrder("pending_payment");

    expect(await ask(line)).toEqual({ ok: false, error: expect.stringMatching(NOT_PAID) });
    expect(await state.prisma.return.count()).toBe(0);

    expect(await updateOrderStatusAdmin("order-1", "cancelled")).toEqual({ ok: true });
    expect(await stock()).toBe(START_STOCK);
  });

  it("an operator's cancel of an unpaid order: no new return, and stock stays where the cancel put it", async () => {
    const line = await addOrder("pending_payment");
    expect(await updateOrderStatusAdmin("order-1", "cancelled")).toEqual({ ok: true });
    expect(await stock()).toBe(START_STOCK);

    expect(await ask(line)).toEqual({ ok: false, error: expect.stringMatching(ALREADY_BACK) });
    expect(await state.prisma.return.count()).toBe(0);
    expect(await stock()).toBe(START_STOCK);
  });

  it("the webhook's and the cron's cancel leaves no note, and is refused the same way", async () => {
    const line = await addOrder("pending_payment");
    await state.prisma.$transaction((tx) => cancelUnpaidOrder(tx, "order-1"));
    expect(await state.prisma.orderNote.count()).toBe(0);
    expect(await stock()).toBe(START_STOCK);

    expect(await ask(line)).toEqual({ ok: false, error: expect.stringMatching(ALREADY_BACK) });
  });

  it("a return that existed before the cancel cannot be received after it", async () => {
    const line = await addOrder("pending_payment");
    const returnId = await addReturn(line);
    expect(await updateOrderStatusAdmin("order-1", "cancelled")).toEqual({ ok: true });

    expect(await receiveAndRestock(returnId)).toEqual({ ok: false, error: expect.stringMatching(ALREADY_BACK) });

    expect(await stock()).toBe(START_STOCK);
    const ret = await state.prisma.return.findUniqueOrThrow({ where: { id: returnId } });
    expect(ret).toMatchObject({ restocked: false, status: "approved" });
  });

  it("a return that existed while the order awaited payment cannot be received before its cancel either", async () => {
    const line = await addOrder("pending_payment");
    const returnId = await addReturn(line);

    expect(await receiveAndRestock(returnId)).toEqual({ ok: false, error: expect.stringMatching(NOT_PAID) });
    expect(await stock()).toBe(START_STOCK - QUANTITY);

    expect(await updateOrderStatusAdmin("order-1", "cancelled")).toEqual({ ok: true });
    expect(await stock()).toBe(START_STOCK);
  });

  it("a paid order an operator cancelled keeps its return: that cancel gave nothing back", async () => {
    const line = await addOrder("paid");
    expect(await updateOrderStatusAdmin("order-1", "cancelled")).toEqual({ ok: true });
    expect(await stock()).toBe(START_STOCK - QUANTITY);

    expect(await ask(line)).toEqual({ ok: true });
    const ret = await state.prisma.return.findFirstOrThrow({ where: { orderId: "order-1" } });
    expect(await receiveAndRestock(ret.id)).toEqual({ ok: true });
    expect(await stock()).toBe(START_STOCK);

    expect(await receiveAndRestock(ret.id)).toEqual({ ok: true });
    expect(await stock()).toBe(START_STOCK);
  });

  // The customer paid at Stripe and the webhook was late. The operator cancelled,
  // which gave the stock back, and the cancel's own note and the refund box send
  // them to a refund and then to the returns panel.
  it.each(["refunded", "partial_refund", "disputed"] as const)(
    "%s landing after an unpaid cancel does not reopen the return",
    async (to) => {
      const line = await addOrder("pending_payment");
      const returnId = await addReturn(line);
      expect(await updateOrderStatusAdmin("order-1", "cancelled")).toEqual({ ok: true });
      expect(await stock()).toBe(START_STOCK);

      await transitionOrder({
        client: state.prisma,
        kind: "fact",
        to,
        from: null,
        orderId: "order-1",
        actor: "system:test",
        source: "stripe-webhook",
      });
      expect((await state.prisma.order.findUniqueOrThrow({ where: { id: "order-1" } })).status).toBe(to);

      expect(await ask(line)).toEqual({ ok: false, error: expect.stringMatching(ALREADY_BACK) });
      expect(await receiveAndRestock(returnId)).toEqual({ ok: false, error: expect.stringMatching(ALREADY_BACK) });
      expect(await stock()).toBe(START_STOCK);
    },
  );

  it("a later cancel from a dispute does not hide the unpaid cancel that gave the stock back", async () => {
    const line = await addOrder("pending_payment");
    expect(await updateOrderStatusAdmin("order-1", "cancelled")).toEqual({ ok: true });
    await transitionOrder({
      client: state.prisma,
      kind: "fact",
      to: "disputed",
      from: null,
      orderId: "order-1",
      actor: "system:test",
      source: "stripe-webhook",
    });
    expect(await updateOrderStatusAdmin("order-1", "cancelled")).toEqual({ ok: true });

    expect(await ask(line)).toEqual({ ok: false, error: expect.stringMatching(ALREADY_BACK) });
    expect(await stock()).toBe(START_STOCK);
  });

  it("a paid order cancelled before operators' cancels left a note keeps its return", async () => {
    const line = await addOrder("cancelled", { paidAt: new Date("2026-09-01T10:00:00Z") });
    expect(await state.prisma.orderNote.count()).toBe(0);

    expect(await ask(line)).toEqual({ ok: true });
    const ret = await state.prisma.return.findFirstOrThrow({ where: { orderId: "order-1" } });
    expect(await receiveAndRestock(ret.id)).toEqual({ ok: true });
    expect(await stock()).toBe(START_STOCK);
  });

  it("an order revived by a late payment before #602, then shipped, keeps its return", async () => {
    const line = await addOrder("shipped", { paidAt: new Date("2026-09-01T10:00:00Z") });
    await state.prisma.orderNote.create({
      data: {
        orderId: "order-1",
        type: "system",
        author: "user:admin",
        body: "Status: Awaiting payment → Cancelled",
        metaJson: JSON.stringify({ from: "pending_payment", to: "cancelled" }),
      },
    });

    expect(await ask(line)).toEqual({ ok: true });
    const ret = await state.prisma.return.findFirstOrThrow({ where: { orderId: "order-1" } });
    expect(await receiveAndRestock(ret.id)).toEqual({ ok: true });
    expect(await stock()).toBe(START_STOCK);
  });

  it("a payment an operator registered, then a cancel through the tool before #630, keeps its return", async () => {
    const line = await addOrder("cancelled");
    await state.prisma.orderNote.create({
      data: {
        orderId: "order-1",
        type: "system",
        author: "user:admin",
        body: "Status: Awaiting payment → Paid",
        metaJson: JSON.stringify({ from: "pending_payment", to: "paid" }),
      },
    });

    expect(await ask(line)).toEqual({ ok: true });
  });

  it("an order marked paid by hand and cancelled today keeps its return", async () => {
    const line = await addOrder("pending_payment");
    expect(await updateOrderStatusAdmin("order-1", "paid")).toEqual({ ok: true });
    expect(await updateOrderStatusAdmin("order-1", "cancelled")).toEqual({ ok: true });
    expect(await stock()).toBe(START_STOCK - QUANTITY);

    expect(await ask(line)).toEqual({ ok: true });
    const ret = await state.prisma.return.findFirstOrThrow({ where: { orderId: "order-1" } });
    expect(await receiveAndRestock(ret.id)).toEqual({ ok: true });
    expect(await stock()).toBe(START_STOCK);
  });

  it("an order paid and shipped takes its return as before", async () => {
    const line = await addOrder("shipped");

    expect(await ask(line)).toEqual({ ok: true });
    const ret = await state.prisma.return.findFirstOrThrow({ where: { orderId: "order-1" } });
    expect(await receiveAndRestock(ret.id)).toEqual({ ok: true });
    expect(await stock()).toBe(START_STOCK);
  });
});
