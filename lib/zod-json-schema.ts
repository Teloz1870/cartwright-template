import { z } from "zod";

/**
 * Convert a Zod schema to JSON Schema for tool/section DISCOVERY (the INPUT
 * contract an agent must satisfy to call a tool / fill a section).
 *
 * Uses Zod v4's NATIVE `z.toJSONSchema`. The repo previously used
 * `zod-to-json-schema@3`, whose type-signature is bound to Zod v3 — against a
 * v4 schema it silently returns an empty `{ "$schema": … }`, so `?schema=true`,
 * MCP `tools/list`, and the public `/api/registry` were all serving EMPTY
 * contracts (a cold agent couldn't discover any param shapes).
 *
 *  - `io: "input"`            → the pre-transform/pre-default input shape
 *                               (default-bearing fields show their default and
 *                               are not listed as `required`).
 *  - `unrepresentable: "any"` → degrade exotic types (`z.date()`, `z.bigint()`)
 *                               to `{}` instead of throwing, so one field can
 *                               never blank out a whole tool's schema.
 *
 * Fails soft to `{}` so a single pathological schema can't break discovery.
 */
export function zodInputJsonSchema(schema: unknown): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema as z.ZodType, {
      io: "input",
      unrepresentable: "any",
    }) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Convert the serialized result contract of a tool to JSON Schema. */
export function zodOutputJsonSchema(schema: unknown): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema as z.ZodType, {
      io: "output",
      unrepresentable: "any",
    }) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Keys present in a JSON-Schema (draft-2020-12) document that Google Gemini's
// FunctionDeclaration `parameters` (an OpenAPI-3.0 Schema subset) rejects.
const GEMINI_INCOMPATIBLE_KEYS = new Set(["$schema", "$id", "$defs", "additionalProperties", "default"]);

/**
 * Like {@link zodInputJsonSchema} but recursively stripped down to the
 * OpenAPI-3.0 subset accepted by Gemini function-calling `parameters`
 * (no `$schema`/`$id`/`$defs`/`additionalProperties`/`default`). Best-effort:
 * simple object schemas (the tool inputs we expose) convert cleanly.
 */
export function zodGeminiParameters(schema: unknown): Record<string, unknown> {
  return stripForGemini(zodInputJsonSchema(schema)) as Record<string, unknown>;
}

function stripForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripForGemini);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (GEMINI_INCOMPATIBLE_KEYS.has(key)) continue;
      out[key] = stripForGemini(value);
    }
    return out;
  }
  return node;
}
