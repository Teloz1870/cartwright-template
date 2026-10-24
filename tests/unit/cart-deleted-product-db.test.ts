import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/app/generated/prisma/client";

/**
 * CART-DELETED-PRODUCT, against a real database. The order transaction's stock
 * decrement only runs on a live product: `deletedAt: null` on Product, and the
 * relation filter `product: { deletedAt: null }` on ProductVariant (createOrder
 * and createOrderFromAcpSession alike).
 *
 * A review claimed Prisma 7.10 + libSQL rejects a relation filter in
 * `updateMany`, which would break every variant checkout and make ACP refund
 * valid orders. Measured here instead (Prisma 7.10.1, adapter-libsql 7.10.1):
 * it is accepted and compiled into the one atomic statement
 *   UPDATE ProductVariant SET stock = stock - ? WHERE id = ? AND stock >= ?
 *     AND EXISTS(SELECT t0.id FROM Product t0 WHERE t0.deletedAt IS NULL
 *                AND ProductVariant.productId = t0.id …)
 * — count 1 on a live product, 0 on a deleted one.
 *
 * CART-DRAFT-FILTER: the same guard also requires `status: "active"`
 * (LIVE_PRODUCT_WHERE), compiled into that one statement as well — a product
 * set to draft is refused exactly where a deleted one is: count 0, rollback.
 *
 * The REAL createOrder, getCart and createOrderFromAcpSession run on a libSQL
 * file built from the migration baseline (CI's `pnpm db:verify` keeps it equal
 * to prisma/schema.prisma). Only the request (cookie, session), Stripe and mail
 * are stand-ins.
 */

const ROOT = join(__dirname, "..", "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
// A shop forked to Postgres generates a client the libSQL adapter cannot drive.
const sqlite =
  existsSync(SCHEMA) && /datasource\s+db\s*\{[^}]*provider\s*=\s*"sqlite"/.test(readFileSync(SCHEMA, "utf8"));

const state = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  /** Runs as an order transaction opens — after the cart was read. */
  beforeTransaction: null as null | (() => Promise<unknown>),
  createPaymentIntent: vi.fn(),
}));

// The real client, with one seam: `$transaction` can run a step first.
vi.mock("@/lib/db", () => ({
  get prisma() {
    return new Proxy(state.prisma, {
      get(target, key) {
        if (key === "$transaction") {
          return async (fn: Parameters<PrismaClient["$transaction"]>[0]) => {
            await state.beforeTransaction?.();
            return target.$transaction(fn as never);
          };
        }
        return Reflect.get(target, key, target);
      },
    });
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "cart_session" ? { value: "sess-1" } : undefined),
    set: vi.fn(),
  }),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/stripe", () => ({
  isStripeReady: async () => true,
  createPaymentIntent: state.createPaymentIntent,
  getStripeKeys: async () => ({ publishableKey: "pk_test_123" }),
}));
vi.mock("@/lib/currency-server", () => ({ getCheckoutCurrency: async () => "DKK" }));
vi.mock("@/lib/fx/rates", () => ({ primeFxRatesFromDb: async () => undefined }));
vi.mock("@/lib/mailer", () => ({ mailer: { sendOrderConfirmation: vi.fn() } }));
vi.mock("@/lib/orders/notify-owner", () => ({ notifyOwnerOfPaidOrder: vi.fn() }));
// create-acp.ts only needs the error type (the real module is server-only).
vi.mock("@/lib/acp", () => ({ AcpError: class AcpError extends Error {} }));

const { createOrder } = await import("@/lib/orders/create");
const { createOrderFromAcpSession } = await import("@/lib/orders/create-acp");

const shipping = {
  email: "kunde@example.dk",
  shippingName: "Kunde Jensen",
  shippingAddress: "Testvej 12",
  shippingZip: "1234",
  shippingCity: "Testby",
};

let dir = "";

beforeEach(async () => {
  if (!sqlite) return;
  dir = mkdtempSync(join(tmpdir(), "cw-cart-deleted-"));
  const url = `file:${join(dir, "shop.db")}`;
  const raw = createClient({ url });
  await raw.executeMultiple(
    readFileSync(join(ROOT, "prisma", "migrations", "00000000000000_init", "migration.sql"), "utf8"),
  );
  raw.close();
  state.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  state.beforeTransaction = null;
  state.createPaymentIntent.mockReset().mockResolvedValue({
    paymentIntentId: "pi_123",
    clientSecret: "pi_123_secret",
  });

  const db = state.prisma;
  await db.category.create({ data: { id: "cat", slug: "cat", name: "Cat" } });
  // "plain" sells without variants; "fence" sells only through its variant.
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
  await state.prisma?.$disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function stock() {
  const db = state.prisma;
  const [plain, fence, variant] = await Promise.all([
    db.product.findUniqueOrThrow({ where: { id: "plain" } }),
    db.product.findUniqueOrThrow({ where: { id: "fence" } }),
    db.productVariant.findUniqueOrThrow({ where: { id: "fence-2m" } }),
  ]);
  return { plain: plain.stock, fence: fence.stock, variant: variant.stock };
}

const deleteProduct = (id: string) =>
  state.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
const draftProduct = (id: string) =>
  state.prisma.product.update({ where: { id }, data: { status: "draft" } });

/** The two ways a product leaves sale on this path; each case runs for both. */
const WITHDRAW = [
  ["deleted", deleteProduct],
  ["set to draft", draftProduct],
] as const;
const LINES = [
  ["without variants", { productId: "plain", variantId: null }, "plain"],
  ["through a variant", { productId: "fence", variantId: "fence-2m" }, "fence"],
] as const;
const RACES = WITHDRAW.flatMap(([how, withdraw]) =>
  LINES.map(([label, line, productId]) => [how, label, line, productId, withdraw] as const),
);

describe.skipIf(!sqlite)("checkout's live-product guard on a real database", () => {
  it("a live product without variants: the order is placed and its stock decremented", async () => {
    await state.prisma.cartItem.create({ data: { cartId: "cart-1", productId: "plain", quantity: 2 } });

    const result = await createOrder(shipping);

    expect(result).toMatchObject({ ok: true, paymentMode: "stripe" });
    expect(await stock()).toEqual({ plain: 3, fence: 5, variant: 3 });
    expect(state.createPaymentIntent).toHaveBeenCalledTimes(1);
    expect(await state.prisma.cartItem.count()).toBe(0);
  });

  it("a live variant: Prisma runs the relation-filtered decrement, and only the variant's stock moves", async () => {
    await state.prisma.cartItem.create({
      data: { cartId: "cart-1", productId: "fence", variantId: "fence-2m", quantity: 2 },
    });

    const result = await createOrder(shipping);

    expect(result).toMatchObject({ ok: true, paymentMode: "stripe" });
    expect(await stock()).toEqual({ plain: 5, fence: 5, variant: 1 });
    expect(state.createPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it.each(WITHDRAW)(
    "a line whose product is %s: refused by name, removed, nothing written or charged",
    async (_how, withdraw) => {
      await state.prisma.cartItem.createMany({
        data: [
          { cartId: "cart-1", productId: "plain", quantity: 1 },
          { cartId: "cart-1", productId: "fence", variantId: "fence-2m", quantity: 1 },
        ],
      });
      await withdraw("fence");

      const result = await createOrder(shipping);

      expect(result).toMatchObject({
        ok: false,
        code: "PRODUCT_UNAVAILABLE",
        unavailableItems: ["Fence Panel"],
        cartEmpty: false,
      });
      const left = await state.prisma.cartItem.findMany({ select: { productId: true } });
      expect(left).toEqual([{ productId: "plain" }]);
      expect(await state.prisma.order.count()).toBe(0);
      expect(await stock()).toEqual({ plain: 5, fence: 5, variant: 3 });
      expect(state.createPaymentIntent).not.toHaveBeenCalled();
    },
  );

  it.each(RACES)(
    "%s after the cart was read, %s: the decrement refuses and the order rolls back before Stripe",
    async (_how, _label, line, productId, withdraw) => {
      await state.prisma.cartItem.create({ data: { cartId: "cart-1", quantity: 1, ...line } });
      state.beforeTransaction = () => withdraw(productId);

      const result = await createOrder(shipping);

      expect(result).toMatchObject({ ok: false, code: "OUT_OF_STOCK" });
      expect(await state.prisma.order.count()).toBe(0);
      expect(await stock()).toEqual({ plain: 5, fence: 5, variant: 3 });
      expect(state.createPaymentIntent).not.toHaveBeenCalled();
    },
  );
});

describe.skipIf(!sqlite)("ACP order creation's live-product guard on a real database", () => {
  async function session(lines: { productId: string; variantId: string | null; sku: string | null }[]) {
    await state.prisma.acpCheckoutSession.create({
      data: {
        id: "acp-1",
        status: "ready_for_payment",
        lineItemsJson: JSON.stringify(
          lines.map((l, i) => ({ id: `li-${i}`, slug: l.productId, name: l.productId, quantity: 1, unitPriceDkk: 1000, ...l })),
        ),
        buyerEmail: "agent@example.com",
        shippingName: "A",
        shippingAddress: "B 1",
        shippingZip: "1234",
        shippingCity: "C",
        totalDkk: 1000,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
  }
  const args = { sessionId: "acp-1", paymentIntentId: "pi_acp", paymentMethod: "acp_spt" };

  it("live products — with and without a variant — become a paid order; stock moves", async () => {
    await session([
      { productId: "plain", variantId: null, sku: null },
      { productId: "fence", variantId: "fence-2m", sku: "F-2M" },
    ]);

    const orderId = await createOrderFromAcpSession(args);

    expect(orderId).toBeTruthy();
    expect(await stock()).toEqual({ plain: 4, fence: 5, variant: 2 });
    expect((await state.prisma.acpCheckoutSession.findUniqueOrThrow({ where: { id: "acp-1" } })).status).toBe(
      "completed",
    );
  });

  it.each(
    WITHDRAW.flatMap(([how, withdraw]) =>
      (
        [
          ["without variants", { productId: "plain", variantId: null, sku: null }],
          ["through a variant", { productId: "fence", variantId: "fence-2m", sku: "F-2M" }],
        ] as const
      ).map(([label, line]) => [how, label, line, withdraw] as const),
    ),
  )("a product %s, %s, rolls the order back (complete.ts then refunds)", async (_how, _label, line, withdraw) => {
    await session([line]);
    await withdraw(line.productId);

    await expect(createOrderFromAcpSession(args)).rejects.toThrow(/^OUT_OF_STOCK:/);

    expect(await state.prisma.order.count()).toBe(0);
    expect(await stock()).toEqual({ plain: 5, fence: 5, variant: 3 });
    expect((await state.prisma.acpCheckoutSession.findUniqueOrThrow({ where: { id: "acp-1" } })).status).toBe(
      "ready_for_payment",
    );
  });
});
