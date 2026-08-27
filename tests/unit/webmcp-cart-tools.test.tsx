// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebMcpToolDescriptor } from "@/lib/model-context";
import type { CartToolItem } from "@/components/webmcp/CartWebMcpTools";

/**
 * The cart page's contextual tools — the "agent can undo" half of the
 * upgrade. Pinned here:
 * - three tools, names from CART_WEBMCP_TOOL_BINDINGS, current lines listed
 *   in the descriptions with their cartItemIds,
 * - update forwards to the action; quantity 0 reports "removed"; the agent
 *   window (0–99) rejects before the server is touched,
 * - a not_found result surfaces as {error},
 * - go_to_checkout only NAVIGATES (the moat line: no order placement),
 * - a fresh item list re-registers with fresh descriptions (RSC refresh).
 */

type Registration = {
  tool: WebMcpToolDescriptor;
  options: { signal?: AbortSignal } | undefined;
};

let registrations: Registration[];
let registerTool: ReturnType<typeof vi.fn>;

const okCart = {
  count: 3,
  currency: "DKK",
  items: [
    {
      cartItemId: "line-1",
      productId: "p1",
      variantId: null,
      productName: "Espresso Blend",
      slug: "espresso-blend",
      quantity: 3,
      maxQuantity: 25,
      unitPrice: { amountMinor: 14900, currency: "DKK", formatted: "x" },
      lineTotal: { amountMinor: 44700, currency: "DKK", formatted: "x" },
    },
  ],
  subtotal: { amountMinor: 44700, currency: "DKK", formatted: "x" },
  shipping: { amountMinor: 0, currency: "DKK", formatted: "x" },
  total: { amountMinor: 44700, currency: "DKK", formatted: "x" },
};

vi.mock("@/app/[locale]/cart/actions", () => ({
  updateCartItemAction: vi.fn(async () => ({ ok: true, cart: okCart })),
  removeCartItemAction: vi.fn(async () => ({
    ok: true,
    removed: { productId: "p1", productName: "Espresso Blend" },
    cart: okCart,
  })),
}));

const { default: CartWebMcpTools, CART_WEBMCP_TOOL_BINDINGS } = await import(
  "@/components/webmcp/CartWebMcpTools"
);
const cartActions = await import("@/app/[locale]/cart/actions");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const items: CartToolItem[] = [
  { cartItemId: "line-1", productName: "Espresso Blend", quantity: 3, maxQuantity: 25 },
  { cartItemId: "line-2", productName: "Hand Grinder", quantity: 1, maxQuantity: 2 },
];

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let assignedPath: string | null;

beforeEach(() => {
  registrations = [];
  assignedPath = null;
  registerTool = vi.fn(async (tool: WebMcpToolDescriptor, options?: { signal?: AbortSignal }) => {
    registrations.push({ tool, options });
  });
  (document as unknown as { modelContext?: unknown }).modelContext = { registerTool };
  // jsdom refuses real navigation — observe the assignment instead
  // (login-callback-url.test.tsx pattern).
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      assign: (path: string) => {
        assignedPath = path;
      },
    },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (document as unknown as { modelContext?: unknown }).modelContext;
  vi.clearAllMocks();
});

async function mount(list: CartToolItem[] = items) {
  await act(async () => {
    root.render(<CartWebMcpTools items={list} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function tool(name: string): WebMcpToolDescriptor {
  const hit = registrations.find((r) => r.tool.name === name);
  if (!hit) throw new Error(`tool ${name} not registered`);
  return hit.tool;
}

describe("CartWebMcpTools — undo lives on the cart page", () => {
  it("registers exactly the bindings' tools with the current lines listed", async () => {
    await mount();
    expect(registrations.map((r) => r.tool.name)).toEqual(
      Object.keys(CART_WEBMCP_TOOL_BINDINGS),
    );
    const d = tool("update_cart_item_quantity").description;
    expect(d).toContain('line-1 — "Espresso Blend" × 3 (max 25)');
    expect(d).toContain('line-2 — "Hand Grinder" × 1 (max 2)');
  });

  it("update forwards to the action; quantity 0 reports removed", async () => {
    await mount();
    const t = tool("update_cart_item_quantity");
    const updated = (await t.execute({ cartItemId: "line-1", quantity: 5 })) as Record<string, unknown>;
    expect(cartActions.updateCartItemAction).toHaveBeenCalledWith("line-1", 5);
    expect(updated.status).toBe("updated");
    const removed = (await t.execute({ cartItemId: "line-1", quantity: 0 })) as Record<string, unknown>;
    expect(removed.status).toBe("removed");
  });

  it("rejects quantities outside the agent window BEFORE the server", async () => {
    await mount();
    const t = tool("update_cart_item_quantity");
    // null/false/"" would coerce to 0 — a DESTRUCTIVE removal from a
    // malformed call — so non-numbers must be rejected before coercion.
    for (const quantity of [-1, 100, 2.5, Number.NaN, null, false, ""]) {
      const result = (await t.execute({ cartItemId: "line-1", quantity })) as Record<string, unknown>;
      expect(result.error, String(quantity)).toBeDefined();
    }
    expect(cartActions.updateCartItemAction).not.toHaveBeenCalled();
  });

  it("a not_found result surfaces as {error}", async () => {
    vi.mocked(cartActions.updateCartItemAction).mockResolvedValueOnce({
      ok: false,
      error: "No such item in the current cart.",
      code: "not_found",
    });
    await mount();
    const result = (await tool("update_cart_item_quantity").execute({
      cartItemId: "stale",
      quantity: 1,
    })) as Record<string, unknown>;
    expect(String(result.error)).toContain("No such item");
  });

  it("remove returns WHAT was removed plus the fresh cart", async () => {
    await mount();
    const result = (await tool("remove_cart_item").execute({ cartItemId: "line-1" })) as Record<string, unknown>;
    expect(cartActions.removeCartItemAction).toHaveBeenCalledWith("line-1");
    expect(result.removed).toEqual({ productId: "p1", productName: "Espresso Blend" });
    expect(result.cart).toBeDefined();
  });

  it("go_to_checkout only navigates — it does not place anything", async () => {
    await mount();
    const t = tool("go_to_checkout");
    expect(t.description).toContain("Does NOT place an order");
    const result = (await t.execute({})) as Record<string, unknown>;
    expect(assignedPath).toBe("/checkout");
    expect(result).toEqual({ status: "navigating", path: "/checkout" });
  });

  it("a fresh item list re-registers with fresh descriptions", async () => {
    await mount();
    const firstSignal = registrations[0].options?.signal;
    await mount([{ cartItemId: "line-9", productName: "New Thing", quantity: 1, maxQuantity: 5 }]);
    expect(firstSignal?.aborted).toBe(true);
    const d = tool("update_cart_item_quantity").description;
    // the LAST registration set wins the lookup — assert on the fresh one
    const fresh = registrations.filter((r) => r.tool.name === "update_cart_item_quantity").pop()!;
    expect(fresh.tool.description).toContain("line-9");
    expect(d).toBeDefined();
  });
});
