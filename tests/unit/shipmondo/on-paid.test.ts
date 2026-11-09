import { beforeEach, describe, expect, it, vi } from "vitest";

/** The shipmondo plugin's side of the paid-order seam (plugins/shipmondo/lib/on-paid.ts). */
const mocks = vi.hoisted(() => ({
  features: { shipmondo: true } as Record<string, boolean>,
  sendOrderToShipmondo: vi.fn(),
}));

vi.mock("@/lib/brand", () => ({ getFeatures: async () => mocks.features }));
vi.mock("@/plugins/shipmondo/lib/send-order", () => ({ sendOrderToShipmondo: mocks.sendOrderToShipmondo }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SHIPMONDO_API_USER", "u");
  vi.stubEnv("SHIPMONDO_API_KEY", "k");
  mocks.features = { shipmondo: true };
  mocks.sendOrderToShipmondo.mockReset().mockResolvedValue({ outcome: "sent", salesOrderId: 1 });
});

async function run(orderId = "ord_1") {
  const { sendPaidOrderToShipmondo } = await import("@/plugins/shipmondo/lib/on-paid");
  await sendPaidOrderToShipmondo(orderId);
}

describe("sendPaidOrderToShipmondo", () => {
  it("sends the order as the payment hook", async () => {
    await run();
    expect(mocks.sendOrderToShipmondo).toHaveBeenCalledExactlyOnceWith(
      "ord_1",
      "system:shipmondo-on-paid",
      expect.objectContaining({ config: expect.objectContaining({ apiUser: "u" }) }),
    );
  });

  it("stays quiet while the flag is off or no account is connected", async () => {
    mocks.features = { shipmondo: false };
    await run();
    mocks.features = { shipmondo: true };
    vi.stubEnv("SHIPMONDO_API_USER", "");
    await run();
    expect(mocks.sendOrderToShipmondo).not.toHaveBeenCalled();
  });

  it("leaves the failure line to the send itself, and never throws on a refusal", async () => {
    mocks.sendOrderToShipmondo.mockResolvedValue({ outcome: "failed", error: "Shipmondo answered 422: zipcode" });
    await expect(run()).resolves.toBeUndefined();
    expect(mocks.sendOrderToShipmondo).toHaveBeenCalledTimes(1);
  });
});
