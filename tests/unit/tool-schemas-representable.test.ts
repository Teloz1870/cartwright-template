import { describe, expect, it } from "vitest";

import { getTool, listTools } from "@/lib/tools/registry";
import { zodInputJsonSchema } from "@/lib/zod-json-schema";

/**
 * A tool's input schema is a PUBLISHED contract: `/api/v1/tools?schema=true`,
 * MCP `tools/list`, `/api/registry` and the admin-chat tool table all convert
 * it to JSON Schema. `lib/zod-json-schema.ts` fails soft to `{}` so one
 * pathological schema cannot break discovery — which means an unrepresentable
 * field does not crash, it publishes an EMPTY contract and a cold agent simply
 * cannot discover the shape.
 *
 * Nothing in the suite tested that, so a `z.custom` in `products.create` passed
 * 4096 tests while blanking the attributes contract. This is the gate.
 */
describe("every registered tool publishes a real input contract", () => {
  it.each(listTools().map((t) => [t.name, t] as const))("%s converts to JSON Schema", (name, tool) => {
    const js = zodInputJsonSchema(tool.input) as {
      type?: string;
      properties?: Record<string, unknown>;
    };
    // `{}` is the soft-fail sentinel: conversion threw.
    expect(Object.keys(js), `${name} produced the empty soft-fail schema`).not.toHaveLength(0);
    expect(js.type, `${name} should convert to an object schema`).toBe("object");
  });

  it("products.create publishes the attributes shape, not an empty object", () => {
    const tool = getTool("products.create");
    const js = zodInputJsonSchema(tool!.input) as {
      properties?: Record<string, Record<string, unknown>>;
    };
    const attributes = js.properties?.attributes;
    expect(attributes).toBeDefined();
    // A `z.custom` here degrades to `{}` under `unrepresentable: "any"` — the
    // agent is told nothing about what it may send.
    expect(
      Object.keys(attributes as Record<string, unknown>).length,
      "attributes must describe itself, not degrade to {}",
    ).toBeGreaterThan(0);
    expect(JSON.stringify(attributes)).toContain("object");
  });

  it("products.create publishes the VALUE shape, not `any JSON value`", () => {
    // `z.record(z.string(), z.unknown())` converts to `additionalProperties: {}`
    // — which is LESS precise than what origin/main published
    // (`{"type":"string"}`) and actively misleading: it advertises nested
    // objects and null, both of which the runtime refuses. A representable
    // schema is not the same as an informative one.
    // products.update is shaped `{ slug, patch: { …createShape.partial() } }`,
    // so its attributes live one level down. Looking only at the root made the
    // update half of this assertion pass on a schema that published nothing.
    const attributesOf = (name: string) => {
      const js = zodInputJsonSchema(getTool(name)!.input) as {
        properties?: Record<string, { properties?: Record<string, unknown> } & Record<string, unknown>>;
      };
      return js.properties?.attributes ?? js.properties?.patch?.properties?.attributes;
    };
    for (const name of ["products.create", "products.update"]) {
      const found = attributesOf(name);
      expect(found, `${name} publishes no attributes schema at all`).toBeDefined();
      const full = { properties: { attributes: found } } as {
        properties?: { attributes?: Record<string, unknown> };
      };
      // Grep the ATTRIBUTES subtree, not the whole schema: `name`, `featured`
      // and `images` supply "string"/"boolean"/"array" for free, so a
      // whole-document grep passes even after the array branch is dropped from
      // the published union.
      const attrs = JSON.stringify(full.properties?.attributes ?? {});
      expect(attrs, `${name} publishes no attributes schema`).not.toBe("{}");
      expect(
        /"additionalProperties":\{\}/.test(attrs),
        `${name} publishes an unconstrained attribute value`,
      ).toBe(false);
      // Assert each BRANCH of the value union separately. Two traps make a
      // whole-node grep useless here: `propertyNames: {"type":"string"}`
      // describes the KEY, and the array branch's `items` mentions every scalar
      // again — so "does the JSON contain 'string'" stays true even after
      // z.string() is dropped from the scalar branch.
      const value = (found as { additionalProperties?: Record<string, unknown> })
        .additionalProperties;
      expect(value, `${name} publishes no attribute value schema`).toBeDefined();
      const branches = (value?.anyOf as Record<string, unknown>[] | undefined) ?? [value!];
      const arrayBranch = branches.find((b) => b.type === "array");
      const scalarBranch = branches.find((b) => b.type !== "array");
      expect(arrayBranch, `${name} should advertise LIST attribute values`).toBeDefined();
      expect(scalarBranch, `${name} should advertise scalar attribute values`).toBeDefined();
      for (const t of ["string", "number", "boolean"]) {
        expect(JSON.stringify(scalarBranch), `${name}: scalar branch must advertise ${t}`).toContain(t);
        expect(
          JSON.stringify(arrayBranch?.items),
          `${name}: list items must advertise ${t}`,
        ).toContain(t);
      }
    }
  });
});
