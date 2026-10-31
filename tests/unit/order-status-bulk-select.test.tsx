// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The bulk select of the order workspace only exists once a row is ticked, so it
 * never reaches a server render (see order-status-admin-db.test.tsx for those):
 * it reads labels and order through the same rows, here in a browser's DOM.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a> }));
vi.mock("@/app/admin/ordrer/actions", () => ({ listOrdersPage: vi.fn(), bulkUpdateStatus: vi.fn() }));

const { default: OrdersWorkspace } = await import("@/components/admin/OrdersWorkspace");
const { STATIC_ORDER_STATUS_ROWS, overlayOrderStatuses } = await import("@/lib/orders/status-table");
const { STATUS_LABELS } = await import("@/lib/orders/status");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROW = {
  id: "order-1",
  email: "buyer@shop.example.test",
  shippingName: "Buyer Example",
  status: "paid",
  totalDkk: 12900,
  itemCount: 1,
  createdAt: "2026-10-01T10:00:00.000Z",
  carrier: null,
  trackingNumber: null,
  flags: { delayed: false, lowStock: false, attention: false },
};

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

let mounts = 0;

async function bulkOptions(statuses: Parameters<typeof OrdersWorkspace>[0]["statuses"]) {
  await act(async () =>
    root.render(
      <OrdersWorkspace
        key={++mounts}
        initialRows={[ROW]}
        initialNextCursor={null}
        filters={{ tab: "all", q: "", from: "", to: "" }}
        statuses={statuses}
      />,
    ),
  );
  const tick = host.querySelector<HTMLInputElement>('input[aria-label^="Select order"]');
  await act(async () => tick?.click());
  return [...(host.querySelector("select")?.querySelectorAll("option") ?? [])].map((o) => [o.value, o.textContent]);
}

const TODAY = ["processing", "shipped", "delivered", "completed", "cancelled"] as const;

describe("the workspace's bulk select", () => {
  it("is today's list, in today's order, on the static table and on rows 1:1", async () => {
    const expected = TODAY.map((key) => [key, STATUS_LABELS[key]]);
    expect(await bulkOptions(STATIC_ORDER_STATUS_ROWS)).toEqual(expected);
    expect(await bulkOptions(overlayOrderStatuses(STATIC_ORDER_STATUS_ROWS))).toEqual(expected);
  });

  it("reads a shop's label and order, and offers nothing beside the curated list", async () => {
    const cancelled = STATIC_ORDER_STATUS_ROWS.find((r) => r.key === "cancelled");
    if (!cancelled) throw new Error("no cancelled row");
    const options = await bulkOptions(
      overlayOrderStatuses([
        { ...cancelled, label: "Called off", sortOrder: -1 },
        { ...cancelled, key: "mine", label: "Mine", sortOrder: -2 },
      ]),
    );
    expect(options[0]).toEqual(["cancelled", "Called off"]);
    expect(options.map(([key]) => key).sort()).toEqual([...TODAY].sort());
    // The order moves the options, not the one it opens on: a cancel also cancels the PaymentIntent.
    expect(host.querySelector("select")?.value).toBe("processing");
  });

  it("shows a shop's label and colour on a row of the table", async () => {
    const paid = STATIC_ORDER_STATUS_ROWS.find((r) => r.key === "paid");
    if (!paid) throw new Error("no paid row");
    await bulkOptions(overlayOrderStatuses([{ ...paid, label: "Betalt", color: "bg-pink-100 text-pink-800" }]));
    const badge = [...host.querySelectorAll("tbody span")].find((s) => s.textContent === "Betalt");
    expect(badge?.className).toContain("bg-pink-100 text-pink-800");
  });
});
