// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebMcpToolDescriptor } from "@/lib/model-context";
import PlpWebMcpTools, {
  PLP_WEBMCP_TOOL_BINDINGS,
  type PlpToolCategory,
  type PlpToolFilters,
  type PlpToolProduct,
} from "@/components/webmcp/PlpWebMcpTools";

/**
 * The catalogue page's contextual tools: the page teaches the agent its own
 * filters. Pinned here:
 * - registered names === binding keys (the moat's other half),
 * - list_visible_products is read-only, zero-network, and returns exactly
 *   the server-narrowed list with locale-prefixed product urls,
 * - filter_products validates against the SERVER-derived category enum and
 *   sort whitelist BEFORE navigating, builds a locale-prefixed URL, and
 *   omits the default sort,
 * - a fresh server render (new props) re-registers with the new visible set.
 */

type Registration = {
  tool: WebMcpToolDescriptor;
  options: { signal?: AbortSignal } | undefined;
};

let registrations: Registration[];
let registerTool: ReturnType<typeof vi.fn>;
let assignSpy: ReturnType<typeof vi.fn>;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const beans: PlpToolProduct = {
  id: "p1",
  name: "Yirgacheffe",
  slug: "yirgacheffe",
  priceFormatted: "149,00 kr.",
  inStock: true,
  category: "Beans",
};
const grinder: PlpToolProduct = {
  id: "p2",
  name: "Hand Grinder",
  slug: "hand-grinder",
  priceFormatted: "399,00 kr.",
  inStock: false,
  category: null,
};
const categories: PlpToolCategory[] = [
  { slug: "beans", name: "Beans" },
  { slug: "espresso", name: "Espresso" },
];

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  registrations = [];
  registerTool = vi.fn(async (tool: WebMcpToolDescriptor, options?: { signal?: AbortSignal }) => {
    registrations.push({ tool, options });
  });
  (document as unknown as { modelContext?: unknown }).modelContext = { registerTool };
  assignSpy = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: assignSpy },
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

async function mount(
  products: PlpToolProduct[],
  filters: PlpToolFilters = {},
  totalCount = products.length,
) {
  await act(async () => {
    root.render(
      <PlpWebMcpTools
        products={products}
        totalCount={totalCount}
        categories={categories}
        filters={filters}
        locale="en"
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function tool(name: string): WebMcpToolDescriptor {
  const found = registrations.find((r) => r.tool.name === name);
  if (!found) throw new Error(`${name} not registered`);
  return found.tool;
}

describe("PlpWebMcpTools — the catalogue page teaches the agent its filters", () => {
  it("registers exactly the bindings' tools", async () => {
    await mount([beans, grinder]);
    expect(registrations.map((r) => r.tool.name)).toEqual(
      Object.keys(PLP_WEBMCP_TOOL_BINDINGS),
    );
  });

  it("list_visible_products is read-only and returns the visible set with locale-prefixed urls", async () => {
    await mount([beans, grinder], { kategori: "beans" });
    const t = tool("list_visible_products");
    expect(t.annotations?.readOnlyHint).toBe(true);
    const result = (await t.execute({})) as {
      activeFilters: Record<string, string>;
      totalCount: number;
      returnedCount: number;
      products: Array<Record<string, unknown>>;
    };
    expect(result.activeFilters).toEqual({ kategori: "beans" });
    expect(result.totalCount).toBe(2);
    expect(result.returnedCount).toBe(2);
    expect(result.products[0]).toEqual({
      id: "p1",
      name: "Yirgacheffe",
      url: "/en/product/yirgacheffe",
      price: "149,00 kr.",
      inStock: true,
      category: "Beans",
    });
    // Null category is omitted, not fabricated.
    expect("category" in result.products[1]).toBe(false);
  });

  it("reports truncation honestly when the visible set is capped", async () => {
    await mount([beans], {}, 75);
    const result = (await tool("list_visible_products").execute({})) as {
      totalCount: number;
      returnedCount: number;
    };
    expect(result.totalCount).toBe(75);
    expect(result.returnedCount).toBe(1);
    expect(tool("list_visible_products").description).toContain("first 1 returned");
  });

  it("filter_products carries the live category enum in its schema and builds a locale-prefixed URL", async () => {
    await mount([beans, grinder]);
    const t = tool("filter_products");
    const schema = t.inputSchema as {
      properties: { category: { enum?: string[] }; sort: { enum?: string[] } };
    };
    // English parameter surface (agents are English-first); the ROUTE keeps
    // its Danish query params — the mapping is pinned on the built URL below.
    expect(schema.properties.category.enum).toEqual(["beans", "espresso"]);
    expect(schema.properties.sort.enum).toEqual(["newest", "price-asc", "price-desc"]);

    const result = (await t.execute({
      category: "beans",
      minPrice: 100,
      sort: "price-asc",
    })) as Record<string, unknown>;
    expect(result.status).toBe("navigating");
    expect(result.path).toBe("/en/produkter?kategori=beans&minPris=100&sort=pris-op");
    expect(assignSpy).toHaveBeenCalledWith("/en/produkter?kategori=beans&minPris=100&sort=pris-op");
  });

  it("stays lenient about the route's own Danish keys and values", async () => {
    await mount([beans, grinder]);
    const result = (await tool("filter_products").execute({
      kategori: "beans",
      minPris: 50,
      sort: "pris-ned",
    })) as Record<string, unknown>;
    expect(result.path).toBe("/en/produkter?kategori=beans&minPris=50&sort=pris-ned");
  });

  it("rejects an unknown category and a bad sort BEFORE navigating", async () => {
    await mount([beans]);
    const t = tool("filter_products");
    const bad = (await t.execute({ category: "gear" })) as Record<string, unknown>;
    expect(bad.error).toContain('Unknown category "gear"');
    const badSort = (await t.execute({ sort: "cheapest" })) as Record<string, unknown>;
    expect(badSort.error).toContain("sort must be one of");
    const badPrice = (await t.execute({ minPrice: -5 })) as Record<string, unknown>;
    expect(badPrice.error).toContain("minPrice");
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("omits the default sort from the URL and handles no-filter input", async () => {
    await mount([beans]);
    const result = (await tool("filter_products").execute({ sort: "nyeste" })) as Record<
      string,
      unknown
    >;
    expect(result.path).toBe("/en/produkter");
  });

  it("a fresh server render re-registers with the new visible set (abort semantics)", async () => {
    await mount([beans, grinder]);
    const firstSignal = registrations[0].options?.signal;
    expect(firstSignal?.aborted).toBe(false);
    await mount([beans], { kategori: "beans" });
    expect(firstSignal?.aborted).toBe(true);
    const latest = registrations.at(-1)!.tool;
    expect(latest.name).toBe("filter_products");
    const list = registrations.at(-2)!.tool;
    const result = (await list.execute({})) as { returnedCount: number };
    expect(result.returnedCount).toBe(1);
  });
});
