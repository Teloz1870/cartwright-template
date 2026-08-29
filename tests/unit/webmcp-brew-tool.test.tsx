// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebMcpToolDescriptor } from "@/lib/model-context";
import { agentMoney } from "@/lib/format";
import BrewWebMcpTools, {
  CREMA_WEBMCP_TOOL_BINDINGS,
} from "@/designs/crema/webshop/BrewWebMcpTools";

/**
 * The first PACK-registered WebMCP tool: the homepage brew calculator's math
 * as `calculate_brew_ratio`. Pinned here: registration matches the pack's
 * declared bindings, the tool is read-only and never navigates, input windows
 * reject before computing, and the numbers are brew-math's numbers.
 *
 * It is NOT pure compute any more — it reads the catalogue through
 * `products.search` to name a coffee and count packs, which is why its binding
 * moved from [] to ["products.search"]. The moat test enforces that binding;
 * what stays true is that it mutates nothing.
 */

type Registration = {
  tool: WebMcpToolDescriptor;
  options: { signal?: AbortSignal } | undefined;
};

let registrations: Registration[];
let registerTool: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
    root.render(<BrewWebMcpTools />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("BrewWebMcpTools — the pack's own agent tool", () => {
  it("registers exactly the pack bindings' tools, read-only", async () => {
    await mount();
    expect(registrations.map((r) => r.tool.name)).toEqual(
      Object.keys(CREMA_WEBMCP_TOOL_BINDINGS),
    );
    expect(registrations[0].tool.annotations?.readOnlyHint).toBe(true);
  });

  it("computes the guide's recipe — same numbers as the visible calculator", async () => {
    // No fetch is stubbed here, so catalogue resolution fails and the result
    // is the recipe alone. That is asserted deliberately: these two cases pin
    // the BACKWARDS-COMPATIBLE shape, and they would otherwise pass for the
    // accidental reason that the test environment has no network.
    await mount();
    const tool = registrations[0].tool;
    expect(await tool.execute({ cups: 2 })).toEqual({
      strength: "balanced",
      cups: 2,
      ratio: "1:16",
      coffeeGrams: 25,
      waterGrams: 400,
    });
    expect(await tool.execute({ cups: 4, strength: "strong" })).toEqual({
      strength: "strong",
      cups: 4,
      ratio: "1:15",
      coffeeGrams: 53,
      waterGrams: 800,
    });
  });

  it("rejects out-of-window cups and unknown strengths before computing", async () => {
    await mount();
    const tool = registrations[0].tool;
    for (const cups of [0, 13, 2.5, "two"]) {
      const result = (await tool.execute({ cups })) as Record<string, unknown>;
      expect(result.error, String(cups)).toContain("cups");
    }
    const bad = (await tool.execute({ cups: 2, strength: "ristretto" })) as Record<
      string,
      unknown
    >;
    expect(bad.error).toContain("strength");
  });

  it("unmount aborts the registration (spec teardown semantics)", async () => {
    await mount();
    const signal = registrations[0].options?.signal;
    expect(signal?.aborted).toBe(false);
    act(() => root.unmount());
    expect(signal?.aborted).toBe(true);
  });
});

/**
 * The resolve half. `calculate_brew_ratio` still returns the recipe on its own
 * — that shape is pinned above — and adds `recommendation` when the catalogue
 * can answer. It performs NO mutation: the recommendation names a product and
 * links to it, and the buying happens with the product page's own tool. That
 * keeps the surface's promise that an agent only ever sees the tools which
 * make sense on the page it is on.
 */
describe("BrewWebMcpTools — resolving the recipe to a product", () => {
  const catalogue = (products: unknown[]) =>
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ products }), { status: 200 }),
    );

  /**
   * The row the route ACTUALLY emits for `?locale=en`, not a plausible-looking
   * one. The previous fixture hardcoded `formatted: "149,00 kr."` while the
   * test put the page on /en — a string no English response ever contains —
   * and that single lie hid a real defect: the subtotal really was rendered in
   * Danish beside an English unit price. `agentMoney` is the route's own
   * formatter, so the fixture cannot drift from it again.
   */
  const ETHIOPIA = {
    title: "Ethiopia Yirgacheffe",
    url: "https://shop.test/en/product/ethiopia-yirgacheffe",
    slug: "ethiopia-yirgacheffe",
    description: "Bright, floral single-origin. Best brewed as pour-over.",
    price: 14900,
    currency: "DKK",
    unitPrice: agentMoney(14900, "en"),
    inStock: true,
    packSizeGrams: 250,
  };

  afterEach(() => vi.unstubAllGlobals());

  it("writes both prices in ONE currency spelling", async () => {
    // The bug this pins lived in the CALLER, not the module: the tool passed a
    // hand-rolled `toFixed(2) + currency` as the formatter, so a single item
    // carried unitPrice "149,00 kr." beside subtotal "149.00 DKK". A module
    // test could not see it — the module formats with whatever it is handed.
    // So the assertion belongs here, on the tool's real output.
    window.history.replaceState({}, "", "/en");
    vi.stubGlobal("fetch", catalogue([ETHIOPIA]));
    await mount();

    const result = (await registrations[0].tool.execute({
      cups: 10,
      strength: "bright",
    })) as Record<string, unknown>;
    const item = (result.recommendation as { items: Array<Record<string, unknown>> })
      .items[0];
    const unit = item.unitPrice as { formatted: string };
    const subtotal = item.subtotal as { formatted: string };

    // Same currency symbol/code, same decimal separator. Comparing the
    // non-digit skeleton catches "kr." vs "DKK" and "," vs "." at once, and
    // stays true whatever the amounts are.
    const skeleton = (s: string) => s.replace(/[\d\u00a0\s]/g, "");
    expect(skeleton(subtotal.formatted)).toBe(skeleton(unit.formatted));
  });

  it("answers the owner's prompt: ten cups, bright, one bag", async () => {
    window.history.replaceState({}, "", "/en");
    vi.stubGlobal("fetch", catalogue([ETHIOPIA]));
    await mount();

    const result = (await registrations[0].tool.execute({
      cups: 10,
      strength: "bright",
    })) as Record<string, unknown>;

    // The recipe is untouched.
    expect(result).toMatchObject({ cups: 10, coffeeGrams: 118, waterGrams: 2000 });

    const rec = result.recommendation as {
      items: Array<Record<string, unknown>>;
    };
    expect(rec.items).toHaveLength(1);
    expect(rec.items[0]).toMatchObject({
      title: "Ethiopia Yirgacheffe",
      requiredGrams: 118,
      quantity: 1,
      remainingGrams: 132,
      inStock: true,
      url: "/en/product/ethiopia-yirgacheffe",
    });
    expect(rec.items[0].unitPrice).toEqual({
      amountMinor: 14900,
      currency: "DKK",
      // Taken from the route's `unitPrice`, not rebuilt from the bare number —
      // that fallback produced the literal string "14900", which is the exact
      // ambiguity this shape exists to remove.
      //
      // ENGLISH, because the page is /en. This assertion used to read
      // "149,00 kr." — on an English page — and it was the second half of the
      // fixture's lie: a hand-typed expectation agreeing with a hand-typed
      // input, neither of them the route's behaviour.
      formatted: agentMoney(14900, "en").formatted,
    });
    // The subtotal is computed HERE, so it is the one that could disagree.
    expect((rec.items[0].subtotal as { formatted: string }).formatted).toBe(
      agentMoney(14900, "en").formatted,
    );
    // And it must not be the Danish rendering — the assertion above would
    // still pass if agentMoney ignored its locale argument entirely.
    expect((rec.items[0].subtotal as { formatted: string }).formatted).not.toBe(
      agentMoney(14900, "da").formatted,
    );
  });

  it("speaks DANISH on a Danish page — the same code, the other way", async () => {
    // The mirror case. Without it, "renders in English" could be satisfied by
    // hardcoding English, which would be the same bug pointing the other way
    // for the Danish canaries.
    window.history.replaceState({}, "", "/da");
    vi.stubGlobal(
      "fetch",
      catalogue([{ ...ETHIOPIA, unitPrice: agentMoney(14900, "da") }]),
    );
    await mount();

    const result = (await registrations[0].tool.execute({
      cups: 10,
      strength: "bright",
    })) as Record<string, unknown>;
    const item = (result.recommendation as { items: Array<Record<string, unknown>> })
      .items[0];

    expect((item.subtotal as { formatted: string }).formatted).toBe(
      agentMoney(14900, "da").formatted,
    );
    expect(item.url).toBe("/da/product/ethiopia-yirgacheffe");
  });

  it("searches by the STRENGTH word, so the shop's own copy decides", async () => {
    // Not a title match and not a hardcoded slug: "bright" finds the coffee
    // that describes itself as bright.
    window.history.replaceState({}, "", "/en");
    const fetchMock = catalogue([ETHIOPIA]);
    vi.stubGlobal("fetch", fetchMock);
    await mount();

    await registrations[0].tool.execute({ cups: 4, strength: "bright" });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("q=bright");
    expect(url).toContain("locale=en");
  });

  it("keeps the recipe when the catalogue is unreachable", async () => {
    // A shop-side hiccup must not cost the caller the maths it asked for.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await mount();

    const result = await registrations[0].tool.execute({ cups: 2 });
    expect(result).toEqual({
      strength: "balanced",
      cups: 2,
      ratio: "1:16",
      coffeeGrams: 25,
      waterGrams: 400,
    });
  });

  it("keeps the recipe when the catalogue has no match", async () => {
    vi.stubGlobal("fetch", catalogue([]));
    await mount();

    const result = (await registrations[0].tool.execute({ cups: 2 })) as Record<
      string,
      unknown
    >;
    expect(result.recommendation).toBeUndefined();
    expect(result).toMatchObject({ coffeeGrams: 25 });
  });

  it("registers no mutation tool — the buying stays on the product page", async () => {
    await mount();
    const names = registrations.map((r) => r.tool.name);
    expect(names).toEqual(["calculate_brew_ratio"]);
    // The surface's thesis, asserted rather than assumed.
    expect(names.some((n) => /add|cart|checkout|order/i.test(n))).toBe(false);
    expect(registrations[0].tool.annotations?.readOnlyHint).toBe(true);
  });
});
