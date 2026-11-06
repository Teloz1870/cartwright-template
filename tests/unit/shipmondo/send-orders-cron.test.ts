import { beforeEach, describe, expect, it, vi } from "vitest";

/** /api/cron/shipmondo-orders (plugins/shipmondo/api/send-orders-cron.ts): guarded, and a no-op until the shop is set up. */
const mocks = vi.hoisted(() => ({
  features: { shipmondo: true } as Record<string, boolean>,
  sendUnsentOrders: vi.fn(),
  reconcileTracking: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({ getFeatures: async () => mocks.features }));
vi.mock("@/plugins/shipmondo/lib/send-order", () => ({ sendUnsentOrders: mocks.sendUnsentOrders, SWEEP_BUDGET_MS: 45_000 }));
vi.mock("@/plugins/shipmondo/lib/reconcile", () => ({ reconcileTracking: mocks.reconcileTracking }));

const SECRET = "cron-secret-for-test";

function request(auth = `Bearer ${SECRET}`) {
  return new Request("http://localhost/api/cron/shipmondo-orders", { headers: { authorization: auth } }) as never;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("SHIPMONDO_API_USER", "u");
  vi.stubEnv("SHIPMONDO_API_KEY", "k");
  mocks.features = { shipmondo: true };
  mocks.sendUnsentOrders.mockReset().mockResolvedValue({ checked: 2, sent: 2, alreadySent: 0, failed: [] });
  mocks.reconcileTracking.mockReset().mockResolvedValue({ checked: 1, applied: 1, failed: [] });
});

async function get(req = request()) {
  const { GET } = await import("@/plugins/shipmondo/api/send-orders-cron");
  const res = await GET(req);
  return { status: res.status, body: await res.json() };
}

describe("shipmondo-orders cron", () => {
  it("refuses a caller without the cron secret", async () => {
    expect((await get(request("Bearer wrong"))).status).toBe(401);
    expect(mocks.sendUnsentOrders).not.toHaveBeenCalled();
  });

  it("does nothing while the flag is off or Shipmondo is not connected", async () => {
    mocks.features = { shipmondo: false };
    expect((await get()).body).toEqual({ ok: true, reason: "shipmondo-disabled" });
    mocks.features = { shipmondo: true };
    vi.stubEnv("SHIPMONDO_API_KEY", "");
    expect((await get()).body).toEqual({ ok: true, reason: "shipmondo-not-configured" });
    expect(mocks.sendUnsentOrders).not.toHaveBeenCalled();
  });

  it("sends the unsent orders as the cron, and is not ok when one failed", async () => {
    expect((await get()).body).toEqual({
      ok: true,
      checked: 2,
      sent: 2,
      alreadySent: 0,
      failed: [],
      tracking: { checked: 1, applied: 1, failed: [] },
    });
    expect(mocks.sendUnsentOrders).toHaveBeenCalledWith(
      "system:shipmondo-cron",
      expect.objectContaining({ config: expect.any(Object), budgetMs: 45_000 }),
    );
    expect(mocks.reconcileTracking).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.any(Object), deadline: expect.any(Number) }),
    );
    mocks.sendUnsentOrders.mockResolvedValue({ checked: 1, sent: 0, alreadySent: 0, failed: [{ orderId: "a", error: "x" }] });
    expect((await get()).body).toMatchObject({ ok: false, failed: [{ orderId: "a" }] });
  });
});
