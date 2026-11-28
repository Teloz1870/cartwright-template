import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The paid-order seam (lib/orders/paid-hooks.ts): the work runs after the
 * response, and nothing it does reaches the payment path, not even a throw.
 * Its static twin is what a scaffold without the shipmondo plugin gets.
 */
const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  sendPaidOrderToShipmondo: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/plugins/shipmondo/lib/on-paid", () => ({
  sendPaidOrderToShipmondo: mocks.sendPaidOrderToShipmondo,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.after.mockReset();
  mocks.sendPaidOrderToShipmondo.mockReset().mockResolvedValue(undefined);
});

describe("schedulePaidOrderHooks", () => {
  it("hands the work to after(), so nothing runs before the response", async () => {
    const { schedulePaidOrderHooks } = await import("@/lib/orders/paid-hooks");
    schedulePaidOrderHooks("ord_1");

    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.sendPaidOrderToShipmondo).not.toHaveBeenCalled();
    await (mocks.after.mock.calls[0][0] as () => Promise<void>)();
    expect(mocks.sendPaidOrderToShipmondo).toHaveBeenCalledExactlyOnceWith("ord_1");
  });

  it("outside a request scope runs it as a loose promise, and a failure is logged, never thrown", async () => {
    mocks.after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    mocks.sendPaidOrderToShipmondo.mockRejectedValue(new Error("shipmondo down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { schedulePaidOrderHooks } = await import("@/lib/orders/paid-hooks");

    expect(() => schedulePaidOrderHooks("ord_1")).not.toThrow();
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("[paid-hooks] shipmondo:", expect.any(Error)));
    log.mockRestore();
  });

  it("the static twin exports the same function and imports nothing from the plugin", async () => {
    const twin = readFileSync(join(__dirname, "../../../lib/orders/paid-hooks.static.ts"), "utf8");
    expect(twin).not.toMatch(/@\/plugins\//);
    const { schedulePaidOrderHooks } = await import("@/lib/orders/paid-hooks.static");
    expect(schedulePaidOrderHooks("ord_1")).toBeUndefined();
  });
});
