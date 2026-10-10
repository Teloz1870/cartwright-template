import { describe, expect, it } from "vitest";
import { CHAT_MODEL, MODEL_CAPABILITIES } from "@/lib/ai/client";
import { estimateCostDkk } from "@/lib/ai/usage";
import { ANTHROPIC_MODEL_OPTIONS, anthropicModelOptionsFor } from "@/lib/ai/anthropic-models";

/**
 * Every Anthropic model the admin can pick must be KNOWN to the engine.
 *
 * `getModelCapabilities()` answers an unknown id with the read-only tool tier
 * and an 8k window, without an error — so a dropdown entry (or the default)
 * missing from MODEL_CAPABILITIES turns the admin chat read-only the moment a
 * shop picks it. A missing price row meters every request as 0 kr. Both are
 * silent; this test makes them loud.
 */
const offered = [...ANTHROPIC_MODEL_OPTIONS.map((o) => o.value), CHAT_MODEL];

describe("Anthropic model ids the admin can pick", () => {
  it.each(offered)("%s has a capability row with the full tool tier", (id) => {
    expect(MODEL_CAPABILITIES[id]).toBeDefined();
    expect(MODEL_CAPABILITIES[id].tools).toBe("all");
  });

  it.each(offered)("%s has a price row (metered above 0 kr)", (id) => {
    expect(estimateCostDkk(id, 1_000_000, 1_000_000)).toBeGreaterThan(0);
  });

  it("prices the current models at their list price (USD per MTok, in/out)", () => {
    // 1M in + 1M out, USD_TO_DKK default 7.
    const usd = (id: string) => estimateCostDkk(id, 1_000_000, 1_000_000) / 7;
    expect(usd("claude-sonnet-5-5")).toBeCloseTo(2 + 10, 6);
    expect(usd("claude-opus-5-5")).toBeCloseTo(4 + 20, 6);
    expect(usd("claude-opus-4-7")).toBeCloseTo(5 + 25, 6);
  });

  it("offers the current Sonnet and Opus, not the 4.5 generation", () => {
    const ids = ANTHROPIC_MODEL_OPTIONS.map((o) => o.value);
    expect(ids).toContain("claude-sonnet-5-5");
    expect(ids).toContain("claude-opus-5-5");
    expect(ids).not.toContain("claude-sonnet-4-5");
    expect(ids).not.toContain("claude-opus-4-5");
  });
});

describe("anthropicModelOptionsFor", () => {
  it("keeps a saved model the list no longer offers, labelled as older", () => {
    const options = anthropicModelOptionsFor("claude-sonnet-4-5");
    const legacy = options.find((o) => o.value === "claude-sonnet-4-5");
    expect(legacy?.label).toMatch(/not in the current list/);
    expect(options).toHaveLength(ANTHROPIC_MODEL_OPTIONS.length + 1);
  });

  it("adds nothing for a model the list offers, or an empty value", () => {
    expect(anthropicModelOptionsFor("claude-haiku-4-5")).toHaveLength(ANTHROPIC_MODEL_OPTIONS.length);
    expect(anthropicModelOptionsFor("  ")).toHaveLength(ANTHROPIC_MODEL_OPTIONS.length);
  });

  it("never mutates the shared list", () => {
    anthropicModelOptionsFor("claude-opus-4-1");
    expect(ANTHROPIC_MODEL_OPTIONS.map((o) => o.value)).not.toContain("claude-opus-4-1");
  });
});
