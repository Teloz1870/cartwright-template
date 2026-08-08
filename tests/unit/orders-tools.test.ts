import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Order-management tools (`lib/tools/orders.ts`) — the admin/agent surface that
 * moves orders through their money-adjacent lifecycle (refunds, cancellations,
 * disputes). `orders.update_status` wires the REAL operator state machine
 * (`lib/orders/status.ts` — assertTransition/isOrderStatus) into a guarded,
 * audited `prisma.order.update`. This suite pins:
 *   - legal transitions succeed and write the new status,
 *   - illegal / terminal-state transitions are REJECTED before any DB write,
 *   - a missing order throws before mutating,
 *   - the documented legacy-status escape hatch (unknown current status ⇒ guard
 *     skipped, move allowed),
 *   - the audit contract: even a REJECTED move captures the prior status via the
 *     `before` closure and threads actor/tool/args through withAudit,
 *   - `orders.list` builds the correct `where` filter + item-count summary,
 *   - `orders.get` returns the order or throws when absent.
 *
 * Mocks: `@/lib/db` (prisma) + `@/lib/audit` (withAudit). The pure state machine
 * `@/lib/orders/status` runs REAL so the transition assertions pin actual wiring,
 * not a re-implementation. No real DB.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  withAudit: vi.fn(),
  // capture the meta + resolved `before()` snapshot the tool hands to withAudit.
  captured: { meta: null as null | Record<string, unknown>, before: undefined as unknown },
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));

const ctx = {
  actor: "apikey:k1",
  ip: "10.0.0.9",
  userAgent: "agent/1.0",
} as never;

beforeEach(() => {
  vi.resetModules();
  mocks.prisma.order.findMany.mockReset();
  mocks.prisma.order.findUnique.mockReset();
  mocks.prisma.order.update.mockReset();
  mocks.captured.meta = null;
  mocks.captured.before = undefined;
  // Faithful withAudit stand-in: capture meta, resolve the before-snapshot
  // (the real withAudit does this on BOTH success and failure), then run fn —
  // rethrowing exactly as the real wrapper does.
  mocks.withAudit
    .mockReset()
    .mockImplementation(
      async (
        meta: Record<string, unknown> & { before?: () => Promise<unknown> | unknown },
        fn: () => Promise<unknown>,
      ) => {
        mocks.captured.meta = meta;
        if (meta.before) mocks.captured.before = await meta.before();
        return fn();
      },
    );
});

describe("orders.update_status — operator state machine", () => {
  it("legal transition (paid → shipped) writes the new status", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({ status: "paid" });
    mocks.prisma.order.update.mockResolvedValue({ id: "o1", status: "shipped" });
    const { updateOrderStatus } = await import("@/lib/tools/orders");

    const r = (await updateOrderStatus.handler({ orderId: "o1", status: "shipped" }, ctx)) as {
      id: string;
      status: string;
    };

    expect(r).toEqual({ id: "o1", status: "shipped" });
    // the status lookup is scoped + projected (never pulls the whole order into memory)
    expect(mocks.prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: "o1" },
      select: { status: true },
    });
    expect(mocks.prisma.order.update).toHaveBeenCalledTimes(1);
    const call = mocks.prisma.order.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "o1" });
    expect(call.data).toEqual({ status: "shipped" });
    expect(call.select).toEqual({ id: true, status: true });
  });

  it.each([
    ["shipped", "delivered"],
    ["disputed", "refunded"],
    ["pending_payment", "cancelled"],
    ["completed", "partial_refund"],
  ] as const)("legal transition (%s → %s) is allowed", async (from, to) => {
    mocks.prisma.order.findUnique.mockResolvedValue({ status: from });
    mocks.prisma.order.update.mockResolvedValue({ id: "o1", status: to });
    const { updateOrderStatus } = await import("@/lib/tools/orders");

    await expect(
      updateOrderStatus.handler({ orderId: "o1", status: to }, ctx),
    ).resolves.toEqual({ id: "o1", status: to });
    expect(mocks.prisma.order.update).toHaveBeenCalledTimes(1);
    // per-case payload pin: the requested target is what actually gets written
    // (not a mock echoing itself).
    expect(mocks.prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1" }, data: { status: to } }),
    );
  });

  it.each([
    ["paid", "delivered"], // delivered not reachable from paid
    ["pending_payment", "shipped"], // must go via paid/processing
    ["shipped", "pending"], // no backward move
  ] as const)(
    "illegal transition (%s → %s) throws and never touches the DB update",
    async (from, to) => {
      mocks.prisma.order.findUnique.mockResolvedValue({ status: from });
      const { updateOrderStatus } = await import("@/lib/tools/orders");

      await expect(
        updateOrderStatus.handler({ orderId: "o1", status: to }, ctx),
      ).rejects.toThrow(/Ulovlig ordre-transition/);
      expect(mocks.prisma.order.update).not.toHaveBeenCalled();
    },
  );

  it.each(["cancelled", "refunded", "partial_refund"] as const)(
    "terminal state (%s) rejects any onward move",
    async (terminal) => {
      mocks.prisma.order.findUnique.mockResolvedValue({ status: terminal });
      const { updateOrderStatus } = await import("@/lib/tools/orders");

      await expect(
        updateOrderStatus.handler({ orderId: "o1", status: "completed" }, ctx),
      ).rejects.toThrow(/Ulovlig ordre-transition/);
      expect(mocks.prisma.order.update).not.toHaveBeenCalled();
    },
  );

  it("throws when the order does not exist — before any update", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(null);
    const { updateOrderStatus } = await import("@/lib/tools/orders");

    await expect(
      updateOrderStatus.handler({ orderId: "ghost", status: "shipped" }, ctx),
    ).rejects.toThrow("Order not found: ghost");
    expect(mocks.prisma.order.update).not.toHaveBeenCalled();
  });

  it("legacy/unknown current status skips the guard and allows the move (documented escape hatch)", async () => {
    // "on_hold" is NOT a canonical OrderStatus ⇒ isOrderStatus(current) is false
    // ⇒ assertTransition is skipped ⇒ the move proceeds even though there is no
    // legal transition table entry for it.
    mocks.prisma.order.findUnique.mockResolvedValue({ status: "on_hold" });
    mocks.prisma.order.update.mockResolvedValue({ id: "o1", status: "cancelled" });
    const { updateOrderStatus } = await import("@/lib/tools/orders");

    await expect(
      updateOrderStatus.handler({ orderId: "o1", status: "cancelled" }, ctx),
    ).resolves.toEqual({ id: "o1", status: "cancelled" });
    expect(mocks.prisma.order.update).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1" }, data: { status: "cancelled" } }),
    );
  });

  it("threads actor/tool/args + ip/userAgent through withAudit", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({ status: "paid" });
    mocks.prisma.order.update.mockResolvedValue({ id: "o1", status: "processing" });
    const { updateOrderStatus } = await import("@/lib/tools/orders");

    await updateOrderStatus.handler({ orderId: "o1", status: "processing" }, ctx);

    const meta = mocks.captured.meta!;
    expect(meta.tool).toBe("orders.update_status");
    expect(meta.actor).toBe("apikey:k1");
    expect(meta.args).toEqual({ orderId: "o1", status: "processing" });
    expect(meta.ip).toBe("10.0.0.9");
    expect(meta.userAgent).toBe("agent/1.0");
  });

  it("captures the PRIOR status via the audit before-closure on a successful move", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({ status: "paid" });
    mocks.prisma.order.update.mockResolvedValue({ id: "o1", status: "shipped" });
    const { updateOrderStatus } = await import("@/lib/tools/orders");

    await updateOrderStatus.handler({ orderId: "o1", status: "shipped" }, ctx);

    // The before-closure snapshots the pre-mutation status for the audit row.
    expect(mocks.captured.before).toEqual({ status: "paid" });
  });

  it("still captures the prior status for audit even when the transition is REJECTED", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({ status: "paid" });
    const { updateOrderStatus } = await import("@/lib/tools/orders");

    await expect(
      updateOrderStatus.handler({ orderId: "o1", status: "delivered" }, ctx),
    ).rejects.toThrow(/Ulovlig ordre-transition/);
    // withAudit resolves before() regardless of the handler outcome ⇒ a rejected
    // move is still audited with the state it was rejected from.
    expect(mocks.captured.before).toEqual({ status: "paid" });
    expect(mocks.captured.meta!.tool).toBe("orders.update_status");
  });

  it("is a scoped, audited write tool", async () => {
    const { updateOrderStatus } = await import("@/lib/tools/orders");
    expect(updateOrderStatus.name).toBe("orders.update_status");
    expect(updateOrderStatus.scope).toBe("orders:write");
    expect(updateOrderStatus.skipAudit).toBeUndefined();
  });
});

describe("orders.list — filters + summary", () => {
  it("builds a where clause from status, email and a date range", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([]);
    const { listOrders } = await import("@/lib/tools/orders");

    await listOrders.handler(
      {
        status: "paid",
        email: "a@b.dk",
        fromDate: "2026-01-01T00:00:00.000Z",
        toDate: "2026-02-01T00:00:00.000Z",
        limit: 20,
      },
      ctx,
    );

    const arg = mocks.prisma.order.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe("paid");
    expect(arg.where.email).toBe("a@b.dk");
    expect(arg.where.createdAt.gte).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(arg.where.createdAt.lte).toEqual(new Date("2026-02-01T00:00:00.000Z"));
    expect(arg.take).toBe(20);
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
  });

  it("omits createdAt when no date bounds are given", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([]);
    const { listOrders } = await import("@/lib/tools/orders");

    await listOrders.handler({ status: "shipped", limit: 5 }, ctx);

    const where = mocks.prisma.order.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ status: "shipped" });
    expect(where).not.toHaveProperty("createdAt");
  });

  it("only sets the lower bound when just fromDate is present", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([]);
    const { listOrders } = await import("@/lib/tools/orders");

    await listOrders.handler({ fromDate: "2026-03-01T00:00:00.000Z", limit: 10 }, ctx);

    const createdAt = mocks.prisma.order.findMany.mock.calls[0][0].where.createdAt;
    expect(createdAt.gte).toEqual(new Date("2026-03-01T00:00:00.000Z"));
    expect(createdAt).not.toHaveProperty("lte");
  });

  it("summarises each order with a quantity-summed itemCount", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([
      {
        id: "o1",
        email: "a@b.dk",
        shippingName: "A B",
        status: "paid",
        subtotalDkk: 200,
        discountDkk: 0,
        shippingDkk: 39,
        totalDkk: 239,
        discountCode: null,
        createdAt: new Date("2026-01-05T00:00:00.000Z"),
        items: [
          { productName: "X", quantity: 2, unitPriceDkk: 50 },
          { productName: "Y", quantity: 3, unitPriceDkk: 30 },
        ],
      },
    ]);
    const { listOrders } = await import("@/lib/tools/orders");

    const rows = (await listOrders.handler({ limit: 20 }, ctx)) as Array<{
      id: string;
      itemCount: number;
      totalDkk: number;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("o1");
    expect(rows[0].itemCount).toBe(5);
    expect(rows[0].totalDkk).toBe(239);
    // the summary depends on the items relation actually being fetched — pin the
    // include so a regression that drops it (leaving items undefined → itemCount
    // NaN/throw) is caught here, not only at runtime.
    expect(mocks.prisma.order.findMany.mock.calls[0][0].include).toEqual({
      items: { select: { productName: true, quantity: true, unitPriceDkk: true } },
    });
  });

  it("is a read tool that does not audit", async () => {
    const { listOrders } = await import("@/lib/tools/orders");
    expect(listOrders.scope).toBe("orders:read");
    expect(listOrders.skipAudit).toBe(true);
    // read tools never wrap in withAudit
    mocks.prisma.order.findMany.mockResolvedValue([]);
    await listOrders.handler({ limit: 1 }, ctx);
    expect(mocks.withAudit).not.toHaveBeenCalled();
  });
});

describe("orders.get", () => {
  it("returns the order (with items) when found", async () => {
    const order = { id: "o1", email: "a@b.dk", items: [{ id: "i1" }] };
    mocks.prisma.order.findUnique.mockResolvedValue(order);
    const { getOrder } = await import("@/lib/tools/orders");

    const r = await getOrder.handler({ orderId: "o1" }, ctx);

    expect(r).toBe(order);
    expect(mocks.prisma.order.findUnique.mock.calls[0][0]).toEqual({
      where: { id: "o1" },
      include: { items: true },
    });
  });

  it("throws when the order is absent", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(null);
    const { getOrder } = await import("@/lib/tools/orders");

    await expect(getOrder.handler({ orderId: "ghost" }, ctx)).rejects.toThrow(
      "Order not found: ghost",
    );
  });
});
