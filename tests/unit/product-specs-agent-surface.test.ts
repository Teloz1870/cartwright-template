import { describe, expect, it } from "vitest";

import { getTool } from "@/lib/tools/registry";

/**
 * The agent surface must be able to write what the admin can.
 *
 * `lib/tools/products.ts` declared `attributes: z.record(z.string(), z.string())`
 * with no reserved-key guard, so `/api/v1/tools/products.create` (and `.update`,
 * which reuses the same shape via `createShape.partial()`) was the ONE write
 * path that could not store the engine's own coffee seed — while the admin form
 * and the CSV importer both could. An engine sold on being agent-buildable had
 * its agent surface as the narrowest door in the building.
 *
 * These tests drive the REAL tool's input schema, not a copy of the rule.
 */
const CREATE = {
  name: "Ethiopia Yirgacheffe",
  slug: "ethiopia-yirgacheffe",
  description: "A bright, floral washed Yirgacheffe.",
  priceDkk: 13900,
  stock: 10,
};

function parseCreate(attributes: unknown) {
  const tool = getTool("products.create");
  if (!tool) throw new Error("products.create is not registered");
  return tool.input.safeParse({ ...CREATE, attributes });
}

describe("products.create — the agent may author the same specs as the admin", () => {
  it("accepts the engine's own coffee seed", () => {
    // industry-templates/coffee/seed-data.ts, verbatim shape.
    const result = parseCreate({
      origin: "Ethiopia",
      process: "Washed",
      roast: 2,
      notes: ["bergamot", "jasmine", "lemon"],
      weightG: 250,
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["a number", { roast: 2 }],
    ["a boolean", { organic: true }],
    ["a list of strings", { notes: ["bergamot", "jasmine"] }],
    ["a list of numbers", { grindSizes: [1, 2, 3] }],
    ["plain text, as before", { origin: "Ethiopia" }],
  ])("accepts %s", (_label, attributes) => {
    expect(parseCreate(attributes).success).toBe(true);
  });

  it.each([
    ["a nested object — every reader assumes a flat map", { dimensions: { w: 10 } }],
    ["a list of objects", { notes: [{ v: "bergamot" }] }],
    ["null", { origin: null }],
  ])("still rejects %s", (_label, attributes) => {
    expect(parseCreate(attributes).success).toBe(false);
  });

  it("refuses a reserved key the admin form has always refused", () => {
    // Build it the way it actually arrives: an object LITERAL `{__proto__: x}`
    // sets the prototype and leaves zero own keys (measured: Object.keys → []),
    // so a literal here would pass while proving nothing. JSON.parse keeps it as
    // an OWN property — which is exactly how it reaches a JSON tool argument,
    // and why every reader's Object.entries would then iterate it.
    const viaWire = JSON.parse('{"__proto__": "x", "origin": "Ethiopia"}');
    expect(Object.keys(viaWire)).toContain("__proto__");
    expect(parseCreate(viaWire).success).toBe(false);
    // There was NO key guard on this surface at all before this change.
  });

  it("update inherits the rule (its patch reuses the create shape)", () => {
    const tool = getTool("products.update");
    if (!tool) throw new Error("products.update is not registered");
    expect(
      tool.input.safeParse({
        slug: "ethiopia-yirgacheffe",
        patch: { attributes: { roast: 2 } },
      }).success,
    ).toBe(true);
    expect(
      tool.input.safeParse({
        slug: "ethiopia-yirgacheffe",
        patch: { attributes: { d: { w: 1 } } },
      }).success,
    ).toBe(false);
  });

  it("the tool's own example teaches the wider contract", () => {
    // An agent reads the description before it reads our tests. A string-only
    // example is a string-only contract in practice.
    const tool = getTool("products.create");
    const shown = JSON.stringify(tool?.examples ?? tool?.description ?? "");
    expect(shown).toMatch(/capacityMl|dishwasherSafe|glazes/);
  });
});
