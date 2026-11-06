import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `orders.set_tracking` — the tool an agent uses to write back a label it
 * booked outside the shop (a carrier, or Shipmondo's MCP). It writes through
 * `lib/orders/tracking.ts`, the same door as the admin tracking form, and can
 * send the shipping email: the only place a customer sees the tracking.
 *
 * Mocks: prisma, withAudit (runs the closure, captures `before`) and the
 * shipping-email sender. The mail's escaping is pinned against the real
 * renderer at the bottom.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    order: { findUnique: vi.fn(), update: vi.fn() },
    orderNote: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  withAudit: vi.fn(),
  sendShippingNotificationEmail: vi.fn(),
  audits: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/audit", () => ({ withAudit: mocks.withAudit }));
vi.mock("@/lib/mailer", () => ({
  sendShippingNotificationEmail: mocks.sendShippingNotificationEmail,
}));

const ctx = { actor: "apikey:k1", ip: "10.0.0.9", userAgent: "agent/1.0" } as never;

const ORDER = {
  id: "o1",
  status: "paid",
  email: "kunde@example.com",
  shippingName: "Kunde",
  items: [{ productName: "Hegn", quantity: 2 }],
};

beforeEach(() => {
  vi.resetModules();
  mocks.audits.length = 0;
  mocks.prisma.order.findUnique.mockReset().mockResolvedValue(ORDER);
  mocks.prisma.order.update.mockReset().mockResolvedValue({ id: "o1" });
  mocks.prisma.orderNote.create.mockReset().mockResolvedValue({ id: "n1" });
  mocks.prisma.$transaction
    .mockReset()
    .mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  mocks.sendShippingNotificationEmail.mockReset().mockResolvedValue(undefined);
  mocks.withAudit
    .mockReset()
    .mockImplementation(
      async (meta: Record<string, unknown> & { before?: () => unknown }, fn: () => unknown) => {
        mocks.audits.push(meta);
        if (meta.before) await meta.before();
        return fn();
      },
    );
});

async function tool() {
  const { setOrderTracking } = await import("@/lib/tools/orders");
  return setOrderTracking;
}

function notes(): string[] {
  return mocks.prisma.orderNote.create.mock.calls.map(
    (c) => (c[0] as { data: { body: string } }).data.body,
  );
}

describe("orders.set_tracking", () => {
  it("replaces the whole tracking, notes it, and sends no mail unless asked", async () => {
    const t = await tool();
    const r = await t.handler(
      { orderId: "o1", carrier: "PostNord", trackingNumber: "0037", estDeliveryTo: "2026-11-09" },
      ctx,
    );

    expect(r).toEqual({ id: "o1", carrier: "PostNord", trackingNumber: "0037", trackingUrl: null });
    // A field left out is cleared, as the admin form has always done.
    expect(mocks.prisma.order.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: {
        carrier: "PostNord",
        trackingNumber: "0037",
        trackingUrl: null,
        estDeliveryFrom: null,
        estDeliveryTo: new Date("2026-11-09"),
      },
    });
    expect(notes()).toEqual(["Tracking updated: PostNord 0037"]);
    expect(mocks.sendShippingNotificationEmail).not.toHaveBeenCalled();
    expect(mocks.audits.map((a) => a.tool)).toEqual(["orders.set_tracking"]);
    expect(mocks.audits[0]).toMatchObject({ actor: "apikey:k1", ip: "10.0.0.9" });
  });

  it("with notifyCustomer emails the NEW tracking and notes that it was sent", async () => {
    const t = await tool();
    const r = await t.handler(
      {
        orderId: "o1",
        carrier: "GLS",
        trackingNumber: "Z9",
        trackingUrl: "https://gls-group.com/track/Z9",
        notifyCustomer: true,
      },
      ctx,
    );

    expect(r).toMatchObject({ notified: true });
    expect(mocks.sendShippingNotificationEmail).toHaveBeenCalledWith({
      orderId: "o1",
      email: "kunde@example.com",
      shippingName: "Kunde",
      carrier: "GLS",
      trackingNumber: "Z9",
      trackingUrl: "https://gls-group.com/track/Z9",
      items: [{ productName: "Hegn", quantity: 2 }],
    });
    expect(notes()).toEqual(["Tracking updated: GLS Z9", "Shipping notification sent to the customer"]);
    expect(mocks.audits.map((a) => a.tool)).toEqual(["orders.set_tracking", "orders.notify_shipped"]);
  });

  it("keeps the tracking and says notified: false when the mail cannot be sent", async () => {
    mocks.sendShippingNotificationEmail.mockRejectedValue(new Error("smtp down"));
    const t = await tool();
    const r = await t.handler({ orderId: "o1", trackingNumber: "Z9", notifyCustomer: true }, ctx);

    expect(r).toMatchObject({ trackingNumber: "Z9", notified: false });
    expect(mocks.prisma.order.update).toHaveBeenCalledTimes(1);
    expect(notes()).toEqual(["Tracking updated: — Z9"]);
  });

  it("audits the tracking it replaces", async () => {
    const t = await tool();
    await t.handler({ orderId: "o1", trackingNumber: "Z9" }, ctx);
    const before = mocks.audits[0].before as () => unknown;
    expect(typeof before).toBe("function");
    mocks.prisma.order.findUnique.mockClear();
    await before();
    expect(mocks.prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: "o1" },
      select: { carrier: true, trackingNumber: true, trackingUrl: true, estDeliveryFrom: true, estDeliveryTo: true },
    });
  });

  it.each(["cancelled", "refunded", "pending_payment", "pending", "flagged_review"])(
    "refuses the shipping email for a %s order, before writing anything",
    async (status) => {
      mocks.prisma.order.findUnique.mockResolvedValue({ ...ORDER, status });
      const t = await tool();
      await expect(t.handler({ orderId: "o1", trackingNumber: "Z9", notifyCustomer: true }, ctx)).rejects.toThrow(
        new RegExp(`order is ${status}`),
      );
      expect(mocks.prisma.order.update).not.toHaveBeenCalled();
      expect(mocks.sendShippingNotificationEmail).not.toHaveBeenCalled();
      // Without the email, the tracking alone can still be saved.
      await t.handler({ orderId: "o1", trackingNumber: "Z9" }, ctx);
      expect(mocks.prisma.order.update).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["paid", "processing", "shipped", "delivered", "partial_refund"])(
    "sends the shipping email for a %s order",
    async (status) => {
      mocks.prisma.order.findUnique.mockResolvedValue({ ...ORDER, status });
      const t = await tool();
      expect(await t.handler({ orderId: "o1", trackingNumber: "Z9", notifyCustomer: true }, ctx)).toMatchObject({ notified: true });
    },
  );

  it.each([
    ["a missing order", null, /Order not found/],
    ["a quote", { ...ORDER, status: "quote" }, /quote, not an order yet/],
  ])("refuses %s before writing anything", async (_label, found, message) => {
    mocks.prisma.order.findUnique.mockResolvedValue(found);
    const t = await tool();
    await expect(
      t.handler({ orderId: "o1", trackingNumber: "Z9", notifyCustomer: true }, ctx),
    ).rejects.toThrow(message);
    expect(mocks.prisma.order.update).not.toHaveBeenCalled();
    expect(mocks.sendShippingNotificationEmail).not.toHaveBeenCalled();
  });

  it("accepts only an http(s) link, a real day, and trims the text", async () => {
    const t = await tool();
    const parse = (body: Record<string, unknown>) => t.input.safeParse({ orderId: "o1", ...body });

    expect(parse({ trackingUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(parse({ trackingUrl: "ftp://x.dk/1" }).success).toBe(false);
    expect(parse({ estDeliveryFrom: "next tuesday" }).success).toBe(false);
    expect(parse({ carrier: "x".repeat(65) }).success).toBe(false);
    expect(parse({ carrier: "   " }).success).toBe(false);
    expect(parse({ estDeliveryFrom: "2026-11-10", estDeliveryTo: "2026-11-09" }).success).toBe(false);
    expect(parse({ estDeliveryFrom: "2026-11-09", estDeliveryTo: "2026-11-09" }).success).toBe(true);
    const ok = parse({ carrier: "  PostNord ", trackingUrl: "https://tracking.postnord.com/?id=1" });
    expect(ok.success && ok.data).toMatchObject({ carrier: "PostNord" });
  });
});

describe("shipping email", () => {
  it("escapes the tracking, the name and the products, and drops a non-http link", async () => {
    const { renderShippingNotificationHtml } =
      await vi.importActual<typeof import("@/lib/mailer")>("@/lib/mailer");
    const html = renderShippingNotificationHtml({
      orderId: "o1",
      email: "kunde@example.com",
      shippingName: "<b>Kunde</b>",
      carrier: "GLS<img src=x>",
      trackingNumber: '"><script>x</script>',
      trackingUrl: "javascript:alert(1)",
      items: [{ productName: "Hegn & låge", quantity: 1 }],
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).not.toContain("<b>Kunde</b>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Hegn &amp; låge");

    const linked = renderShippingNotificationHtml({
      orderId: "o1",
      email: "kunde@example.com",
      shippingName: "Kunde",
      trackingNumber: "Z9",
      trackingUrl: "https://gls-group.com/track?id=Z9&lang=da",
      items: [],
    });
    expect(linked).toContain('href="https://gls-group.com/track?id=Z9&amp;lang=da"');
  });
});
