// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ORD1-a1 — what a status control opens on is one click from being written, and
 * some of its options cannot be undone: `refunded` has no way out, and `cancelled`
 * also cancels the PaymentIntent. A shop's order moves the options. It must not
 * move that one, least of all when the shop only renamed a status and the column's
 * default number did the moving. The same on the server's first paint, on a real
 * database: order-status-admin-db.test.tsx.
 */

const action = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/admin/ordrer/actions", () => ({ updateOrderStatusAdmin: action }));

const { default: OrderStatusForm } = await import("@/components/admin/OrderStatusForm");
const { default: OrderTimeline } = await import("@/components/admin/OrderTimeline");
const { ORDER_STATUSES, legalNextStates } = await import("@/lib/orders/status");
const { STATIC_ORDER_STATUS_ROWS, overlayOrderStatuses } = await import("@/lib/orders/status-table");

type Rows = ReturnType<typeof overlayOrderStatuses>;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  action.mockReset();
  action.mockResolvedValue({ ok: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const select = () => host.querySelector("select") as HTMLSelectElement;
const shown = () => [...select().options].map((option) => option.value);
const mount = (ui: ReactNode) => act(async () => root.render(ui));
const clickUpdate = async () => {
  const button = [...host.querySelectorAll("button")].find((b) => /Update/.test(b.textContent ?? ""));
  await act(async () => button?.click());
};

const withNumber = (key: string, sortOrder: number) =>
  overlayOrderStatuses(STATIC_ORDER_STATUS_ROWS.map((r) => (r.key === key ? { ...r, sortOrder } : r)));
const renamedOnly = overlayOrderStatuses(
  STATIC_ORDER_STATUS_ROWS.filter((r) => r.key === "paid").map((r) => ({ ...r, label: "Settled", sortOrder: 0 })),
);

const TABLES: [string, Rows][] = [
  ["one number moved a little", withNumber("completed", 95)],
  ["a refund moved to the top on purpose", withNumber("refunded", -1)],
  ["a row that only renames, on the column's default number", renamedOnly],
];

describe.each([
  ["the plain status form", (status: string, rows: Rows) => <OrderStatusForm key={status} orderId="o1" currentStatus={status} statuses={rows} />],
  ["the workspace timeline", (status: string, rows: Rows) => <OrderTimeline key={status} orderId="o1" currentStatus={status} notes={[]} statuses={rows} />],
])("%s", (_control, control) => {
  describe.each(TABLES)("on %s", (_table, rows) => {
    it("the list follows the shop, and a shipped order still opens on Delivered, not on Refunded", async () => {
      await mount(control("shipped", rows));
      expect(shown()[0]).toBe("refunded");
      expect(select().value).toBe("delivered");
      await clickUpdate();
      expect(action).toHaveBeenLastCalledWith("o1", "delivered");
    });

    it("every status opens on the machine's first step, and one click sends that", async () => {
      for (const status of ORDER_STATUSES) {
        const first = legalNextStates(status)[0];
        if (!first) continue;
        await mount(control(status, rows));
        expect(select().value, status).toBe(first);
        await clickUpdate();
        expect(action, status).toHaveBeenLastCalledWith("o1", first);
      }
    });

    it("a refund the operator picks on purpose is still what is sent", async () => {
      await mount(control("shipped", rows));
      await act(async () => {
        select().value = "refunded";
        select().dispatchEvent(new Event("change", { bubbles: true }));
      });
      await clickUpdate();
      expect(action).toHaveBeenLastCalledWith("o1", "refunded");
    });
  });
});

describe.each(TABLES)("a legacy string on the plain status form, on %s", (_table, rows) => {
  it("opens where it opened before the table, whatever the order", async () => {
    await mount(<OrderStatusForm orderId="o1" currentStatus="legacy_weird" statuses={rows} />);
    expect(select().value).toBe(ORDER_STATUSES[0]);
    await clickUpdate();
    expect(action).toHaveBeenLastCalledWith("o1", ORDER_STATUSES[0]);
  });
});
