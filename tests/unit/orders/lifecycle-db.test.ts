/**
 * ORD0-b — transitionOrder (lib/orders/lifecycle.ts), the one door for
 * Order.status on an order that exists, on a real libSQL file. This file holds what
 * the door itself does: every operator move in the table, every fact from every
 * status, and every lost write. What each path hands it, over the real routes,
 * actions and tool: ../transition-order-replay-db.test.ts. That nothing writes the
 * status beside it: ./lifecycle.test.ts.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";
import {
  OrderChangedError,
  OrderNoLongerUnpaidError,
  transitionOrder,
  type FactMove,
} from "@/lib/orders/lifecycle";
import {
  IllegalOrderTransitionError,
  ORDER_STATUSES,
  STATUS_LABELS,
  canTransition,
  type OrderStatus,
} from "@/lib/orders/status";

const ROOT = join(__dirname, "..", "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

let dir = "";
let db: PrismaClient;
let seq = 0;

beforeAll(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-lifecycle-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  raw.close();
  db = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

  await db.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
  await db.product.createMany({
    data: [
      { id: "plain", slug: "plain", name: "Plain Mug", description: "", priceDkk: 12900, images: "[]", categoryId: "cat", stock: 500 },
      { id: "fence", slug: "fence", name: "Fence Panel", description: "", priceDkk: 50000, images: "[]", categoryId: "cat", stock: 500 },
    ],
  });
  await db.productVariant.create({
    data: { id: "fence-2m", productId: "fence", sku: "F-2M", priceDkk: 60000, stock: 500, attributes: { height: "2m" } },
  });
  await db.discountCode.create({ data: { code: "TEN", type: "percent", value: 10, usageCount: 500 } });
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** An order in `status`, with a plain line, a variant line and a discount code. */
async function orderIn(status: string) {
  const id = `ord_${++seq}`;
  await db.order.create({
    data: {
      id,
      status,
      email: "buyer@shop.example.test",
      shippingName: "Buyer Example",
      shippingAddress: "Example Road 12",
      shippingZip: "1234",
      shippingCity: "Exampleton",
      subtotalDkk: 145800,
      discountDkk: 14580,
      shippingDkk: 4900,
      totalDkk: 136120,
      discountCode: "TEN",
      items: {
        create: [
          { productId: "plain", productName: "Plain Mug", unitPriceDkk: 12900, quantity: 2 },
          { productId: "fence", variantId: "fence-2m", productName: "Fence Panel", unitPriceDkk: 60000, quantity: 3 },
        ],
      },
    },
  });
  return id;
}

/** Everything a move could touch. */
async function world(orderId: string) {
  const [order, notes, plain, fence, variant, code, audits] = await Promise.all([
    db.order.findUnique({ where: { id: orderId } }),
    db.orderNote.findMany({
      where: { orderId },
      select: { type: true, author: true, body: true, metaJson: true },
    }),
    db.product.findUniqueOrThrow({ where: { id: "plain" } }),
    db.product.findUniqueOrThrow({ where: { id: "fence" } }),
    db.productVariant.findUniqueOrThrow({ where: { id: "fence-2m" } }),
    db.discountCode.findUniqueOrThrow({ where: { code: "TEN" } }),
    db.auditLog.count(),
  ]);
  return {
    order,
    notes,
    stock: { plain: plain.stock, fence: fence.stock, variant: variant.stock },
    discountUses: code.usageCount,
    audits,
  };
}

type World = Awaited<ReturnType<typeof world>>;

/** The line goes back to where checkout took it: the variant's stock, not its product's. */
const restocked = (before: World) => ({
  plain: before.stock.plain + 2,
  fence: before.stock.fence,
  variant: before.stock.variant + 3,
});

const WHO = { actor: "user:op", source: "test" };

function operatorMoves(orderId: string, from: string, to: string, note?: { body: string; meta: Record<string, unknown> }) {
  return db.$transaction((tx) =>
    transitionOrder({ client: tx, kind: "operator", ...WHO, orderId, from, to, note }),
  );
}

type Report = { to: string; from: string | null; paymentMethod?: string };

/** Through `prisma` by default: a fact that is one write needs no transaction. */
function records(orderId: string, report: Report, client: FactMove["client"] = db) {
  return transitionOrder({ client, kind: "fact", ...WHO, orderId, ...report } as FactMove);
}

describe.skipIf(!sqlite)("kind operator: the table decides, all 144 moves", () => {
  const MOVES = ORDER_STATUSES.flatMap((from) => ORDER_STATUSES.map((to) => ({ from, to })));

  it("the fixture has moves the table allows and moves it refuses", () => {
    expect(MOVES).toHaveLength(144);
    const allowed = MOVES.filter(({ from, to }) => canTransition(from, to));
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed.length).toBeLessThan(144);
  });

  it.each(MOVES)("$from → $to", async ({ from, to }) => {
    const orderId = await orderIn(from);
    const before = await world(orderId);

    if (!canTransition(from, to)) {
      await expect(operatorMoves(orderId, from, to)).rejects.toBeInstanceOf(IllegalOrderTransitionError);
      expect(await world(orderId)).toEqual(before);
      return;
    }

    const unpaidCancel = from === "pending_payment" && to === "cancelled";
    await expect(operatorMoves(orderId, from, to)).resolves.toEqual({ restocked: unpaidCancel });

    const line = `Status: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`;
    const after = await world(orderId);
    // Only the status: an operator's `paid` stamps no paidAt, a `refunded` no refundedAt.
    expect(after.order).toEqual({ ...before.order, status: to });
    expect(after.notes).toEqual([
      {
        type: "system",
        author: "user:op",
        body: unpaidCancel ? `${line} — items returned to stock` : line,
        metaJson: JSON.stringify({ from, to, ...(unpaidCancel ? { restocked: true } : {}) }),
      },
    ]);
    expect(after.stock).toEqual(unpaidCancel ? restocked(before) : before.stock);
    expect(after.discountUses).toBe(before.discountUses - (unpaidCancel ? 1 : 0));
    expect(after.audits).toBe(before.audits);
  });
});

describe.skipIf(!sqlite)("kind operator: what the guard does not read, and what the caller words", () => {
  it.each(["paid", "cancelled", "shipped"])("a status the engine does not know moves on to %s", async (to) => {
    const orderId = await orderIn("on_hold");
    const before = await world(orderId);

    await expect(operatorMoves(orderId, "on_hold", to)).resolves.toEqual({ restocked: false });

    const after = await world(orderId);
    expect(after.order).toEqual({ ...before.order, status: to });
    expect(after.notes.map((n) => n.body)).toEqual([`Status: on_hold → ${STATUS_LABELS[to as OrderStatus]}`]);
    expect(after.stock).toEqual(before.stock);
  });

  it("a status the engine does not know as the target passes too, as it did", async () => {
    const orderId = await orderIn("paid");
    await operatorMoves(orderId, "paid", "on_hold");
    expect((await world(orderId)).order?.status).toBe("on_hold");
  });

  it("a caller's note replaces the default one, word for word", async () => {
    const orderId = await orderIn("paid");
    const meta = { manual: true, moneyMoved: false };

    await operatorMoves(orderId, "paid", "refunded", { body: "Manual registration", meta });

    expect((await world(orderId)).notes).toEqual([
      { type: "system", author: "user:op", body: "Manual registration", metaJson: JSON.stringify(meta) },
    ]);
  });
});

describe.skipIf(!sqlite)("kind fact: never refused, from any of the 12 statuses", () => {
  const FACTS: { to: string; report: (from: OrderStatus) => Report; columns: Record<string, unknown> }[] = [
    { to: "refunded", report: () => ({ to: "refunded", from: null }), columns: { refundedAt: expect.any(Date) } },
    { to: "partial_refund", report: () => ({ to: "partial_refund", from: null }), columns: { refundedAt: expect.any(Date) } },
    { to: "disputed", report: () => ({ to: "disputed", from: null }), columns: { disputedAt: expect.any(Date) } },
    { to: "flagged_review", report: (from) => ({ to: "flagged_review", from }), columns: {} },
    {
      to: "paid",
      report: (from) => ({ to: "paid", from, paymentMethod: "stripe_card" }),
      columns: { paymentMethod: "stripe_card", paidAt: expect.any(Date) },
    },
  ];
  const CASES = FACTS.flatMap((fact) => ORDER_STATUSES.map((from) => ({ from, ...fact })));

  it("the fixture holds moves the operator table would refuse", () => {
    expect(CASES).toHaveLength(60);
    expect(CASES.filter(({ from, to }) => !canTransition(from, to as OrderStatus)).length).toBeGreaterThan(0);
  });

  it.each(CASES)("$from: $to is recorded", async ({ from, to, report, columns }) => {
    const orderId = await orderIn(from);
    const before = await world(orderId);

    await expect(records(orderId, report(from))).resolves.toEqual({ written: true });

    const after = await world(orderId);
    expect(after.order).toEqual({ ...before.order, status: to, ...columns });
    // A fact writes no note and no audit row, and moves no stock. ORD1-c decides the note.
    expect({ ...after, order: null }).toEqual({ ...before, order: null });
  });

  it.each(FACTS)("$to is one write the same way inside a transaction", async ({ to, report, columns }) => {
    const orderId = await orderIn("paid");
    const before = await world(orderId);

    await expect(db.$transaction((tx) => records(orderId, report("paid"), tx))).resolves.toEqual({ written: true });

    expect((await world(orderId)).order).toEqual({ ...before.order, status: to, ...columns });
  });

  it("paid records the payment method it is handed", async () => {
    const orderId = await orderIn("pending_payment");
    await records(orderId, { to: "paid", from: "pending_payment", paymentMethod: "frisbii_mobilepay" });
    expect((await world(orderId)).order?.paymentMethod).toBe("frisbii_mobilepay");
  });
});

describe.skipIf(!sqlite)("kind fact: an unpaid order was cancelled", () => {
  it("it goes back where checkout took it, one discount use with it, in the transaction it is handed", async () => {
    const orderId = await orderIn("pending_payment");
    const before = await world(orderId);

    const report = { to: "cancelled", from: "pending_payment" };
    await expect(db.$transaction((tx) => records(orderId, report, tx))).resolves.toEqual({ written: true });

    const after = await world(orderId);
    expect(after.order).toEqual({ ...before.order, status: "cancelled" });
    expect(after.stock).toEqual(restocked(before));
    expect(after.discountUses).toBe(before.discountUses - 1);
    expect(after.notes).toEqual([]);
  });

  it("the second path to arrive writes nothing and gives nothing back", async () => {
    const orderId = await orderIn("pending_payment");
    const report = { to: "cancelled", from: "pending_payment" };
    await db.$transaction((tx) => records(orderId, report, tx));
    const before = await world(orderId);

    await expect(db.$transaction((tx) => records(orderId, report, tx))).resolves.toEqual({ written: false });

    expect(await world(orderId)).toEqual(before);
  });
});

describe.skipIf(!sqlite)("a lost write writes nothing, and reports it", () => {
  const NOT_AWAITING_PAYMENT = ORDER_STATUSES.filter((status) => status !== "pending_payment");

  it.each(NOT_AWAITING_PAYMENT)("operator, read awaiting payment, now %s: mark paid throws OrderChangedError", async (now) => {
    const orderId = await orderIn(now);
    const before = await world(orderId);

    const err = await operatorMoves(orderId, "pending_payment", "paid").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(OrderChangedError);
    expect(err).not.toBeInstanceOf(OrderNoLongerUnpaidError);
    expect((err as Error).message).toBe(
      `Order ${orderId} is no longer "Awaiting payment" — it changed while it was being updated. Reload the order and try again.`,
    );
    expect(await world(orderId)).toEqual(before);
  });

  it.each(NOT_AWAITING_PAYMENT)("operator, read awaiting payment, now %s: cancel throws OrderNoLongerUnpaidError", async (now) => {
    const orderId = await orderIn(now);
    const before = await world(orderId);

    const err = await operatorMoves(orderId, "pending_payment", "cancelled").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(OrderNoLongerUnpaidError);
    expect(err).toBeInstanceOf(OrderChangedError);
    expect((err as Error).message).toBe(
      `Order ${orderId} is no longer awaiting payment — it changed while it was being cancelled. Reload the order and try again.`,
    );
    expect(await world(orderId)).toEqual(before);
  });

  it.each([
    ["paid", { to: "paid", from: "pending_payment", paymentMethod: "stripe_card" }],
    ["flagged_review", { to: "flagged_review", from: "pending_payment" }],
  ] as const)("fact %s, read awaiting payment, now cancelled: written is false", async (_to, report) => {
    const orderId = await orderIn("cancelled");
    const before = await world(orderId);

    await expect(records(orderId, report)).resolves.toEqual({ written: false });

    expect(await world(orderId)).toEqual(before);
  });

  it.each(NOT_AWAITING_PAYMENT)("fact cancelled, now %s: written is false, nothing goes back", async (now) => {
    const orderId = await orderIn(now);
    const before = await world(orderId);

    const report = { to: "cancelled", from: "pending_payment" };
    await expect(db.$transaction((tx) => records(orderId, report, tx))).resolves.toEqual({ written: false });

    expect(await world(orderId)).toEqual(before);
  });
});

describe.skipIf(!sqlite)("an order that is not there", () => {
  it("an operator's move throws OrderChangedError", async () => {
    await expect(operatorMoves("no-such-order", "paid", "shipped")).rejects.toBeInstanceOf(OrderChangedError);
  });

  it("a conditional fact reports that nothing was written", async () => {
    const report = { to: "paid", from: "pending_payment", paymentMethod: "stripe_card" };
    await expect(records("no-such-order", report)).resolves.toEqual({ written: false });
  });

  it("an unconditional fact throws, for its path to handle: it cannot report what it has no order to write on", async () => {
    await expect(records("no-such-order", { to: "refunded", from: null })).rejects.toMatchObject({ code: "P2025" });
  });
});

describe.skipIf(!sqlite)("the door writes through the client it is handed", () => {
  it("a transaction that fails later takes the move, its note and its stock with it", async () => {
    const orderId = await orderIn("pending_payment");
    const before = await world(orderId);

    await expect(
      db.$transaction(async (tx) => {
        await transitionOrder({
          client: tx, kind: "operator", ...WHO, orderId, from: "pending_payment", to: "cancelled",
        });
        throw new Error("something later in the transaction");
      }),
    ).rejects.toThrow("something later in the transaction");

    expect(await world(orderId)).toEqual(before);
  });
});
