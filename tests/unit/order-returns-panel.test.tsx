import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * A quantity cap holds a return's units until it is rejected or received, so each
 * state the panel can show must offer a way on: a rejected return frees its units,
 * and goods that arrive after a refund can still be received.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/admin/ordrer/actions", () => ({
  createReturn: vi.fn(),
  approveReturn: vi.fn(),
  rejectReturn: vi.fn(),
  receiveAndRestock: vi.fn(),
  refundReturn: vi.fn(),
}));

import OrderReturnsPanel from "@/components/admin/OrderReturnsPanel";

function buttons(status: string, restocked = false) {
  const html = renderToStaticMarkup(
    <OrderReturnsPanel
      orderId="order-1"
      items={[]}
      returns={[
        {
          id: "ret-1",
          status,
          reason: "changed mind",
          refundDkk: 0,
          restocked,
          createdAt: "2026-10-01T10:00:00.000Z",
          items: [{ id: "item-1", productName: "Plain Mug", quantity: 3 }],
        },
      ]}
      hasStripePayment={false}
    />,
  );
  return ["Approve", "Reject", "Receive + restock"].filter((label) => html.includes(`>${label}</button>`));
}

describe("OrderReturnsPanel", () => {
  it.each([
    ["requested", false, ["Approve", "Reject"]],
    ["approved", false, ["Reject", "Receive + restock"]],
    ["received", true, []],
    ["refunded", false, ["Receive + restock"]],
    ["refunded", true, []],
    ["rejected", false, []],
  ])("a %s return (restocked: %s) offers %j", (status, restocked, expected) => {
    expect(buttons(status, restocked)).toEqual(expected);
  });
});
