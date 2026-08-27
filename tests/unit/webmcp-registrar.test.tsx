// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebMcpToolDescriptor } from "@/lib/model-context";

/**
 * What this pins is the REGISTRATION CONTRACT, with a real DOM and a stubbed
 * `document.modelContext` — not the tools' business logic (the server actions
 * behind them have their own tests). Three invariants:
 *
 * (add_to_cart moved to the PDP mount — tests/unit/webmcp-pdp-tools.test.tsx.)
 *
 * 1. Mounting registers exactly the descriptors `WEBMCP_TOOL_BINDINGS` names,
 *    with the schema/annotation shape the draft expects — so the moat test's
 *    "bindings ⊆ customer-safe" claim actually covers what gets registered.
 * 2. Registration is AWAITED sequentially and degrades per-tool: one
 *    rejecting `registerTool` must not drop the tools after it. (The draft
 *    returns a promise; the old code ignored it entirely.)
 * 3. Unmount aborts the signal every registration was handed — WebMCP has no
 *    unregisterTool(); the abort IS the cleanup, and leaking it would leave
 *    stale tools registered across navigations.
 */

type Registration = {
  tool: WebMcpToolDescriptor;
  options: { signal?: AbortSignal } | undefined;
};

let registrations: Registration[];
let registerTool: ReturnType<typeof vi.fn>;

vi.mock("@/app/[locale]/cart/actions", () => ({
  getCartSummaryAction: vi.fn(async () => ({
    count: 0,
    currency: "DKK",
    items: [],
  })),
}));

const { default: WebMcpRegistrar, WEBMCP_TOOL_BINDINGS } = await import(
  "@/components/WebMcpRegistrar"
);
const cartActions = await import("@/app/[locale]/cart/actions");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  registrations = [];
  registerTool = vi.fn(async (tool: WebMcpToolDescriptor, options?: { signal?: AbortSignal }) => {
    registrations.push({ tool, options });
  });
  (document as unknown as { modelContext?: unknown }).modelContext = { registerTool };
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

async function mount() {
  await act(async () => {
    root.render(<WebMcpRegistrar />);
  });
  // registerWebMcpTools awaits each registration in a floating promise chain;
  // drain the microtask queue so all sequential awaits settle.
  await act(async () => {
    await Promise.resolve();
  });
}

describe("WebMcpRegistrar — registration contract", () => {
  it("registers exactly the tools WEBMCP_TOOL_BINDINGS names, in order", async () => {
    await mount();
    expect(registrations.map((r) => r.tool.name)).toEqual(
      Object.keys(WEBMCP_TOOL_BINDINGS),
    );
  });

  it("every descriptor carries the draft's required shape", async () => {
    await mount();
    for (const { tool } of registrations) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(typeof tool.execute).toBe("function");
    }
    const byName = Object.fromEntries(registrations.map((r) => [r.tool.name, r.tool]));
    // Read-only hints on the tools that mutate nothing — the agent's
    // safe-to-call signal.
    expect(byName.search_products.annotations?.readOnlyHint).toBe(true);
    expect(byName.get_cart.annotations?.readOnlyHint).toBe(true);
    expect(byName.navigate.annotations?.readOnlyHint).toBeUndefined();
    // The schemas name their required inputs.
    expect(byName.search_products.inputSchema).toMatchObject({ required: ["query"] });
    expect(byName.navigate.inputSchema).toMatchObject({ required: ["path"] });
  });

  it("hands every registration the SAME abort signal, and unmount aborts it", async () => {
    await mount();
    const signals = registrations.map((r) => r.options?.signal);
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
    expect(new Set(signals).size).toBe(1);
    const signal = signals[0]!;
    expect(signal.aborted).toBe(false);
    act(() => root.unmount());
    expect(signal.aborted).toBe(true);
  });

  it("registrations are SEQUENTIAL — the next begins only after the previous settles", async () => {
    // Pins the awaited-registration claim itself: a Promise.all (or
    // fire-and-forget) implementation would overlap the calls and pass the
    // order/rejection tests anyway, because the mock records synchronously.
    let inFlight = 0;
    let maxInFlight = 0;
    registerTool.mockImplementation(
      async (tool: WebMcpToolDescriptor, options?: { signal?: AbortSignal }) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        registrations.push({ tool, options });
      },
    );
    await mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(registrations.length).toBe(Object.keys(WEBMCP_TOOL_BINDINGS).length);
    expect(maxInFlight).toBe(1);
  });

  it("one rejecting registerTool does not drop the tools after it", async () => {
    registerTool.mockImplementation(
      async (tool: WebMcpToolDescriptor, options?: { signal?: AbortSignal }) => {
        if (tool.name === "search_products") throw new Error("boom");
        registrations.push({ tool, options });
      },
    );
    await mount();
    // search_products threw; the remaining tools still registered.
    expect(registrations.map((r) => r.tool.name)).toEqual(
      Object.keys(WEBMCP_TOOL_BINDINGS).filter((n) => n !== "search_products"),
    );
  });

  it("no modelContext → renders nothing and registers nothing", async () => {
    delete (document as unknown as { modelContext?: unknown }).modelContext;
    await mount();
    expect(registrations).toEqual([]);
    expect(container.innerHTML).toBe("");
  });

  it("get_cart translates a thrown action into an {error} the agent can act on", async () => {
    vi.mocked(cartActions.getCartSummaryAction).mockRejectedValueOnce(new Error("db down"));
    await mount();
    const tool = registrations.find((r) => r.tool.name === "get_cart")!.tool;
    const result = (await tool.execute({})) as Record<string, unknown>;
    expect(typeof result.error).toBe("string");
  });

  it("navigate refuses external and protocol-relative destinations", async () => {
    await mount();
    const tool = registrations.find((r) => r.tool.name === "navigate")!.tool;
    for (const path of ["https://evil.com", "//evil.com", "javascript:alert(1)"]) {
      const result = (await tool.execute({ path })) as Record<string, unknown>;
      expect(result.error, path).toBeDefined();
    }
  });
});

describe("search_products output redaction", () => {
  it("returns ONLY the advertised row shape — checkout endpoints and images never enter the browser surface", async () => {
    await mount();
    const search = registrations.find((r) => r.tool.name === "search_products")!.tool;
    // The REST route serves other consumers and carries MORE than the tool
    // advertises (checkoutEndpoint, inventoryQuantity, image URLs). The
    // browser tool must re-state only its promised shape, so nothing
    // order-adjacent leaks into the in-browser surface even when the API
    // grows a field.
    const apiRow = {
      id: "p1",
      title: "Espresso Blend",
      description: "x".repeat(300),
      price: 9900,
      currency: "DKK",
      url: "https://shop.example/product/espresso-blend",
      inStock: true,
      inventoryQuantity: 12,
      primaryImageUrl: "https://img.example/a.jpg",
      checkoutEndpoint: "https://shop.example/api/commerce/agent-checkout",
    };
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ query: "espresso", resultsCount: 1, products: [apiRow] }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = (await search.execute({ query: "espresso" })) as {
        products: Array<Record<string, unknown>>;
      };
      expect(result.products).toHaveLength(1);
      const row = result.products[0];
      expect(Object.keys(row).sort()).toEqual(
        ["currency", "description", "id", "inStock", "price", "title", "url"].sort(),
      );
      expect(JSON.stringify(result)).not.toContain("checkoutEndpoint");
      // Bounded output: long descriptions are truncated.
      expect(String(row.description).length).toBeLessThanOrEqual(201);
      expect(String(row.description).endsWith("…")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a transport failure becomes an authored {error}, never a raw exception", async () => {
    await mount();
    const search = registrations.find((r) => r.tool.name === "search_products")!.tool;
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));
    try {
      const result = (await search.execute({ query: "espresso" })) as Record<string, unknown>;
      expect(String(result.error)).toContain("temporary error");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
