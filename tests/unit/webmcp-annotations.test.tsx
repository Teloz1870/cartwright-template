// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebMcpToolDescriptor } from "@/lib/model-context";

/**
 * WMC1-a — every WebMCP browser tool states its annotations.
 *
 * Chrome's `registerTool` reads three hints (imperative-API guide, measured
 * 2026-09-23): `readOnlyHint` (reads, changes nothing), `consequentialHint`
 * (a significant, real-world or irreversible effect — browsers may make the
 * human confirm) and `untrustedContentHint` (the OUTPUT carries data the tool
 * author does not vouch for, e.g. reviews). All default to false, so a tool
 * that omits them is indistinguishable from one that was considered and
 * cleared. Until this slice only four tools set any hint, and none of the
 * three cart-changing tools did.
 *
 * Pinned here, against the REAL registration path (every surface mounted at
 * once, a stubbed `document.modelContext` capturing what is registered):
 *
 * 1. The captured set is exactly every surface's moat-binding keys — so the
 *    assertions below cover every tool, not a convenient subset.
 * 2. Every tool carries all three hints as explicit booleans, and nothing else.
 * 3. The cart-changing set is consequential, and ONLY that set — a hint on
 *    every tool would be a hint on none.
 * 4. Each tool's hints match the class its moat binding implies: a cart
 *    mutation is consequential, a read-only binding is read-only, an empty
 *    binding (navigation) is neither.
 * 5. No WebMCP registration bypasses `registerWebMcpTools`, and every file
 *    that calls it is mounted here — a new surface cannot ship un-annotated
 *    because this test never saw it.
 */

type Registration = { tool: WebMcpToolDescriptor };

let registrations: Registration[];
let registerTool: ReturnType<typeof vi.fn>;

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
}));

vi.mock("@/app/[locale]/cart/actions", () => ({
  getCartSummaryAction: vi.fn(async () => ({ count: 0, currency: "DKK", items: [] })),
  addToCartAction: vi.fn(async () => ({ ok: true, added: {}, cart: null })),
  updateCartItemAction: vi.fn(async () => ({ ok: true, cart: null })),
  removeCartItemAction: vi.fn(async () => ({ ok: true, removed: {}, cart: null })),
}));

const { default: WebMcpRegistrar, WEBMCP_TOOL_BINDINGS } = await import(
  "@/components/WebMcpRegistrar"
);
const { default: PlpWebMcpTools, PLP_WEBMCP_TOOL_BINDINGS } = await import(
  "@/components/webmcp/PlpWebMcpTools"
);
const { default: PdpWebMcpTools, PDP_WEBMCP_TOOL_BINDINGS } = await import(
  "@/components/webmcp/PdpWebMcpTools"
);
const { default: CartWebMcpTools, CART_WEBMCP_TOOL_BINDINGS } = await import(
  "@/components/webmcp/CartWebMcpTools"
);
const { default: BrewWebMcpTools, CREMA_WEBMCP_TOOL_BINDINGS } = await import(
  "@/designs/crema/webshop/BrewWebMcpTools"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ALL_BINDINGS: Record<string, readonly string[]> = {
  ...WEBMCP_TOOL_BINDINGS,
  ...PLP_WEBMCP_TOOL_BINDINGS,
  ...PDP_WEBMCP_TOOL_BINDINGS,
  ...CART_WEBMCP_TOOL_BINDINGS,
  ...CREMA_WEBMCP_TOOL_BINDINGS,
};

/**
 * The tools that change the customer's cart, by name. Literal on purpose: the
 * binding-derived check below would follow a binding edit silently, this list
 * does not. `go_to_checkout` is NOT here — it only opens the checkout page,
 * where the human places the order (the moat test files it NAVIGATION_ONLY).
 */
const CART_CHANGING = new Set([
  "add_current_product_to_cart",
  "update_cart_item_quantity",
  "remove_cart_item",
]);

/**
 * Tools whose OUTPUT carries customer-written text (reviews, Q&A, any
 * user-generated field) and therefore set `untrustedContentHint`. Empty today:
 * every tool returns merchant-written catalogue/cart data, which is the tool
 * author's own. A tool that starts returning review text joins this set in
 * the same change.
 */
const UNTRUSTED_OUTPUT = new Set<string>([]);

/** Every operation a WebMCP binding may name, by what it does. */
const READ_OPS = new Set(["products.search", "products.get", "cart.get_summary"]);
const CART_MUTATION_OPS = new Set(["cart.add", "cart.update_quantity", "cart.remove"]);

const HINT_KEYS = ["consequentialHint", "readOnlyHint", "untrustedContentHint"];

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  registrations = [];
  registerTool = vi.fn(async (tool: WebMcpToolDescriptor) => {
    registrations.push({ tool });
  });
  (document as unknown as { modelContext?: unknown }).modelContext = { registerTool };
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/en/cart", assign: vi.fn() },
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

/** Mount every WebMCP surface at once and collect what each registers. */
async function mountAll(): Promise<Map<string, WebMcpToolDescriptor>> {
  await act(async () => {
    root.render(
      <>
        <WebMcpRegistrar />
        <PlpWebMcpTools
          products={[
            {
              id: "p1",
              name: "Yirgacheffe",
              slug: "yirgacheffe",
              priceFormatted: "149,00 kr.",
              inStock: true,
              category: "Beans",
            },
          ]}
          totalCount={1}
          categories={[{ slug: "beans", name: "Beans" }]}
          filters={{}}
          locale="en"
        />
        <PdpWebMcpTools
          product={{
            id: "p1",
            name: "Yirgacheffe",
            slug: "yirgacheffe",
            inStock: true,
            priceFormatted: "149,00 kr.",
            variants: [{ id: "v1", label: "250 g", priceFormatted: "149,00 kr.", stock: 4 }],
          }}
        />
        <CartWebMcpTools
          items={[
            { cartItemId: "line-1", productName: "Yirgacheffe", quantity: 1, maxQuantity: 4 },
          ]}
        />
        <BrewWebMcpTools />
      </>,
    );
  });
  // Each surface awaits its registrations one by one; a macrotask lets every
  // chain settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return new Map(registrations.map((r) => [r.tool.name, r.tool]));
}

describe("WebMCP annotations — no tool registers silently (WMC1-a)", () => {
  it("captures every surface's tools — exactly the moat-binding keys", async () => {
    const tools = await mountAll();
    expect([...tools.keys()].sort()).toEqual(Object.keys(ALL_BINDINGS).sort());
    // A name registered twice would collapse in the Map and hide a tool.
    expect(registrations.length).toBe(tools.size);
  });

  it("every tool states all three hints as explicit booleans, and no other key", async () => {
    const tools = await mountAll();
    for (const [name, tool] of tools) {
      const annotations = tool.annotations as Record<string, unknown> | undefined;
      expect(annotations, `${name} registers without annotations`).toBeTypeOf("object");
      expect(Object.keys(annotations ?? {}).sort(), `${name}'s annotation keys`).toEqual(
        HINT_KEYS,
      );
      for (const hint of HINT_KEYS) {
        expect(typeof annotations?.[hint], `${name}.${hint} must be explicit`).toBe("boolean");
      }
    }
  });

  it("the cart-changing tools are consequential, and nothing else is", async () => {
    const tools = await mountAll();
    for (const name of CART_CHANGING) {
      expect(tools.has(name), `${name} is not registered`).toBe(true);
    }
    for (const [name, tool] of tools) {
      expect(tool.annotations.consequentialHint, `${name}.consequentialHint`).toBe(
        CART_CHANGING.has(name),
      );
      if (CART_CHANGING.has(name)) {
        expect(tool.annotations.readOnlyHint, `${name} changes the cart`).toBe(false);
      }
    }
  });

  it("each tool's hints match what its moat binding says it does", async () => {
    const tools = await mountAll();
    for (const [name, tool] of tools) {
      const ops = ALL_BINDINGS[name];
      // Fail closed: a new operation must be classified here before any tool
      // may bind to it.
      for (const op of ops) {
        expect(
          READ_OPS.has(op) || CART_MUTATION_OPS.has(op),
          `${name} binds "${op}", which this test does not classify`,
        ).toBe(true);
      }
      const mutates = ops.some((op) => CART_MUTATION_OPS.has(op));
      const expected = mutates
        ? { readOnlyHint: false, consequentialHint: true }
        : ops.length > 0
          ? { readOnlyHint: true, consequentialHint: false }
          : // Empty binding = navigation only: it changes the page, so it is
            // not read-only, and Back undoes it, so it is not consequential.
            { readOnlyHint: false, consequentialHint: false };
      expect(tool.annotations, name).toEqual({
        ...expected,
        untrustedContentHint: UNTRUSTED_OUTPUT.has(name),
      });
    }
  });

  it("no WebMCP registration bypasses registerWebMcpTools, and every caller is mounted above", () => {
    const MOUNTED = [
      "components/WebMcpRegistrar.tsx",
      "components/webmcp/CartWebMcpTools.tsx",
      "components/webmcp/PdpWebMcpTools.tsx",
      "components/webmcp/PlpWebMcpTools.tsx",
      "designs/crema/webshop/BrewWebMcpTools.tsx",
    ];
    // lib/model-context.ts defines registerWebMcpTools; app/api/mcp/route.ts
    // is the SERVER MCP (`server.registerTool` from the MCP SDK), not WebMCP.
    const EXEMPT = new Set(["lib/model-context.ts", "app/api/mcp/route.ts"]);
    const callers: string[] = [];
    const bypasses: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === "generated") continue;
          walk(path);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !EXEMPT.has(path)) {
          const source = readFileSync(path, "utf-8");
          if (/\bregisterWebMcpTools\(/.test(source)) callers.push(path);
          if (/(?<![A-Za-z])registerTool\(/.test(source)) bypasses.push(path);
        }
      }
    };
    for (const dir of ["app", "components", "designs", "lib", "plugins"]) walk(dir);
    expect(bypasses, "register through registerWebMcpTools, never registerTool directly").toEqual(
      [],
    );
    expect(callers.sort()).toEqual(MOUNTED);
  });
});
