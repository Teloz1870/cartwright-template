/**
 * DRØM103-a — an order cancelled before it was paid gives back the one
 * discount-code use its checkout counted.
 *
 * Measured on origin/main 4b576733: createOrder (lib/orders/create.ts:270) and
 * createAcpOrder increment `DiscountCode.usageCount` inside the checkout
 * transaction, but cancelUnpaidOrder only returned stock. Every abandoned or
 * cancelled Stripe checkout therefore burned a use of a limited code for good,
 * and a "10 uses" campaign code could run out without ten sales.
 *
 * The give-back rides on the same conditional status write as the restock, so
 * it happens exactly once and never for a paid or already-cancelled order.
 */
import { describe, expect, it } from "vitest";
import { cancelUnpaidOrder } from "@/lib/orders/cancel-unpaid";

type Order = { id: string; status: string; discountCode: string | null };
type Code = { code: string; usageCount: number };

function makeTx(orders: Order[], codes: Code[]) {
  const stock: Record<string, number> = { p1: 0 };
  const tx = {
    order: {
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: { status: string } }) => {
        const o = orders.find((x) => x.id === where.id && x.status === where.status);
        if (!o) return { count: 0 };
        o.status = data.status;
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const o = orders.find((x) => x.id === where.id);
        return o ? { discountCode: o.discountCode } : null;
      },
    },
    orderItem: {
      findMany: async () => [{ productId: "p1", variantId: null, quantity: 2 }],
    },
    product: {
      update: async ({ where, data }: { where: { id: string }; data: { stock: { increment: number } } }) => {
        stock[where.id] += data.stock.increment;
      },
    },
    productVariant: { update: async () => ({}) },
    discountCode: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { code: string; usageCount: { gt: number } };
        data: { usageCount: { decrement: number } };
      }) => {
        const c = codes.find((x) => x.code === where.code && x.usageCount > where.usageCount.gt);
        if (!c) return { count: 0 };
        c.usageCount -= data.usageCount.decrement;
        return { count: 1 };
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { tx: tx as any, stock };
}

describe("cancelUnpaidOrder gives one discount use back", () => {
  it("returns one use when it cancels an unpaid order that carried a code", async () => {
    const orders = [{ id: "o1", status: "pending_payment", discountCode: "SUMMER10" }];
    const codes = [{ code: "SUMMER10", usageCount: 3 }];
    const { tx, stock } = makeTx(orders, codes);

    expect(await cancelUnpaidOrder(tx, "o1")).toBe(true);
    expect(codes[0].usageCount).toBe(2);
    expect(stock.p1).toBe(2);
  });

  it("returns it once: a second cancel path finds the order cancelled and writes nothing", async () => {
    const orders = [{ id: "o1", status: "pending_payment", discountCode: "SUMMER10" }];
    const codes = [{ code: "SUMMER10", usageCount: 3 }];
    const { tx } = makeTx(orders, codes);

    await cancelUnpaidOrder(tx, "o1");
    expect(await cancelUnpaidOrder(tx, "o1")).toBe(false);
    expect(codes[0].usageCount).toBe(2);
  });

  it("never touches the code of a paid order", async () => {
    const orders = [{ id: "o1", status: "paid", discountCode: "SUMMER10" }];
    const codes = [{ code: "SUMMER10", usageCount: 3 }];
    const { tx } = makeTx(orders, codes);

    expect(await cancelUnpaidOrder(tx, "o1")).toBe(false);
    expect(codes[0].usageCount).toBe(3);
  });

  it("never goes below 0", async () => {
    const orders = [{ id: "o1", status: "pending_payment", discountCode: "SUMMER10" }];
    const codes = [{ code: "SUMMER10", usageCount: 0 }];
    const { tx } = makeTx(orders, codes);

    expect(await cancelUnpaidOrder(tx, "o1")).toBe(true);
    expect(codes[0].usageCount).toBe(0);
  });

  it("leaves other codes alone and skips an order without a code or a deleted code", async () => {
    const orders = [
      { id: "o1", status: "pending_payment", discountCode: null },
      { id: "o2", status: "pending_payment", discountCode: "" },
      { id: "o3", status: "pending_payment", discountCode: "GONE" },
    ];
    const codes = [{ code: "SUMMER10", usageCount: 3 }];
    const { tx } = makeTx(orders, codes);

    for (const id of ["o1", "o2", "o3"]) expect(await cancelUnpaidOrder(tx, id)).toBe(true);
    expect(codes[0].usageCount).toBe(3);
  });
});
