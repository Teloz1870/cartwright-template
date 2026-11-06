import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fetching the tracking a webhook missed (plugins/shipmondo/lib/reconcile.ts):
 * for each sent order still awaiting shipment, the outbound, not-cancelled
 * fulfilments of its sales order that have no marker yet go through applyShipment.
 */
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  noteUpsert: vi.fn(),
  noteFindUnique: vi.fn(),
  applyShipment: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { order: { findMany: mocks.findMany }, orderNote: { upsert: mocks.noteUpsert, findUnique: mocks.noteFindUnique } },
}));
vi.mock("@/plugins/shipmondo/lib/apply-shipment", () => ({
  applyShipment: mocks.applyShipment,
  appliedIdOf: (id: number) => `shipmondo-shipment-${id}`,
}));

const CONFIG = { apiUser: "u", apiKey: "k", baseUrl: "https://sandbox.shipmondo.com/api/public/v3", webhookKey: "wk" };
const sent = (salesOrderId: number) => ({ id: `n-sent-${salesOrderId}`, metaJson: `{"shipmondo":{"salesOrderId":${salesOrderId}}}` });
const checked = (orderId: string, at: string) => ({
  id: `shipmondo-tracking-checked-${orderId}`,
  metaJson: JSON.stringify({ shipmondo: { lastCheckedAt: at } }),
});
const ORDER = { id: "ord_1", orderNumber: 1042, status: "paid", notes: [sent(501)] };

type Candidate = { id: string; notes: { id: string }[]; [key: string]: unknown };
/** The two queries a run makes: never-checked orders, and checked ones (sorted by their last check in code). */
function setCandidates(list: Candidate[]) {
  const isChecked = (o: Candidate) => o.notes.some((n) => n.id.startsWith("shipmondo-tracking-checked-"));
  mocks.findMany.mockImplementation(async ({ where }: { where: { AND: { notes: { none?: unknown } }[] } }) =>
    where.AND[0].notes.none ? list.filter((o) => !isChecked(o)) : list.filter(isChecked),
  );
}

function shipmondo(fulfillments: unknown[]) {
  return vi.fn(async (url: URL) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/sales_orders/501")) return new Response(JSON.stringify({ id: 501, order_fulfillments: fulfillments }), { status: 200 });
    const id = Number(path.split("/").pop());
    return new Response(JSON.stringify({ id, pkg_no: `PKG${id}`, carrier_code: "gls" }), { status: 200 });
  });
}

beforeEach(() => {
  vi.resetModules();
  mocks.findMany.mockReset();
  setCandidates([ORDER]);
  mocks.noteUpsert.mockReset().mockResolvedValue({ id: "c" });
  mocks.noteFindUnique.mockReset().mockResolvedValue(null);
  mocks.applyShipment.mockReset().mockResolvedValue({ outcome: "shipped", orderId: "ord_1" });
});

async function run(fetchImpl: ReturnType<typeof shipmondo>, deadline = Date.now() + 45_000) {
  const { reconcileTracking } = await import("@/plugins/shipmondo/lib/reconcile");
  return reconcileTracking({ config: CONFIG, fetchImpl: fetchImpl as never, deadline, now: new Date("2026-11-05T12:00:00Z") });
}

describe("reconcileTracking", () => {
  it("applies an outbound shipment the webhook missed, through applyShipment", async () => {
    const summary = await run(shipmondo([{ shipment_id: 77, type: "outbound" }]));
    expect(summary).toEqual({ checked: 1, applied: 1, failed: [] });
    expect(mocks.applyShipment).toHaveBeenCalledWith(
      { shipmentId: 77, orderRef: "1042", carrierCode: "gls", carrier: "GLS", trackingNumber: "PKG77" },
      expect.objectContaining({ config: CONFIG }),
    );
    // Only sent orders still awaiting shipment are asked about.
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({
      status: { in: ["paid", "processing", "shipped"] },
      notes: { some: { type: "system", body: { startsWith: "Sent to Shipmondo" } } },
    });
    // The check is kept in the note's metadata: its createdAt (its place on the timeline) never moves.
    const upsert = mocks.noteUpsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ id: "shipmondo-tracking-checked-ord_1" });
    expect(upsert.update).toEqual({ metaJson: '{"shipmondo":{"lastCheckedAt":"2026-11-05T12:00:00.000Z"}}' });
  });

  it("skips returns, cancelled fulfilments and shipments without a number; hands a marked one on to resume", async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/sales_orders/501")) {
        return new Response(
          JSON.stringify({
            id: 501,
            order_fulfillments: [
              { shipment_id: 78, type: "return" },
              { shipment_id: 79, type: "outbound", cancelled: true },
              { shipment_id: 81, type: "outbound" }, // no pkg_no yet: skipped, the next one still runs
              { shipment_id: 80, type: "outbound" }, // already marked: applyShipment resumes it
            ],
          }),
          { status: 200 },
        );
      }
      const id = Number(path.split("/").pop());
      return new Response(JSON.stringify(id === 81 ? { id, pkg_no: null } : { id, pkg_no: `PKG${id}`, carrier_code: "gls" }), { status: 200 });
    });
    await run(fetchImpl as never);
    expect(mocks.applyShipment.mock.calls.map(([e]) => e.shipmentId)).toEqual([80]);
  });

  it("stops at its deadline, and reports a Shipmondo failure per order without stopping", async () => {
    expect(await run(shipmondo([]), Date.now() - 1)).toMatchObject({ checked: 0, stoppedEarly: true });

    // One order's failure does not stop the next.
    setCandidates([ORDER, { id: "ord_2", orderNumber: 1043, status: "paid", notes: [sent(502)] }]);
    const flaky = vi.fn(async (url: URL) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/sales_orders/501")) return new Response('{"error":"down"}', { status: 503 });
      if (path.endsWith("/sales_orders/502")) return new Response(JSON.stringify({ id: 502, order_fulfillments: [{ shipment_id: 90, type: "outbound" }] }), { status: 200 });
      return new Response(JSON.stringify({ id: 90, pkg_no: "PKG90", carrier_code: "dao" }), { status: 200 });
    });
    const summary = await run(flaky as never);
    expect(summary).toMatchObject({ checked: 2, applied: 1, failed: [{ orderId: "ord_1", error: expect.stringContaining("503") }] });
  });

  it("takes turns however often it runs: never checked first, then the longest ago; one checked just now waits", async () => {
    // Paid oldest first: A (checked 3 h ago), B (checked 10 min ago), C (never), D (checked 1 h ago).
    setCandidates([
      { id: "A", orderNumber: 1, status: "paid", notes: [sent(601), checked("A", "2026-11-05T09:00:00.000Z")] },
      { id: "B", orderNumber: 2, status: "paid", notes: [sent(602), checked("B", "2026-11-05T11:50:00.000Z")] },
      { id: "C", orderNumber: 3, status: "paid", notes: [sent(603)] },
      { id: "D", orderNumber: 4, status: "paid", notes: [sent(604), checked("D", "2026-11-05T11:00:00.000Z")] },
    ]);
    const asked: number[] = [];
    const fetchImpl = vi.fn(async (url: URL) => {
      asked.push(Number(new URL(String(url)).pathname.split("/").pop()));
      return new Response(JSON.stringify({ order_fulfillments: [] }), { status: 200 });
    });
    await run(fetchImpl as never);
    expect(asked).toEqual([603, 601, 604]);
    // Never-checked orders are a query of their own, so no number of checked ones can crowd them out.
    expect(mocks.findMany.mock.calls.map(([a]) => a.where.AND[0].notes)).toEqual([
      { none: { id: { startsWith: "shipmondo-tracking-checked-" } } },
      { some: { id: { startsWith: "shipmondo-tracking-checked-" } } },
    ]);
  });

  it("on a shipped order, fetches a second parcel the webhook missed and leaves the one already applied", async () => {
    setCandidates([{ ...ORDER, status: "shipped" }]);
    mocks.noteFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "shipmondo-shipment-77" ? { id: where.id } : null,
    );
    mocks.applyShipment.mockResolvedValue({ outcome: "tracking_updated", orderId: "ord_1" });
    const summary = await run(shipmondo([{ shipment_id: 77, type: "outbound" }, { shipment_id: 88, type: "outbound" }]));
    expect(mocks.applyShipment.mock.calls.map(([e]) => e.shipmentId)).toEqual([88]);
    expect(summary).toMatchObject({ checked: 1, applied: 1 });
  });
});
