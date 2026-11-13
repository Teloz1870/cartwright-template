import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sending a paid order to Shipmondo (plugins/shipmondo/lib/send-order.ts):
 * once per order, kept on the timeline AND checked in Shipmondo, so an order
 * is never there twice. prisma + withAudit are mocked; the real client runs
 * against a stubbed fetch, so the HTTP calls asserted are the ones sent.
 */
const mocks = vi.hoisted(() => ({
  prisma: {
    order: { findUnique: vi.fn(), findMany: vi.fn() },
    orderNote: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() },
  },
  audits: [] as { tool: string }[],
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({
  withAudit: async (meta: { tool: string }, fn: () => unknown) => {
    mocks.audits.push(meta);
    return fn();
  },
}));

const CONFIG = {
  apiUser: "u",
  apiKey: "k",
  baseUrl: "https://sandbox.shipmondo.com/api/public/v3",
  webhookKey: null,
};

const ORDER = {
  id: "ord_1",
  status: "paid",
  orderNumber: 1042,
  createdAt: new Date("2026-11-05T09:00:00Z"),
  paidAt: new Date("2026-11-05T09:01:00Z"),
  email: "kunde@example.com",
  phoneNumber: null,
  shippingName: "Kunde",
  shippingAddress: "Holmvej 15",
  shippingZip: "6780",
  shippingCity: "Skærbæk",
  billingName: null,
  billingAddress: null,
  billingZip: null,
  billingCity: null,
  billingCountry: null,
  shippingDkk: 0,
  discountDkk: 0,
  discountCode: null,
  totalDkk: 12500,
  vatOere: null,
  paymentMethod: "stripe_card",
  paymentRef: null,
  items: [{ productName: "Kaffe", sku: "K1", variantSku: null, quantity: 1, unitPriceDkk: 12500 }],
};

/** A fetch that answers GET /sales_orders with `found` and POST /sales_orders with `created`. */
function shipmondo(found: unknown[], created: unknown = { id: 501 }, postStatus = 201) {
  return vi.fn(async (url: URL, init?: RequestInit) => {
    if (init?.method === "GET") return new Response(JSON.stringify(found), { status: 200 });
    return new Response(JSON.stringify(created), { status: postStatus });
  });
}

function calls(fetchImpl: ReturnType<typeof shipmondo>) {
  return fetchImpl.mock.calls.map(([url, init]) => `${init?.method} ${new URL(String(url)).pathname}${new URL(String(url)).search}`);
}

/** What the order's timeline was told: the claim, then the "sent" note it turned into. */
function noteBodies(): string[] {
  return [
    ...mocks.prisma.orderNote.create.mock.calls.map((c) => (c[0] as { data: { body: string } }).data.body),
    ...mocks.prisma.orderNote.update.mock.calls.map((c) => (c[0] as { data: { body: string } }).data.body),
  ];
}

function uniqueViolation() {
  return Object.assign(new Error("Unique constraint failed on the fields: (`id`)"), { code: "P2002" });
}

beforeEach(() => {
  vi.resetModules();
  mocks.audits.length = 0;
  mocks.prisma.order.findUnique.mockReset().mockResolvedValue(ORDER);
  mocks.prisma.order.findMany.mockReset();
  mocks.prisma.orderNote.findFirst.mockReset().mockResolvedValue(null);
  mocks.prisma.orderNote.create.mockReset().mockResolvedValue({ id: "n1" });
  mocks.prisma.orderNote.update.mockReset().mockResolvedValue({ id: "n1" });
  mocks.prisma.orderNote.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  mocks.prisma.orderNote.upsert.mockReset().mockResolvedValue({ id: "f1" });
});

async function load() {
  return import("@/plugins/shipmondo/lib/send-order");
}

describe("sendOrderToShipmondo", () => {
  it("asks Shipmondo first, then creates the sales order and notes it", async () => {
    const { sendOrderToShipmondo } = await load();
    const fetchImpl = shipmondo([]);
    const r = await sendOrderToShipmondo("ord_1", "user:a1", { config: CONFIG, fetchImpl: fetchImpl as never });

    expect(r).toEqual({ outcome: "sent", salesOrderId: 501 });
    expect(calls(fetchImpl)).toEqual([
      "GET /api/public/v3/sales_orders?order_id=1042&per_page=25&page=1",
      "GET /api/public/v3/sales_orders?order_id=1042&per_page=25&page=1&archived=true",
      "POST /api/public/v3/sales_orders",
    ]);
    const post = fetchImpl.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ order_id: "1042", tags: ["cartwright:ord_1"] });
    // The claim (fixed id per order) is what becomes the "sent" note.
    expect(mocks.prisma.orderNote.create.mock.calls[0][0].data).toMatchObject({ id: "shipmondo-send-ord_1" });
    expect(mocks.prisma.orderNote.update.mock.calls[0][0].where).toEqual({ id: "shipmondo-send-ord_1" });
    expect(noteBodies()).toEqual(["Sending to Shipmondo…", "Sent to Shipmondo as sales order 501"]);
    expect(JSON.parse(mocks.prisma.orderNote.update.mock.calls[0][0].data.metaJson)).toEqual({
      shipmondo: { salesOrderId: 501, orderRef: "1042" },
    });
    expect(mocks.audits.map((a) => a.tool)).toEqual(["shipmondo.send_order"]);
  });

  it("does nothing for an order the timeline already says was sent", async () => {
    mocks.prisma.orderNote.findFirst.mockResolvedValue({ metaJson: '{"shipmondo":{"salesOrderId":7}}' });
    const { sendOrderToShipmondo } = await load();
    const fetchImpl = shipmondo([]);
    const r = await sendOrderToShipmondo("ord_1", "user:a1", { config: CONFIG, fetchImpl: fetchImpl as never });

    expect(r).toEqual({ outcome: "already_sent", salesOrderId: 7 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(noteBodies()).toEqual([]);
  });

  it("adopts a sales order Shipmondo already has for this order, and never creates a second", async () => {
    const { sendOrderToShipmondo } = await load();
    const fetchImpl = shipmondo([
      { id: 87, order_id: "1042", tags: ["cartwright:someone-elses-order"] },
      { id: 88, order_id: "1042", tags: ["vip", "cartwright:ord_1"] },
    ]);
    const r = await sendOrderToShipmondo("ord_1", "system:shipmondo-cron", { config: CONFIG, fetchImpl: fetchImpl as never });

    expect(r).toEqual({ outcome: "already_sent", salesOrderId: 88 });
    expect(calls(fetchImpl)).toEqual(["GET /api/public/v3/sales_orders?order_id=1042&per_page=25&page=1"]);
    expect(noteBodies()).toEqual(["Sending to Shipmondo…", "Sent to Shipmondo as sales order 88 (it was already there)"]);
  });

  it("does not adopt another webshop's #1042 in a shared account, even for the same customer: it sends this order", async () => {
    const { sendOrderToShipmondo } = await load();
    const fetchImpl = shipmondo([
      { id: 87, order_id: "1042", ship_to: { zipcode: "6780", email: "kunde@example.com" }, tags: [] },
    ]);
    const r = await sendOrderToShipmondo("ord_1", "user:a1", { config: CONFIG, fetchImpl: fetchImpl as never });

    expect(r).toEqual({ outcome: "sent", salesOrderId: 501 });
    expect(calls(fetchImpl)).toEqual([
      "GET /api/public/v3/sales_orders?order_id=1042&per_page=25&page=1",
      "GET /api/public/v3/sales_orders?order_id=1042&per_page=25&page=1&archived=true",
      "POST /api/public/v3/sales_orders",
    ]);
    expect(noteBodies()).toEqual(["Sending to Shipmondo…", "Sent to Shipmondo as sales order 501"]);
  });

  it("finds its own sales order on a later page, or among the archived ones, and creates none", async () => {
    const { sendOrderToShipmondo } = await load();
    const foreign = Array.from({ length: 25 }, (_, i) => ({ id: 1000 + i, order_id: "1042", tags: [] }));
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      const q = new URL(String(url)).searchParams;
      if (init?.method === "POST") return new Response('{"id":1}', { status: 201 });
      if (q.get("archived") === "true") return new Response(JSON.stringify([{ id: 99, tags: ["cartwright:ord_1"] }]), { status: 200 });
      return new Response(JSON.stringify(q.get("page") === "1" ? foreign : []), { status: 200 });
    });
    const r = await sendOrderToShipmondo("ord_1", "user:a1", { config: CONFIG, fetchImpl: fetchImpl as never });

    expect(r).toEqual({ outcome: "already_sent", salesOrderId: 99 });
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("reads past a full first page to find its own sales order", async () => {
    const { sendOrderToShipmondo } = await load();
    const foreign = Array.from({ length: 25 }, (_, i) => ({ id: 1000 + i, order_id: "1042", tags: [] }));
    const fetchImpl = vi.fn(async (url: URL) => {
      const q = new URL(String(url)).searchParams;
      return new Response(JSON.stringify(q.get("page") === "1" ? foreign : [{ id: 77, tags: ["cartwright:ord_1"] }]), { status: 200 });
    });
    const r = await sendOrderToShipmondo("ord_1", "user:a1", { config: CONFIG, fetchImpl: fetchImpl as never });

    expect(r).toEqual({ outcome: "already_sent", salesOrderId: 77 });
    expect(fetchImpl.mock.calls.map(([u]) => new URL(String(u)).searchParams.get("page"))).toEqual(["1", "2"]);
  });

  it("only this order's own tag is proof that a found sales order is this order", async () => {
    const { isSameOrder } = await load();
    expect(isSameOrder({ tags: ["cartwright:ord_1"] }, "ord_1")).toBe(true);
    expect(isSameOrder({ tags: ["cartwright:ord_10"] }, "ord_1")).toBe(false);
    expect(isSameOrder({ tags: null }, "ord_1")).toBe(false);
    expect(isSameOrder({}, "ord_1")).toBe(false);
  });

  it("sends an order an operator marked paid, which has no paidAt", async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({ ...ORDER, paidAt: null });
    const { sendOrderToShipmondo } = await load();
    const r = await sendOrderToShipmondo("ord_1", "user:a1", { config: CONFIG, fetchImpl: shipmondo([]) as never });
    expect(r).toEqual({ outcome: "sent", salesOrderId: 501 });
  });

  it.each([
    ["a missing order", null, /not found/],
    ["a shipped order", { ...ORDER, status: "shipped" }, /shipped/],
    ["an order awaiting payment", { ...ORDER, status: "pending_payment", paidAt: null }, /pending_payment/],
    ["a cancelled order", { ...ORDER, status: "cancelled" }, /cancelled/],
  ])("leaves %s alone", async (_label, found, reason) => {
    mocks.prisma.order.findUnique.mockResolvedValue(found);
    const { sendOrderToShipmondo } = await load();
    const fetchImpl = shipmondo([]);
    const r = await sendOrderToShipmondo("ord_1", "user:a1", { config: CONFIG, fetchImpl: fetchImpl as never });

    expect(r.outcome).toBe("not_shippable");
    expect(r.outcome === "not_shippable" && r.reason).toMatch(reason);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("on Shipmondo's refusal frees the claim and keeps one failure line, rewritten each time", async () => {
    const { sendOrderToShipmondo } = await load();
    const now = new Date("2026-11-05T12:00:00Z");
    const fetchImpl = shipmondo([], { error: "ship_to.zipcode is invalid" }, 422);
    const r = await sendOrderToShipmondo("ord_1", "user:a1", { config: CONFIG, fetchImpl: fetchImpl as never, now });

    expect(r).toEqual({ outcome: "failed", error: expect.stringContaining("Shipmondo answered 422") });
    expect(mocks.prisma.orderNote.update).not.toHaveBeenCalled();
    expect(mocks.prisma.orderNote.deleteMany).toHaveBeenCalledWith({
      where: { id: "shipmondo-send-ord_1", body: { startsWith: "Sending to Shipmondo" } },
    });
    const failure = mocks.prisma.orderNote.upsert.mock.calls[0][0];
    expect(failure.where).toEqual({ id: "shipmondo-failed-ord_1" });
    expect(failure.update).toMatchObject({ createdAt: now, body: expect.stringContaining("Could not send to Shipmondo: Shipmondo answered 422") });
  });

  it("an order another live run is sending is left to it: nothing is asked or created", async () => {
    mocks.prisma.orderNote.create.mockRejectedValue(uniqueViolation());
    const { sendOrderToShipmondo } = await load();
    const fetchImpl = shipmondo([]);
    const r = await sendOrderToShipmondo("ord_1", "system:shipmondo-cron", { config: CONFIG, fetchImpl: fetchImpl as never });

    expect(r).toEqual({ outcome: "in_progress" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("clears a claim a dead run left behind (older than 10 minutes), then sends", async () => {
    const now = new Date("2026-11-05T12:00:00Z");
    mocks.prisma.orderNote.create.mockRejectedValueOnce(uniqueViolation()).mockResolvedValue({ id: "n2" });
    mocks.prisma.orderNote.deleteMany.mockResolvedValueOnce({ count: 1 });
    const { sendOrderToShipmondo } = await load();
    const fetchImpl = shipmondo([]);
    const r = await sendOrderToShipmondo("ord_1", "system:shipmondo-cron", { config: CONFIG, fetchImpl: fetchImpl as never, now });

    expect(r).toEqual({ outcome: "sent", salesOrderId: 501 });
    expect(mocks.prisma.orderNote.deleteMany.mock.calls[0][0]).toEqual({
      where: {
        id: "shipmondo-send-ord_1",
        body: { startsWith: "Sending to Shipmondo" },
        createdAt: { lt: new Date("2026-11-05T11:50:00Z") },
      },
    });
  });
});

describe("sendUnsentOrders", () => {
  it("looks back 14 days for paid orders with no 'sent' note and no failure in 6 hours, and counts how each went", async () => {
    const now = new Date("2026-11-05T12:00:00Z");
    mocks.prisma.order.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    mocks.prisma.orderNote.findFirst.mockImplementation(async ({ where }: { where: { orderId: string } }) =>
      where.orderId === "b" ? { metaJson: null } : null,
    );
    mocks.prisma.order.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      ...ORDER,
      id: where.id,
      orderNumber: where.id === "c" ? 9 : 8,
    }));
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      if (init?.method === "GET") return new Response("[]", { status: 200 });
      const ref = JSON.parse(String(init?.body)).order_id;
      return ref === "9"
        ? new Response('{"error":"down"}', { status: 503 })
        : new Response('{"id":1}', { status: 201 });
    });
    const { sendUnsentOrders } = await load();
    const summary = await sendUnsentOrders("system:shipmondo-cron", { config: CONFIG, fetchImpl: fetchImpl as never, now });

    expect(mocks.prisma.order.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["paid", "processing"] },
        OR: [
          { paidAt: { gte: new Date("2026-10-22T12:00:00Z") } },
          // An operator's "→ paid" move is the payment of an order without paidAt.
          {
            paidAt: null,
            notes: { some: { type: "system", metaJson: { contains: '"to":"paid"' }, createdAt: { gte: new Date("2026-10-22T12:00:00Z") } } },
          },
        ],
        notes: {
          none: {
            type: "system",
            OR: [
              { body: { startsWith: "Sent to Shipmondo" } },
              { body: { startsWith: "Sending to Shipmondo" }, createdAt: { gte: new Date("2026-11-05T11:50:00Z") } },
              { body: { startsWith: "Could not send to Shipmondo" }, createdAt: { gte: new Date("2026-11-05T06:00:00Z") } },
            ],
          },
        },
      },
      orderBy: { paidAt: "asc" },
      take: 50,
      select: { id: true },
    });
    expect(summary).toEqual({
      checked: 3,
      sent: 1,
      alreadySent: 1,
      failed: [{ orderId: "c", error: expect.stringContaining("503") }],
    });
  });

  it("an operator's Send all retries orders the sweep is pausing after a failure", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([]);
    const { unsentOrderIds } = await load();
    await unsentOrderIds(50, new Date("2026-11-05T12:00:00Z"), { retryRecentFailures: true });
    expect(mocks.prisma.order.findMany.mock.calls[0][0].where.notes).toEqual({
      none: {
        type: "system",
        OR: [
          { body: { startsWith: "Sent to Shipmondo" } },
          { body: { startsWith: "Sending to Shipmondo" }, createdAt: { gte: new Date("2026-11-05T11:50:00Z") } },
        ],
      },
    });
  });

  it("bounds every request by the budget: an order it cuts off is deferred, not failed", async () => {
    mocks.prisma.order.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    let t = 1_000_000;
    const now = vi.spyOn(Date, "now").mockImplementation(() => t);
    const fetchImpl = vi.fn(async (_url: URL, init?: RequestInit) => {
      t += 12_000; // every request takes 12 s
      return init?.method === "GET" ? new Response("[]", { status: 200 }) : new Response('{"id":1}', { status: 201 });
    });
    const { sendUnsentOrders } = await load();
    const summary = await sendUnsentOrders("system:shipmondo-cron", { config: CONFIG, fetchImpl: fetchImpl as never, budgetMs: 45_000 });
    now.mockRestore();

    // Order a: 3 requests (36 s). Order b: its first lookup would start with 9 s
    // left, the second with under a second — so b is deferred, and c never starts.
    expect(summary).toMatchObject({ checked: 1, sent: 1, stoppedEarly: true, failed: [] });
    expect(mocks.prisma.orderNote.upsert).not.toHaveBeenCalled(); // no failure line, so no 6-hour pause
    expect(mocks.prisma.orderNote.deleteMany).toHaveBeenCalledWith({
      where: { id: "shipmondo-send-b", body: { startsWith: "Sending to Shipmondo" } },
    });
  });
});
