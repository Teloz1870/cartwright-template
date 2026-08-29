// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebMcpToolDescriptor } from "@/lib/model-context";
import type { PdpToolProduct } from "@/components/webmcp/PdpWebMcpTools";

/**
 * The PDP's contextual tool: per-route registration (the guidance's ask) with
 * a description built FROM the product, so an agent on the page can add to
 * cart without ids from a prior search. Pinned here:
 * - the descriptor carries the product's name/price and enumerates variants,
 * - execute forwards to addToCartAction with the PAGE's product id,
 * - the agent-side 1–99 window rejects before the server is touched (the
 *   ACTION deliberately has no ceiling — flag-off UI for stock > 99),
 * - navigating PDP→PDP aborts the old registration before the new one,
 * - stockWarning appears when the resulting line exceeds stock.
 */

type Registration = {
  tool: WebMcpToolDescriptor;
  options: { signal?: AbortSignal } | undefined;
};

let registrations: Registration[];
let registerTool: ReturnType<typeof vi.fn>;

vi.mock("@/app/[locale]/cart/actions", () => ({
  addToCartAction: vi.fn(async (productId: string, variantId: string | null, quantity: number) => ({
    ok: true,
    added: { productId, variantId, quantity },
    cart: {
      count: quantity,
      currency: "DKK",
      items: [
        {
          cartItemId: "l1",
          productId,
          variantId,
          productName: "Espresso Blend",
          slug: "espresso-blend",
          quantity,
          maxQuantity: 25,
          unitPrice: { amountMinor: 14900, currency: "DKK", formatted: "149 kr." },
          lineTotal: { amountMinor: 14900 * quantity, currency: "DKK", formatted: "x" },
        },
      ],
      subtotal: { amountMinor: 0, currency: "DKK", formatted: "x" },
      shipping: { amountMinor: 0, currency: "DKK", formatted: "x" },
      total: { amountMinor: 0, currency: "DKK", formatted: "x" },
    },
  })),
}));

const { default: PdpWebMcpTools, PDP_WEBMCP_TOOL_BINDINGS } = await import(
  "@/components/webmcp/PdpWebMcpTools"
);
const cartActions = await import("@/app/[locale]/cart/actions");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const espresso: PdpToolProduct = {
  id: "prod-espresso",
  name: "Espresso Blend",
  slug: "espresso-blend",
  inStock: true,
  priceFormatted: "149,00 kr.",
  variants: [],
};

const grinder: PdpToolProduct = {
  id: "prod-grinder",
  name: "Hand Grinder",
  slug: "hand-grinder",
  inStock: true,
  priceFormatted: "399,00 kr.",
  variants: [
    { id: "var-steel", label: "grinder-steel (finish: steel)", priceFormatted: "449,00 kr.", stock: 2 },
  ],
};

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

async function mount(product: PdpToolProduct) {
  await act(async () => {
    root.render(<PdpWebMcpTools product={product} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("PdpWebMcpTools — the page's own add-to-cart", () => {
  it("registers exactly the bindings' tools, with the product in the description", async () => {
    await mount(espresso);
    expect(registrations.map((r) => r.tool.name)).toEqual(
      Object.keys(PDP_WEBMCP_TOOL_BINDINGS),
    );
    const d = registrations[0].tool.description;
    expect(d).toContain('"Espresso Blend"');
    expect(d).toContain("149,00 kr.");
    expect(d).not.toContain("out of stock");
  });

  it("enumerates variants as natural-language options with price and stock — and flags out-of-stock products", async () => {
    await mount({ ...grinder, inStock: false });
    const d = registrations[0].tool.description;
    // Chrome best practices: natural-language values, not internal ids —
    // the option name IS the schema value.
    expect(d).toContain('"grinder-steel (finish: steel)" — 449,00 kr. — 2 in stock');
    expect(d).not.toContain("var-steel");
    expect(d).toContain("out of stock");
    // The schema teaches the same values via an enum.
    const schema = registrations[0].tool.inputSchema as {
      properties: { variant?: { enum?: string[] } };
      required?: string[];
    };
    expect(schema.properties.variant?.enum).toEqual(["grinder-steel (finish: steel)"]);
    expect(schema.required).toEqual(["variant"]);
  });

  it("omits the variant property entirely for variant-less products (no dead parameter)", async () => {
    await mount(espresso);
    const schema = registrations[0].tool.inputSchema as {
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect("variant" in schema.properties).toBe(false);
    expect(schema.required).toBeUndefined();
  });

  it("execute forwards the PAGE's product id + input to the server action", async () => {
    await mount(grinder);
    const tool = registrations[0].tool;
    const result = (await tool.execute({ variantId: "var-steel", quantity: 2 })) as Record<string, unknown>;
    expect(cartActions.addToCartAction).toHaveBeenCalledWith("prod-grinder", "var-steel", 2);
    expect(result.status).toBe("added");
    expect(result.product).toEqual({ id: "prod-grinder", name: "Hand Grinder", slug: "hand-grinder" });
    expect(result.cart).toBeDefined();
  });

  it("REQUIRES a valid variant choice when the product has variants — no base-price lines", async () => {
    // Without this, a missing variant choice became a product-price cart line:
    // checkout charges base price and draws product-level stock instead of
    // the variant's. The server only rejects WRONG ownership, not a missing
    // choice — the requirement lives where the variant list lives.
    await mount(grinder);
    const tool = registrations[0].tool;
    const missing = (await tool.execute({ quantity: 1 })) as Record<string, unknown>;
    expect(String(missing.error)).toContain("has variants");
    expect(String(missing.error)).toContain('"grinder-steel (finish: steel)"');
    const unknown = (await tool.execute({ variant: "nope", quantity: 1 })) as Record<string, unknown>;
    expect(String(unknown.error)).toContain("Unknown variant");
    expect(cartActions.addToCartAction).not.toHaveBeenCalled();
  });

  it("accepts the natural-language option AND stays lenient about raw ids", async () => {
    await mount(grinder);
    const tool = registrations[0].tool;
    // The schema's enum value (the option name) maps to the internal id.
    const byLabel = (await tool.execute({
      variant: "grinder-steel (finish: steel)",
      quantity: 1,
    })) as Record<string, unknown>;
    expect(byLabel.status).toBe("added");
    expect(cartActions.addToCartAction).toHaveBeenLastCalledWith("prod-grinder", "var-steel", 1);
    // Lenient input handling: a raw internal id (e.g. from an older agent
    // transcript or the legacy variantId key) still resolves.
    const byLegacyKey = (await tool.execute({ variantId: "var-steel", quantity: 1 })) as Record<
      string,
      unknown
    >;
    expect(byLegacyKey.status).toBe("added");
  });

  it("rejects a quantity outside the agent window BEFORE touching the server", async () => {
    await mount(espresso);
    const tool = registrations[0].tool;
    for (const quantity of [0, -1, 100, 2.5]) {
      const result = (await tool.execute({ quantity })) as Record<string, unknown>;
      expect(result.error, String(quantity)).toBeDefined();
    }
    expect(cartActions.addToCartAction).not.toHaveBeenCalled();
  });

  it("warns honestly when the resulting line exceeds stock", async () => {
    await mount(espresso);
    const tool = registrations[0].tool;
    const result = (await tool.execute({ quantity: 50 })) as Record<string, unknown>;
    // mock line has maxQuantity 25 and quantity=input → 50 > 25
    expect(String(result.stockWarning)).toContain("only 25 are in stock");
  });

  it("PDP→PDP navigation aborts the old registration before the new one", async () => {
    await mount(espresso);
    const firstSignal = registrations[0].options?.signal;
    expect(firstSignal?.aborted).toBe(false);
    await mount(grinder); // re-render with a new product
    expect(firstSignal?.aborted).toBe(true);
    expect(registrations).toHaveLength(2);
    expect(registrations[1].tool.description).toContain('"Hand Grinder"');
  });

  it("a thrown action becomes an {error} the agent can act on", async () => {
    vi.mocked(cartActions.addToCartAction).mockRejectedValueOnce(new Error("db down"));
    await mount(espresso);
    const result = (await registrations[0].tool.execute({})) as Record<string, unknown>;
    expect(typeof result.error).toBe("string");
  });
});
