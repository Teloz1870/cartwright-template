import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShipmondoShipmentEvent } from "@/plugins/shipmondo/lib/webhook";

/**
 * A verified Shipmondo shipment applied to its order (plugins/shipmondo/lib/apply-shipment.ts).
 * The doors it goes through are mocked and asserted: lib/orders/tracking.ts for
 * the tracking and the email, lib/orders/operator-status.ts for the status. The
 * Shipmondo client runs for real against a stubbed fetch answering the sales
 * order this shop created.
 */
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  noteFindUnique: vi.fn(),
  noteFindMany: vi.fn(),
  noteCreate: vi.fn(),
  writeTracking: vi.fn(),
  notifyShipped: vi.fn(),
  writeOperatorStatus: vi.fn(),
  fulfillments: [] as { shipment_id: number; type?: string; cancelled?: boolean }[],
}));
const TX = { orderNote: { create: (...a: unknown[]) => mocks.noteCreate(...a) } };

vi.mock("@/lib/db", () => ({
  prisma: {
    order: { findUnique: mocks.findUnique },
    orderNote: { findUnique: mocks.noteFindUnique, findMany: mocks.noteFindMany, create: mocks.noteCreate },
    $transaction: (fn: (tx: unknown) => unknown) => fn(TX),
  },
}));
vi.mock("@/lib/audit", () => ({ withAudit: (_meta: unknown, fn: () => unknown) => fn() }));
vi.mock("@/lib/orders/tracking", () => ({ writeTracking: mocks.writeTracking, notifyShipped: mocks.notifyShipped }));
vi.mock("@/lib/orders/operator-status", () => ({ writeOperatorStatus: mocks.writeOperatorStatus }));

const CONFIG = { apiUser: "u", apiKey: "k", baseUrl: "https://sandbox.shipmondo.com/api/public/v3", webhookKey: "wk" };
const fetchImpl = vi.fn(async (url: URL) => {
  expect(new URL(String(url)).pathname).toBe("/api/public/v3/sales_orders/501");
  return new Response(JSON.stringify({ id: 501, order_fulfillments: mocks.fulfillments }), { status: 200 });
});

const EST = new Date("2026-11-09T00:00:00Z");
const ORDER = {
  id: "ord_1",
  status: "paid",
  email: "kunde@example.com",
  shippingName: "Kunde",
  estDeliveryFrom: null,
  estDeliveryTo: EST,
  items: [{ productName: "Hegn", quantity: 2 }],
  notes: [{ body: "Sent to Shipmondo as sales order 501", metaJson: '{"shipmondo":{"salesOrderId":501,"orderRef":"1042"}}' }],
};
const EVENT: ShipmondoShipmentEvent = {
  shipmentId: 77,
  orderRef: "1042",
  carrierCode: "gls",
  carrier: "GLS",
  trackingNumber: "Z9",
};

beforeEach(() => {
  vi.resetModules();
  mocks.findUnique.mockReset().mockResolvedValue(ORDER);
  mocks.noteFindUnique.mockReset().mockResolvedValue(null);
  mocks.noteFindMany.mockReset().mockResolvedValue([]);
  mocks.noteCreate.mockReset().mockResolvedValue({ id: "n" });
  mocks.writeTracking.mockReset().mockResolvedValue(undefined);
  mocks.notifyShipped.mockReset().mockResolvedValue(true);
  mocks.writeOperatorStatus.mockReset().mockResolvedValue({ restocked: false });
  mocks.fulfillments = [{ shipment_id: 77, type: "outbound" }];
  fetchImpl.mockClear();
});

async function apply(event = EVENT) {
  const { applyShipment } = await import("@/plugins/shipmondo/lib/apply-shipment");
  return applyShipment(event, { config: CONFIG, fetchImpl: fetchImpl as never });
}

const noteBodies = () => mocks.noteCreate.mock.calls.map((c) => (c[0] as { data: { body: string } }).data.body);

describe("applyShipment", () => {
  it("saves the tracking, notes the shipment, moves a paid order to shipped and mails the new tracking", async () => {
    expect(await apply()).toEqual({ outcome: "shipped", orderId: "ord_1" });
    expect(mocks.findUnique.mock.calls[0][0].where).toEqual({ orderNumber: 1042 });
    // The order's expected delivery days are kept; the tracking itself is replaced.
    // The marker (fixed id per shipment) and the tracking commit in one transaction.
    expect(mocks.writeTracking).toHaveBeenCalledExactlyOnceWith(
      "ord_1",
      "system:shipmondo-webhook",
      { carrier: "GLS", trackingNumber: "Z9", trackingUrl: null, estDeliveryFrom: null, estDeliveryTo: EST },
      TX,
    );
    expect(mocks.noteCreate.mock.calls[0][0].data).toMatchObject({ id: "shipmondo-shipment-77" });
    expect(noteBodies()).toEqual(["Shipmondo shipment 77 applied: GLS Z9"]);
    expect(mocks.writeOperatorStatus).toHaveBeenCalledExactlyOnceWith(TX, {
      orderId: "ord_1",
      from: "paid",
      to: "shipped",
      actor: "system:shipmondo-webhook",
      source: "shipmondo.webhook",
    });
    expect(mocks.notifyShipped).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "ord_1", carrier: "GLS", trackingNumber: "Z9", trackingUrl: null }),
      "system:shipmondo-webhook",
    );
  });

  it("finds an order by its id when the number finds none (an order sent without a number)", async () => {
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(ORDER);
    expect((await apply({ ...EVENT, orderRef: "20240117" })).outcome).toBe("shipped");
    expect(mocks.findUnique.mock.calls.map((c) => c[0].where)).toEqual([{ orderNumber: 20240117 }, { id: "20240117" }]);
    mocks.findUnique.mockClear();
    await apply({ ...EVENT, orderRef: "cmabc123" });
    expect(mocks.findUnique.mock.calls.map((c) => c[0].where)).toEqual([{ id: "cmabc123" }]);
    // Another webshop's order_id past the Int column's range is only ever looked up as an id.
    mocks.findUnique.mockClear();
    mocks.findUnique.mockResolvedValue(null);
    expect((await apply({ ...EVENT, orderRef: "123456789012" })).outcome).toBe("unknown_order");
    expect(mocks.findUnique.mock.calls.map((c) => c[0].where)).toEqual([{ id: "123456789012" }]);
  });

  it.each([
    ["an order it cannot find", () => mocks.findUnique.mockResolvedValue(null), "unknown_order"],
    ["an order this shop never sent to Shipmondo", () => mocks.findUnique.mockResolvedValue({ ...ORDER, notes: [] }), "not_ours"],
    ["a 'sent' note without a sales order id", () => mocks.findUnique.mockResolvedValue({ ...ORDER, notes: [{ body: "Sent to Shipmondo", metaJson: null }] }), "not_ours"],
    ["an order this shop is sending right now (claimed, not recorded)", () => mocks.findUnique.mockResolvedValue({ ...ORDER, notes: [{ body: "Sending to Shipmondo…", metaJson: null }] }), "awaiting_send"],
    ["a shipment our sales order does not list (another webshop's #1042)", () => (mocks.fulfillments = [{ shipment_id: 12, type: "outbound" }]), "not_ours"],
    ["a shipment whose fulfilment was cancelled", () => (mocks.fulfillments = [{ shipment_id: 77, type: "outbound", cancelled: true }]), "not_ours"],
    ["a return label on our sales order", () => (mocks.fulfillments = [{ shipment_id: 77, type: "return" }]), "not_ours"],
    ["a replay once the order has shipped", () => {
      mocks.findUnique.mockResolvedValue({ ...ORDER, status: "shipped" });
      mocks.noteFindUnique.mockResolvedValue({ id: "shipmondo-shipment-77" });
    }, "unchanged"],
    ["a cancelled order", () => mocks.findUnique.mockResolvedValue({ ...ORDER, status: "cancelled" }), "not_shippable"],
    ["a quote", () => mocks.findUnique.mockResolvedValue({ ...ORDER, status: "quote" }), "not_shippable"],
  ])("writes and mails nothing for %s", async (_label, arrange, outcome) => {
    arrange();
    expect((await apply()).outcome).toBe(outcome);
    expect(mocks.writeTracking).not.toHaveBeenCalled();
    expect(mocks.writeOperatorStatus).not.toHaveBeenCalled();
    expect(mocks.notifyShipped).not.toHaveBeenCalled();
  });

  it("does not ask Shipmondo about a shipment without an id: it cannot be proven ours", async () => {
    expect((await apply({ ...EVENT, shipmentId: null })).outcome).toBe("not_ours");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a late replay of an older parcel never overwrites the newer tracking", async () => {
    mocks.findUnique.mockResolvedValue({ ...ORDER, status: "shipped" });
    mocks.noteFindUnique.mockResolvedValue({ id: "shipmondo-shipment-77" });
    expect((await apply()).outcome).toBe("unchanged");
    expect(mocks.noteFindUnique.mock.calls[0][0].where).toEqual({ id: "shipmondo-shipment-77" });
    expect(mocks.writeTracking).not.toHaveBeenCalled();
  });

  it("a retry after a failed status move resumes it: moves and mails, without writing the tracking again", async () => {
    mocks.noteFindUnique.mockResolvedValue({ id: "shipmondo-shipment-77" });
    expect((await apply()).outcome).toBe("shipped");
    expect(mocks.writeTracking).not.toHaveBeenCalled();
    expect(noteBodies()).toEqual([]);
    expect(mocks.writeOperatorStatus).toHaveBeenCalledTimes(1);
    expect(mocks.notifyShipped).toHaveBeenCalledTimes(1);
  });

  it("a second delivery of the same shipment, running at the same time, applies nothing twice", async () => {
    const dup = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    mocks.noteCreate.mockRejectedValueOnce(dup);
    mocks.findUnique.mockResolvedValue({ ...ORDER, status: "shipped" });
    expect((await apply()).outcome).toBe("unchanged");
    expect(mocks.notifyShipped).not.toHaveBeenCalled();
  });

  it("an older parcel fetched late never replaces the newer tracking the order shows; it is only recorded", async () => {
    mocks.findUnique.mockResolvedValue({ ...ORDER, status: "shipped" });
    mocks.noteFindMany.mockResolvedValue([{ id: "shipmondo-shipment-99" }]);
    expect((await apply()).outcome).toBe("unchanged");
    expect(mocks.writeTracking).not.toHaveBeenCalled();
    expect(mocks.noteCreate.mock.calls[0][0].data).toMatchObject({
      id: "shipmondo-shipment-77",
      body: "Shipmondo shipment 77 applied (older than the tracking shown): GLS Z9",
    });
  });

  it("a second parcel on a shipped order updates the tracking without moving it or mailing again", async () => {
    mocks.findUnique.mockResolvedValue({ ...ORDER, status: "shipped" });
    expect((await apply()).outcome).toBe("tracking_updated");
    expect(mocks.writeTracking).toHaveBeenCalledTimes(1);
    expect(mocks.writeOperatorStatus).not.toHaveBeenCalled();
    expect(mocks.notifyShipped).not.toHaveBeenCalled();
  });

  it("an order moved since it was read keeps the tracking and gets no email", async () => {
    const { OrderChangedError } = await import("@/lib/orders/lifecycle");
    mocks.writeOperatorStatus.mockRejectedValue(new OrderChangedError("ord_1", "paid"));
    expect((await apply()).outcome).toBe("tracking_updated");
    expect(mocks.writeTracking).toHaveBeenCalledTimes(1);
    expect(mocks.notifyShipped).not.toHaveBeenCalled();
  });

  it("notes on the order when the shipping email could not be sent", async () => {
    mocks.notifyShipped.mockResolvedValue(false);
    expect((await apply()).outcome).toBe("shipped");
    expect(noteBodies()).toEqual([
      "Shipmondo shipment 77 applied: GLS Z9",
      "The shipping email could not be sent. Send it from this order.",
    ]);
  });

  it("lets a Shipmondo failure surface, so the webhook answers 5xx and the delivery comes again", async () => {
    fetchImpl.mockResolvedValueOnce(new Response('{"error":"down"}', { status: 503 }));
    await expect(apply()).rejects.toThrow(/Shipmondo 503/);
    expect(mocks.writeTracking).not.toHaveBeenCalled();
  });
});
