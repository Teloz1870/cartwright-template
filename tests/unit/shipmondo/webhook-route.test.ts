import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/shipmondo/webhook (plugins/shipmondo/api/webhook.ts). Shipmondo wants
 * a 200 within 3 seconds and documents no retries, so the route verifies the
 * signature, answers at once, and applies the shipment after the response.
 */
const mocks = vi.hoisted(() => ({
  features: { shipmondo: true } as Record<string, boolean>,
  applyShipment: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({ getFeatures: async () => mocks.features }));
vi.mock("@/plugins/shipmondo/lib/apply-shipment", () => ({ applyShipment: mocks.applyShipment }));
// after(): run the deferred work at once, so the test can see it.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    void fn();
  },
}));

const KEY = "webhook-key-for-test";

function sign(payload: unknown, key = KEY): string {
  const b = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = b({ alg: "HS256", typ: "JWT" });
  const body = b(payload);
  return `${head}.${body}.${createHmac("sha256", key).update(`${head}.${body}`).digest("base64url")}`;
}

const SHIPMENT = { id: 77, order_id: "1042", pkg_no: "Z9", carrier_code: "gls" };

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/shipmondo/webhook", { method: "POST", body, headers }) as never;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SHIPMONDO_WEBHOOK_KEY", KEY);
  vi.stubEnv("SHIPMONDO_API_USER", "u");
  vi.stubEnv("SHIPMONDO_API_KEY", "k");
  mocks.features = { shipmondo: true };
  mocks.applyShipment.mockReset().mockResolvedValue({ outcome: "shipped", orderId: "ord_1" });
});

async function call(req: ReturnType<typeof post>) {
  const { POST } = await import("@/plugins/shipmondo/api/webhook");
  const res = await POST(req);
  return { status: res.status, body: await res.json() };
}

describe("shipmondo webhook route", () => {
  it("answers 200 at once for a signed shipment, and applies it after the response", async () => {
    // Shipmondo's envelope: { data: <JWT> }, the payload { webhook, data: <shipment>, url }.
    const res = await call(post(JSON.stringify({ data: sign({ webhook: "Shipment", data: SHIPMENT, url: "x" }) })));
    expect(res).toEqual({ status: 200, body: { ok: true, accepted: 77 } });
    expect(mocks.applyShipment).toHaveBeenCalledWith(
      expect.objectContaining({ orderRef: "1042", trackingNumber: "Z9", shipmentId: 77 }),
      { config: expect.objectContaining({ apiUser: "u" }) },
    );
  });

  it("answers before the shipment is applied: a slow Shipmondo cannot hold the 200 past 3 seconds", async () => {
    mocks.applyShipment.mockImplementation(() => new Promise(() => {})); // never settles
    expect((await call(post(sign(SHIPMENT)))).status).toBe(200);
    expect(mocks.applyShipment).toHaveBeenCalledTimes(1);
  });

  it("acknowledges, but applies nothing, without an account to check the shipment with", async () => {
    vi.stubEnv("SHIPMONDO_API_KEY", "");
    expect(await call(post(sign(SHIPMENT)))).toEqual({ status: 200, body: { ok: true, ignored: "shipmondo-not-configured" } });
    expect(mocks.applyShipment).not.toHaveBeenCalled();
  });

  it("acknowledges a signed shipment booked by hand (no webshop order), and applies nothing", async () => {
    expect((await call(post(sign({ ...SHIPMENT, order_id: null })))).status).toBe(200);
    expect(mocks.applyShipment).not.toHaveBeenCalled();
  });

  it("is not there while the flag is off", async () => {
    mocks.features = { shipmondo: false };
    expect((await call(post(sign(SHIPMENT)))).status).toBe(404);
    expect(mocks.applyShipment).not.toHaveBeenCalled();
  });

  it("refuses a delivery not signed with the shop's key, and every one when no key is set", async () => {
    expect((await call(post(sign(SHIPMENT, "someone-else")))).status).toBe(401);
    vi.stubEnv("SHIPMONDO_WEBHOOK_KEY", "");
    expect((await call(post(sign(SHIPMENT)))).status).toBe(401);
    expect(mocks.applyShipment).not.toHaveBeenCalled();
  });

  it("refuses an oversized body before reading it", async () => {
    expect((await call(post("x", { "content-length": String(300 * 1024) }))).status).toBe(413);
  });

  it("never lets a failure after the response turn into an error answer (the sweep fetches it later)", async () => {
    mocks.applyShipment.mockRejectedValue(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call(post(sign(SHIPMENT)))).status).toBe(200);
    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    log.mockRestore();
  });
});
