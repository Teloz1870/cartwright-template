// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebMcpToolDescriptor } from "@/lib/model-context";
import BrewWebMcpTools, {
  CREMA_WEBMCP_TOOL_BINDINGS,
} from "@/designs/crema/webshop/BrewWebMcpTools";

/**
 * The first PACK-registered WebMCP tool: the homepage brew calculator's math
 * as `calculate_brew_ratio`. Pinned here: registration matches the pack's
 * declared bindings, the tool is read-only pure compute (no network, no
 * navigation), input windows reject before computing, and the numbers are
 * brew-math's numbers.
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
